import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertValidKey, LocalObjectStorage, ObjectNotFoundError } from '../src/index.js';

let dir: string;
let now = 1_700_000_000_000;
let storage: LocalObjectStorage;

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'storage-test-'));
  storage = new LocalObjectStorage({ rootDir: dir, publicBaseUrl: 'http://api.test/files/', signingSecret: 's3cr3t', now: () => now });
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('LocalObjectStorage', () => {
  it('puts, reads, checks and deletes objects', async () => {
    await storage.put('photos/ab/x/original.jpg', Buffer.from('hello'), { contentType: 'image/jpeg' });
    expect(await storage.exists('photos/ab/x/original.jpg')).toBe(true);
    expect((await storage.get('photos/ab/x/original.jpg')).toString()).toBe('hello');
    expect(await storage.contentType('photos/ab/x/original.jpg')).toBe('image/jpeg');
    await storage.delete('photos/ab/x/original.jpg');
    expect(await storage.exists('photos/ab/x/original.jpg')).toBe(false);
    await expect(storage.get('photos/ab/x/original.jpg')).rejects.toBeInstanceOf(ObjectNotFoundError);
  });

  it('issues signed URLs that verify until they expire', async () => {
    const url = new URL(await storage.signedUrl('photos/a b/web.jpg', { expiresIn: 60, downloadName: 'p.jpg' }));
    expect(url.pathname).toBe('/files/photos/a%20b/web.jpg');
    const exp = url.searchParams.get('exp') ?? undefined;
    const sig = url.searchParams.get('sig') ?? undefined;
    const dn = url.searchParams.get('dn') ?? undefined;
    expect(storage.verifySignature('photos/a b/web.jpg', exp, sig, dn)).toEqual({ key: 'photos/a b/web.jpg', downloadName: 'p.jpg' });
    expect(storage.verifySignature('photos/a b/other.jpg', exp, sig, dn)).toBeNull();
    expect(storage.verifySignature('photos/a b/web.jpg', exp, sig, 'evil.jpg')).toBeNull();
    expect(storage.verifySignature('photos/a b/web.jpg', exp, 'x' + (sig ?? '').slice(1), dn)).toBeNull();
    now += 61_000;
    expect(storage.verifySignature('photos/a b/web.jpg', exp, sig, dn)).toBeNull();
  });

  it('rejects keys that escape the root', () => {
    for (const bad of ['../x', 'a/../../x', '/abs', 'a\\b','a//b', '']) expect(() => assertValidKey(bad)).toThrow();
    expect(() => assertValidKey('photos/ok/key.jpg')).not.toThrow();
  });
});
