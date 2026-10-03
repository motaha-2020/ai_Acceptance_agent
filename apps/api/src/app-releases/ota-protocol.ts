import { createPrivateKey, createSign, randomBytes, type KeyObject } from 'node:crypto';

/**
 * Pure helpers for the expo-updates protocol v1 (self-hosted update server).
 * Spec: https://docs.expo.dev/technical-specs/expo-updates-1/ ; behaviour cross-checked against
 * expo-updates 57 (android/.../loader/FileDownloader.kt, codesigning/*.kt):
 *  - response is multipart/mixed with a `manifest` (or `directive`) part and an `extensions` part;
 *  - the part header `expo-signature` is a structured-field dictionary `sig="<b64>", keyid="<id>"`;
 *  - the signature is RSA PKCS#1 v1.5 + SHA-256 over the exact part body bytes;
 *  - 204 + `expo-protocol-version: 1` means "no update".
 */

export interface StoredOtaAsset {
  key: string;
  hash: string;
  contentType: string;
  fileExtension?: string;
  storageKey: string;
}

export interface OtaUpdateRecord {
  id: string;
  createdAt: Date;
  runtimeVersion: string;
  channel: string;
  message: string | null;
  isCritical: boolean;
  launchAsset: StoredOtaAsset;
  assets: StoredOtaAsset[];
  expoClient: Record<string, unknown> | null;
}

export interface ManifestAsset {
  key: string;
  hash: string;
  contentType: string;
  fileExtension?: string;
  url: string;
}

export interface ExpoManifest {
  id: string;
  createdAt: string;
  runtimeVersion: string;
  launchAsset: ManifestAsset;
  assets: ManifestAsset[];
  metadata: Record<string, string>;
  extra: {
    expoClient?: Record<string, unknown>;
    /** Read by the app: apply immediately instead of on next start. */
    critical: boolean;
    message?: string;
    channel: string;
  };
}

export type UrlSigner = (storageKey: string) => Promise<string>;

/** Build the manifest for an update; asset URLs are freshly signed for every request. */
export async function buildManifest(update: OtaUpdateRecord, signUrl: UrlSigner): Promise<ExpoManifest> {
  const toAsset = async (a: StoredOtaAsset): Promise<ManifestAsset> => ({
    key: a.key,
    hash: a.hash,
    contentType: a.contentType,
    ...(a.fileExtension ? { fileExtension: a.fileExtension } : {}),
    url: await signUrl(a.storageKey),
  });
  return {
    id: update.id,
    createdAt: update.createdAt.toISOString(),
    runtimeVersion: update.runtimeVersion,
    launchAsset: await toAsset(update.launchAsset),
    assets: await Promise.all(update.assets.map(toAsset)),
    metadata: {},
    extra: {
      ...(update.expoClient ? { expoClient: update.expoClient } : {}),
      critical: update.isCritical,
      ...(update.message ? { message: update.message } : {}),
      channel: update.channel,
    },
  };
}

export interface RollBackToEmbeddedDirective {
  type: 'rollBackToEmbedded';
  parameters: { commitTime: string };
}

export function rollBackToEmbeddedDirective(commitTime: Date): RollBackToEmbeddedDirective {
  return { type: 'rollBackToEmbedded', parameters: { commitTime: commitTime.toISOString() } };
}

export function loadSigningKey(pem: string): KeyObject {
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== 'rsa') throw new Error('OTA signing key must be an RSA private key');
  return key;
}

/** RSA-SHA256 (PKCS#1 v1.5) signature, base64. */
export function signBody(body: string, key: KeyObject): string {
  return createSign('RSA-SHA256').update(body, 'utf8').sign(key, 'base64');
}

/** `sig="...", keyid="..."` (RFC 8941 dictionary of strings; base64 never needs escaping). */
export function signatureHeader(signature: string, keyId: string): string {
  return `sig="${signature}", keyid="${keyId.replace(/["\\]/g, '')}"`;
}

/** Parse the `expo-expect-signature` request header, e.g. `sig, keyid="main", alg="rsa-v1_5-sha256"`. */
export function parseExpectSignature(header: string | undefined): { keyId?: string; alg?: string } | null {
  if (!header) return null;
  const out: { keyId?: string; alg?: string } = {};
  for (const member of header.split(',')) {
    const [rawName, ...rest] = member.trim().split('=');
    const value = rest.join('=').trim().replace(/^"(.*)"$/, '$1');
    if (rawName === 'keyid') out.keyId = value;
    if (rawName === 'alg') out.alg = value;
  }
  return out;
}

export interface MultipartPart {
  name: 'manifest' | 'directive' | 'extensions' | 'certificate_chain';
  body: string;
  contentType: string;
  headers?: Record<string, string>;
}

export function newBoundary(): string {
  return `expo-${randomBytes(12).toString('hex')}`;
}

/** Serialize parts as multipart/mixed (CRLF line endings, as OkHttp's MultipartReader expects). */
export function serializeMultipart(parts: MultipartPart[], boundary: string): Buffer {
  const chunks: string[] = [];
  for (const p of parts) {
    chunks.push(`--${boundary}\r\n`);
    chunks.push(`content-disposition: form-data; name="${p.name}"\r\n`);
    chunks.push(`content-type: ${p.contentType}\r\n`);
    for (const [k, v] of Object.entries(p.headers ?? {})) chunks.push(`${k}: ${v}\r\n`);
    chunks.push('\r\n');
    chunks.push(p.body);
    chunks.push('\r\n');
  }
  chunks.push(`--${boundary}--\r\n`);
  return Buffer.from(chunks.join(''), 'utf8');
}

/** Minimal multipart parser (tests and diagnostics). */
export function parseMultipart(body: Buffer | string, boundary: string): Array<{ headers: Record<string, string>; body: string }> {
  const text = typeof body === 'string' ? body : body.toString('utf8');
  const out: Array<{ headers: Record<string, string>; body: string }> = [];
  for (const raw of text.split(`--${boundary}`)) {
    if (raw.startsWith('--') || raw.trim() === '') continue;
    const part = raw.replace(/^\r\n/, '').replace(/\r\n$/, '');
    const sep = part.indexOf('\r\n\r\n');
    if (sep < 0) continue;
    const headers: Record<string, string> = {};
    for (const line of part.slice(0, sep).split('\r\n')) {
      const i = line.indexOf(':');
      if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
    out.push({ headers, body: part.slice(sep + 4) });
  }
  return out;
}

export interface SignedPartsInput {
  kind: 'manifest' | 'directive';
  payload: unknown;
  key: KeyObject | null;
  keyId: string;
}

/** Manifest/directive part (+ empty extensions part) with an `expo-signature` when a key is configured. */
export function buildUpdateParts({ kind, payload, key, keyId }: SignedPartsInput): MultipartPart[] {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {};
  if (key) headers['expo-signature'] = signatureHeader(signBody(body, key), keyId);
  return [
    { name: kind, body, contentType: 'application/json; charset=utf-8', headers },
    { name: 'extensions', body: JSON.stringify({ assetRequestHeaders: {} }), contentType: 'application/json' },
  ];
}
