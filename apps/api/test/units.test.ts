import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { redact } from '../src/audit/audit.service.js';
import { LoginRateLimiter } from '../src/auth/rate-limiter.js';
import { ConfigError, loadConfig } from '../src/config/config.js';
import { DomainError } from '../src/core/errors.js';
import { photoKeys, processImage, sha256Hex } from '../src/photos/image-processing.js';

describe('image processing', () => {
  it('hashes, reads EXIF and renders bounded JPEG variants', async () => {
    const original = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#336699' } })
      .jpeg()
      .withExif({ IFD0: { Make: 'Samsung', Model: 'SM-A546' } })
      .toBuffer();
    const img = await processImage(original);
    expect(img.sha256).toBe(sha256Hex(original));
    expect(img).toMatchObject({ mimeType: 'image/jpeg', ext: 'jpg', width: 2400, height: 1200, sizeBytes: original.length });
    expect(img.exif).toMatchObject({ make: 'Samsung', model: 'SM-A546' });
    const web = await sharp(img.web).metadata();
    const thumb = await sharp(img.thumb).metadata();
    expect([web.width, web.height, web.format]).toEqual([1600, 800, 'jpeg']);
    expect([thumb.width, thumb.height]).toEqual([320, 160]);
  });

  it('accepts PNG and keeps the original extension', async () => {
    const png = await sharp({ create: { width: 100, height: 80, channels: 4, background: '#fff' } }).png().toBuffer();
    const img = await processImage(png);
    expect(img.ext).toBe('png');
    expect(photoKeys(img.sha256, img.ext).original).toMatch(new RegExp(`^photos/${img.sha256.slice(0, 2)}/${img.sha256}/original\\.png$`));
  });

  it('rejects unreadable, unsupported and tiny images', async () => {
    await expect(processImage(Buffer.from('%PDF-1.7 not an image'))).rejects.toMatchObject({ status: 415 });
    const gif = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#000' } }).gif().toBuffer();
    await expect(processImage(gif)).rejects.toMatchObject({ status: 415 });
    const tiny = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).jpeg().toBuffer();
    await expect(processImage(tiny)).rejects.toMatchObject({ status: 422, code: 'IMAGE_TOO_SMALL' });
  });
});

describe('LoginRateLimiter', () => {
  it('blocks after max attempts within the window and resets afterwards', () => {
    let now = 0;
    const l = new LoginRateLimiter(2, 60_000, () => now);
    l.hit('k');
    l.hit('k');
    expect(() => l.hit('k')).toThrow(DomainError);
    now = 60_001;
    expect(() => l.hit('k')).not.toThrow();
    l.reset('k');
    l.hit('k');
    expect(() => l.hit('other')).not.toThrow();
  });
});

describe('audit redaction', () => {
  it('drops secrets at any depth', () => {
    const out = redact({ user: { email: 'a@b.c', passwordHash: 'x' }, accessToken: 'ey..', list: [{ refreshToken: 'rt' }], when: new Date(0) });
    expect(out).toEqual({ user: { email: 'a@b.c', passwordHash: '[redacted]' }, accessToken: '[redacted]', list: [{ refreshToken: '[redacted]' }], when: '1970-01-01T00:00:00.000Z' });
  });
});

describe('config validation', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db', JWT_ACCESS_SECRET: 'a'.repeat(32), STORAGE_SIGNING_SECRET: 'b'.repeat(32) };

  it('fails fast with readable messages', () => {
    try {
      loadConfig({ JWT_ACCESS_SECRET: 'short' });
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect((e as ConfigError).issues.join('\n')).toMatch(/DATABASE_URL/);
      expect((e as ConfigError).issues.join('\n')).toMatch(/JWT_ACCESS_SECRET must be at least 32/);
    }
  });

  it('runs the worker in-process only when Redis is not configured', () => {
    expect(loadConfig(base).embeddedWorker).toBe(true);
    expect(loadConfig({ ...base, REDIS_URL: 'redis://localhost:6379' }).embeddedWorker).toBe(false);
  });

  it('refuses the fake AI provider and missing S3 settings in production', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(/fake provider/);
    expect(() => loadConfig({ ...base, STORAGE_DRIVER: 's3', AI_PROVIDER: 'claude' })).toThrow(/S3_ENDPOINT/);
  });
});
