import { File, UploadType } from 'expo-file-system';
import { UploadPhotoMetadata } from '@acceptance/shared';
import type { ApiClient } from '../../lib/api/client';
import { UploadResultDto } from '../../lib/api/schemas';
import { parseApiError, type AuthSession } from '../auth/session';
import type { QueueItem } from './queue-store';
import type { RemoteOutcome } from './retry-policy';

const UPLOAD_TIMEOUT_MS = 180_000;

/** Metadata part of POST /photos, validated with the shared contract before sending. */
export function uploadMetadata(item: QueueItem) {
  return UploadPhotoMetadata.safeParse({
    clientUuid: item.clientUuid,
    visitId: item.visitId,
    category: item.category,
    capturedAt: item.capturedAt,
    gps: item.gps ? { lat: item.gps.lat, lng: item.gps.lng, ...(item.gps.accuracy != null ? { accuracy: Math.min(item.gps.accuracy, 100000) } : {}) } : undefined,
    deviceInfo: item.deviceInfo,
    fixesPhotoId: item.fixesPhotoId ?? undefined,
  });
}

/**
 * Streams the photo file natively (multipart: `metadata` JSON + `file`), so large photos never pass
 * through the JS heap. Idempotent on the server by clientUuid.
 */
export function createPhotoUploader(api: ApiClient, session: AuthSession) {
  const upload = async (item: QueueItem, retried = false): Promise<RemoteOutcome<{ photoId: string }>> => {
    const meta = uploadMetadata(item);
    if (!meta.success) return { kind: 'http', status: 400, code: 'LOCAL_VALIDATION', message: meta.error.issues[0]?.message ?? 'invalid metadata' };
    const token = await session.accessToken();
    if (!token) return { kind: 'auth', message: 'not signed in' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    let res: { status: number; body: string };
    try {
      res = await new File(item.fileUri).upload(api.url('/photos'), {
        httpMethod: 'POST',
        uploadType: UploadType.MULTIPART,
        fieldName: 'file',
        mimeType: 'image/jpeg',
        parameters: { metadata: JSON.stringify(meta.data) },
        headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (err) {
      return { kind: 'network', message: err instanceof Error ? err.message : String(err) };
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 && !retried) {
      const r = await session.refresh();
      if (r === 'ok') return upload(item, true);
      return r === 'auth' ? { kind: 'auth', message: 'session expired' } : { kind: 'network', message: 'token refresh failed' };
    }
    const body = safeJson(res.body);
    if (res.status === 200 || res.status === 201) {
      const parsed = UploadResultDto.safeParse(body);
      if (!parsed.success) return { kind: 'http', status: 502, message: 'unexpected upload response' };
      return { kind: 'ok', value: { photoId: parsed.data.photo.id } };
    }
    if (res.status === 401) return { kind: 'auth', message: 'not signed in' };
    const e = parseApiError(body);
    return { kind: 'http', status: res.status, code: e.code, message: e.message };
  };
  return upload;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
