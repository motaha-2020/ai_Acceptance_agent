import { createHash, createVerify, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppReleaseDto } from '@acceptance/shared';
import type { ObjectStorage } from '@acceptance/storage';
import { parseMultipart } from '../src/app-releases/ota-protocol.js';
import { STORAGE } from '../src/core/tokens.js';
import { ADMIN, startHarness, type Harness } from './harness.js';

/**
 * Mobile distribution over HTTP against real PostgreSQL:
 * APK release registration -> public latest/download -> unpublish rollback;
 * OTA publish -> signed manifest -> rollback to earlier update / embedded -> 204 when nothing.
 */
let h: Harness;
let admin: string;
let tech: { id: string; token: string };
let storage: ObjectStorage;
let keyDir: string;
let publicKeyPem: string;

const b64url = (buf: Buffer) => buf.toString('base64url');

async function putObject(key: string, content: string, contentType = 'application/octet-stream') {
  const data = Buffer.from(content);
  await storage.put(key, data, { contentType });
  return { sha256: createHash('sha256').update(data).digest('hex'), hash: b64url(createHash('sha256').update(data).digest()), size: data.length };
}

beforeAll(async () => {
  keyDir = await mkdtemp(path.join(os.tmpdir(), 'ota-key-'));
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const keyPath = path.join(keyDir, 'private-key.pem');
  await writeFile(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  h = await startHarness({ OTA_PRIVATE_KEY_PATH: keyPath });
  admin = (await h.login(ADMIN.email, ADMIN.password)).accessToken;
  tech = await h.createUser(admin, 'technician');
  storage = h.app.get<ObjectStorage>(STORAGE);
});

afterAll(async () => {
  await h?.close();
  await rm(keyDir, { recursive: true, force: true }).catch(() => undefined);
});

describe('APK releases', () => {
  let first: AppReleaseDto;
  let second: AppReleaseDto;

  it('has no latest release before anything is published', async () => {
    const res = await h.request({ method: 'GET', url: '/api/v1/app/releases/latest?channel=staging' });
    expect(res.status).toBe(404);
  });

  it('only admins can register releases', async () => {
    const obj = await putObject('app-releases/android/test-1.apk', 'apk-bytes-1');
    const body = { channel: 'production', version: '1.0.0', versionCode: 1001, runtimeVersion: '1.0.0', apkKey: 'app-releases/android/test-1.apk', apkSha256: obj.sha256, apkSizeBytes: obj.size };
    expect((await h.request({ method: 'POST', url: '/api/v1/app/releases', token: tech.token, body })).status).toBe(403);
    expect((await h.request({ method: 'POST', url: '/api/v1/app/releases', body })).status).toBe(401);
    const res = await h.request({ method: 'POST', url: '/api/v1/app/releases', token: admin, body: { ...body, notes: 'First field build' } });
    expect(res.status).toBe(201);
    first = res.json<AppReleaseDto>();
    expect(first).toMatchObject({ version: '1.0.0', versionCode: 1001, minSupportedVersionCode: 1001, minSupportedVersion: '1.0.0', changelog: 'First field build', sha256: obj.sha256, sizeBytes: obj.size });
    expect(first.downloadUrl).toBe(`http://api.test/api/v1/app/releases/${first.id}/download`);
  });

  it('rejects unknown objects, non-increasing version codes and bad keys', async () => {
    const base = { channel: 'production', version: '1.0.1', runtimeVersion: '1.0.0', apkSha256: 'a'.repeat(64), apkSizeBytes: 10 };
    expect((await h.request({ method: 'POST', url: '/api/v1/app/releases', token: admin, body: { ...base, versionCode: 1002, apkKey: 'app-releases/android/missing.apk' } })).json<{ error: { code: string } }>().error.code).toBe('APK_NOT_FOUND');
    expect((await h.request({ method: 'POST', url: '/api/v1/app/releases', token: admin, body: { ...base, versionCode: 1001, apkKey: 'app-releases/android/test-1.apk' } })).status).toBe(409);
    expect((await h.request({ method: 'POST', url: '/api/v1/app/releases', token: admin, body: { ...base, versionCode: 1003, apkKey: 'photos/../x.apk' } })).status).toBe(400);
  });

  it('serves the newest published release publicly (and on the web alias)', async () => {
    const obj = await putObject('app-releases/android/test-2.apk', 'apk-bytes-2');
    second = (
      await h.request({
        method: 'POST',
        url: '/api/v1/app/releases',
        token: admin,
        body: { channel: 'production', version: '1.1.0', versionCode: 1010, runtimeVersion: '1.1.0', apkKey: 'app-releases/android/test-2.apk', apkSha256: obj.sha256, apkSizeBytes: obj.size, minSupportedVersionCode: 1010, isCritical: true },
      })
    ).json<AppReleaseDto>();
    expect(second.minSupportedVersion).toBe('1.1.0');

    const latest = await h.request({ method: 'GET', url: '/api/v1/app/releases/latest?channel=production' });
    expect(latest.status).toBe(200);
    expect(latest.json<AppReleaseDto>()).toMatchObject({ id: second.id, versionCode: 1010, minSupportedVersionCode: 1010, isCritical: true });
    const alias = await h.request({ method: 'GET', url: '/api/v1/app-releases/latest' });
    expect(alias.json<AppReleaseDto>().id).toBe(second.id);
  });

  it('download links redirect to a signed URL that returns the APK bytes', async () => {
    const res = await h.request({ method: 'GET', url: `/api/v1/app/releases/${second.id}/download` });
    expect(res.status).toBe(302);
    const server = h.app.getHttpAdapter().getInstance();
    const location = (await server.inject({ method: 'GET', url: `/api/v1/app/releases/${second.id}/download` })).headers.location as string;
    expect(location).toContain('/files/app-releases/android/test-2.apk');
    const file = await server.inject({ method: 'GET', url: location.replace('http://api.test', '') });
    expect(file.statusCode).toBe(200);
    expect(createHash('sha256').update(file.rawPayload).digest('hex')).toBe(second.sha256);
    expect(String(file.headers['content-disposition'])).toContain('acceptance-field-1.1.0-1010.apk');

    const latest = await server.inject({ method: 'GET', url: '/api/v1/app/releases/latest/download?channel=production' });
    expect(latest.statusCode).toBe(302);
  });

  it('unpublishing rolls "latest" back to the previous build; publish restores it', async () => {
    expect((await h.request({ method: 'POST', url: `/api/v1/app/releases/${second.id}/unpublish`, token: admin })).status).toBe(200);
    expect((await h.request({ method: 'GET', url: '/api/v1/app/releases/latest' })).json<AppReleaseDto>().id).toBe(first.id);
    expect((await h.request({ method: 'GET', url: `/api/v1/app/releases/${second.id}/download` })).status).toBe(404);
    await h.request({ method: 'POST', url: `/api/v1/app/releases/${second.id}/publish`, token: admin });
    expect((await h.request({ method: 'GET', url: '/api/v1/app/releases/latest' })).json<AppReleaseDto>().id).toBe(second.id);
  });

  it('admin can raise the minimum supported build', async () => {
    const res = await h.request({ method: 'PATCH', url: `/api/v1/app/releases/${first.id}`, token: admin, body: { minSupportedVersionCode: 1001 } });
    expect(res.status).toBe(200);
    expect((await h.request({ method: 'PATCH', url: `/api/v1/app/releases/${first.id}`, token: admin, body: { minSupportedVersionCode: 5000 } })).status).toBe(400);
    const list = await h.request({ method: 'GET', url: '/api/v1/app/releases', token: admin });
    expect(list.json<AppReleaseDto[]>().map((r) => r.versionCode)).toEqual(expect.arrayContaining([1001, 1010]));
  });
});

describe('OTA update server', () => {
  const runtimeVersion = '9.9.0';
  const manifestHeaders = (channel: string, extra: Record<string, string> = {}) => ({
    'expo-protocol-version': '1',
    'expo-platform': 'android',
    'expo-runtime-version': runtimeVersion,
    'expo-channel-name': channel,
    'expo-expect-signature': 'sig, keyid="main", alg="rsa-v1_5-sha256"',
    ...extra,
  });

  async function publish(label: string, opts: { critical?: boolean; channel?: string } = {}) {
    const bundle = await putObject(`ota/android/${label}/bundle.hbc`, `bundle-${label}`);
    const png = await putObject(`ota/android/${label}/icon.png`, `png-${label}`);
    const res = await h.request({
      method: 'POST',
      url: '/api/v1/updates',
      token: admin,
      body: {
        channel: opts.channel ?? 'staging',
        runtimeVersion,
        message: `update ${label}`,
        isCritical: opts.critical ?? false,
        launchAsset: { key: `bundle-${label}`, hash: bundle.hash, contentType: 'application/javascript', storageKey: `ota/android/${label}/bundle.hbc` },
        assets: [{ key: `icon${label}`, hash: png.hash, contentType: 'image/png', fileExtension: '.png', storageKey: `ota/android/${label}/icon.png` }],
        expoClient: { name: 'Acceptance', extra: { apiBaseUrl: 'http://api.test' } },
        gitCommit: 'abcdef1',
      },
    });
    expect(res.status).toBe(201);
    return res.json<{ id: string; isHead: boolean }>();
  }

  async function getManifest(channel: string, extra: Record<string, string> = {}) {
    const server = h.app.getHttpAdapter().getInstance();
    return server.inject({ method: 'GET', url: '/api/v1/updates/manifest', headers: manifestHeaders(channel, extra) });
  }

  function verifyPart(part: { headers: Record<string, string>; body: string }) {
    const sigHeader = part.headers['expo-signature'] ?? '';
    const m = /sig="([^"]+)", keyid="main"/.exec(sigHeader);
    expect(m, `expo-signature header: ${sigHeader}`).toBeTruthy();
    return createVerify('RSA-SHA256').update(part.body, 'utf8').verify(publicKeyPem, m![1]!, 'base64');
  }

  it('answers 204 (protocol v1 "no update") when a channel has nothing for the runtime', async () => {
    const res = await getManifest('staging');
    expect(res.statusCode).toBe(204);
    expect(res.headers['expo-protocol-version']).toBe('1');
  });

  it('validates protocol headers', async () => {
    expect((await getManifest('nightly')).statusCode).toBe(400);
    expect((await getManifest('staging', { 'expo-platform': 'ios' })).statusCode).toBe(400);
    expect((await getManifest('staging', { 'expo-protocol-version': '0' })).statusCode).toBe(400);
  });

  it('rejects publishing by non-admins and with missing assets', async () => {
    const body = {
      channel: 'staging',
      runtimeVersion,
      launchAsset: { key: 'x', hash: 'A'.repeat(43), contentType: 'application/javascript', storageKey: 'ota/android/none/bundle.hbc' },
      assets: [],
    };
    expect((await h.request({ method: 'POST', url: '/api/v1/updates', token: tech.token, body })).status).toBe(403);
    const res = await h.request({ method: 'POST', url: '/api/v1/updates', token: admin, body });
    expect(res.json<{ error: { code: string } }>().error.code).toBe('ASSETS_NOT_FOUND');
  });

  let u1: { id: string };
  let u2: { id: string };

  it('serves a code-signed manifest for the matching runtime version and channel only', async () => {
    u1 = await publish('one');
    const res = await getManifest('staging');
    expect(res.statusCode).toBe(200);
    const ct = String(res.headers['content-type']);
    expect(ct).toMatch(/^multipart\/mixed; boundary=/);
    expect(res.headers['expo-sfv-version']).toBe('0');
    const parts = parseMultipart(res.body, ct.split('boundary=')[1]!);
    const manifestPart = parts.find((p) => p.headers['content-disposition']?.includes('name="manifest"'))!;
    expect(manifestPart).toBeTruthy();
    expect(verifyPart(manifestPart)).toBe(true);
    const manifest = JSON.parse(manifestPart.body) as {
      id: string;
      runtimeVersion: string;
      launchAsset: { url: string; hash: string };
      assets: Array<{ fileExtension: string; url: string }>;
      extra: { critical: boolean; expoClient: { extra: { apiBaseUrl: string } } };
    };
    expect(manifest.id).toBe(u1.id);
    expect(manifest.runtimeVersion).toBe(runtimeVersion);
    expect(manifest.assets[0]!.fileExtension).toBe('.png');
    expect(manifest.extra.critical).toBe(false);
    expect(manifest.extra.expoClient.extra.apiBaseUrl).toBe('http://api.test');
    expect(parts.some((p) => p.headers['content-disposition']?.includes('name="extensions"'))).toBe(true);

    // The asset URL serves exactly the bytes whose hash the device will check.
    const server = h.app.getHttpAdapter().getInstance();
    const bundle = await server.inject({ method: 'GET', url: manifest.launchAsset.url.replace('http://api.test', '') });
    expect(b64url(createHash('sha256').update(bundle.rawPayload).digest())).toBe(manifest.launchAsset.hash);

    // Tampering with the body breaks the signature.
    expect(verifyPart({ ...manifestPart, body: manifestPart.body.replace(runtimeVersion, '9.9.1') })).toBe(false);
    // Other channel / runtime: nothing.
    expect((await getManifest('production')).statusCode).toBe(204);
    expect((await getManifest('staging', { 'expo-runtime-version': '1.0.0' })).statusCode).toBe(204);
  });

  it('a newer publish moves the head; critical flag is exposed to the app', async () => {
    u2 = await publish('two', { critical: true });
    const res = await getManifest('staging');
    const ct = String(res.headers['content-type']);
    const manifest = JSON.parse(parseMultipart(res.body, ct.split('boundary=')[1]!)[0]!.body) as { id: string; extra: { critical: boolean } };
    expect(manifest.id).toBe(u2.id);
    expect(manifest.extra.critical).toBe(true);
    const list = await h.request({ method: 'GET', url: `/api/v1/updates?channel=staging&runtimeVersion=${runtimeVersion}`, token: admin });
    const items = list.json<Array<{ id: string; isHead: boolean }>>();
    expect(items[0]).toMatchObject({ id: u2.id, isHead: true });
    expect(items.find((i) => i.id === u1.id)?.isHead).toBe(false);
  });

  it('rollback points the channel to the previous update', async () => {
    const res = await h.request({ method: 'POST', url: '/api/v1/updates/rollback', token: admin, body: { channel: 'staging', runtimeVersion, updateId: u1.id } });
    expect(res.status).toBe(200);
    const m = await getManifest('staging');
    const ct = String(m.headers['content-type']);
    expect(JSON.parse(parseMultipart(m.body, ct.split('boundary=')[1]!)[0]!.body).id).toBe(u1.id);
    // Cannot point a channel at an update of another channel.
    const prod = await publish('three', { channel: 'production' });
    expect((await h.request({ method: 'POST', url: '/api/v1/updates/rollback', token: admin, body: { channel: 'staging', runtimeVersion, updateId: prod.id } })).status).toBe(400);
  });

  it('rollback to embedded sends a signed rollBackToEmbedded directive', async () => {
    await h.request({ method: 'POST', url: '/api/v1/updates/rollback', token: admin, body: { channel: 'staging', runtimeVersion, toEmbedded: true } });
    const res = await getManifest('staging');
    const ct = String(res.headers['content-type']);
    const parts = parseMultipart(res.body, ct.split('boundary=')[1]!);
    const directive = parts.find((p) => p.headers['content-disposition']?.includes('name="directive"'))!;
    expect(JSON.parse(directive.body).type).toBe('rollBackToEmbedded');
    expect(verifyPart(directive)).toBe(true);
    expect((await h.request({ method: 'POST', url: '/api/v1/updates/rollback', token: admin, body: { channel: 'staging', runtimeVersion } })).status).toBe(400);
  });

  it('ota_updates rows are immutable at the database level', async () => {
    await expect(h.prisma.otaUpdate.update({ where: { id: u1.id }, data: { message: 'edited' } })).rejects.toThrow(/append-only/);
  });
});
