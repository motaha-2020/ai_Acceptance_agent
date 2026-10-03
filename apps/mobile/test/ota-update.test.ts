import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CreateOtaUpdateRequest } from '@acceptance/shared';
import { buildUpdateRequest, contentTypeFor } from '../scripts/ota-update.mjs';

const dir = mkdtempSync(path.join(os.tmpdir(), 'ota-dist-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function write(rel: string, content: string) {
  const p = path.join(dir, rel);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, content);
}

describe('OTA update request from expo export', () => {
  write('_expo/static/js/android/entry-abc.hbc', 'BUNDLE');
  write('assets/aaaa', 'PNG-DATA');
  write('assets/bbbb', 'FONT-DATA');
  // Windows exports use backslashes; duplicates must collapse.
  writeFileSync(
    path.join(dir, 'metadata.json'),
    JSON.stringify({
      version: 0,
      bundler: 'metro',
      fileMetadata: {
        android: {
          bundle: '_expo\\static\\js\\android\\entry-abc.hbc',
          assets: [
            { path: 'assets\\aaaa', ext: 'png' },
            { path: 'assets/bbbb', ext: 'ttf' },
            { path: 'assets/aaaa', ext: 'png' },
          ],
        },
      },
    }),
  );

  const { body, uploads } = buildUpdateRequest(dir, {
    channel: 'staging',
    runtimeVersion: '1.0.0',
    prefix: 'ota/android/1.0.0/20261003-abc1234',
    message: 'fix labels',
    critical: true,
    gitCommit: 'abc1234',
    expoClient: { name: 'Acceptance Field', extra: { apiBaseUrl: 'http://x' } },
  });

  it('matches the shared API contract', () => {
    expect(CreateOtaUpdateRequest.safeParse(body).success).toBe(true);
  });

  it('hashes every file the way expo-updates verifies it (sha256 base64url) and keys by md5', () => {
    expect(body.launchAsset).toMatchObject({
      contentType: 'application/javascript',
      storageKey: 'ota/android/1.0.0/20261003-abc1234/_expo/static/js/android/entry-abc.hbc',
      hash: createHash('sha256').update('BUNDLE').digest('base64url'),
      key: createHash('md5').update('BUNDLE').digest('hex'),
    });
    expect(body.assets).toHaveLength(2);
    expect(body.assets[0]).toMatchObject({ fileExtension: '.png', contentType: 'image/png', storageKey: 'ota/android/1.0.0/20261003-abc1234/assets/aaaa' });
    expect(body.isCritical).toBe(true);
    expect(uploads.map((u) => u.storageKey)).toHaveLength(3);
  });

  it('rejects storage prefixes outside ota/', () => {
    expect(() => buildUpdateRequest(dir, { channel: 'staging', runtimeVersion: '1.0.0', prefix: 'photos/x' })).toThrow();
    expect(contentTypeFor('TTF')).toBe('font/ttf');
  });
});
