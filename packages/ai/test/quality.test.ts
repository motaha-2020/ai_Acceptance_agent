import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { assessQuality, classifyQuality, DEFAULT_QUALITY_THRESHOLDS, laplacianVariance, luminanceStats } from '../src/quality.js';
import { resolvePaths } from '../eval/paths.js';
import { flatJpeg, noiseJpeg } from './helpers.js';

describe('quality gate maths', () => {
  it('laplacian variance is 0 on a flat image and high on a checkerboard', () => {
    expect(laplacianVariance(new Uint8Array(25).fill(128), 5, 5)).toBe(0);
    const cb = new Uint8Array(64).map((_, i) => ((i % 8) + Math.floor(i / 8)) % 2 ? 255 : 0);
    expect(laplacianVariance(cb, 8, 8)).toBeGreaterThan(10_000);
  });

  it('luminance stats', () => {
    expect(luminanceStats(new Uint8Array([0, 10, 200, 250]))).toEqual({ mean: 115, darkShare: 0.5 });
  });

  it('dark wins over blurry; thresholds are configurable', () => {
    const m = { laplacianVariance: 5, meanLuminance: 5, darkPixelShare: 1, width: 1, height: 1 };
    expect(classifyQuality(m, DEFAULT_QUALITY_THRESHOLDS)).toEqual(['dark']);
    expect(classifyQuality({ ...m, meanLuminance: 120, darkPixelShare: 0 }, DEFAULT_QUALITY_THRESHOLDS)).toEqual(['blurry']);
    expect(classifyQuality({ ...m, meanLuminance: 120, darkPixelShare: 0 }, { ...DEFAULT_QUALITY_THRESHOLDS, blurVarianceMin: 1 })).toEqual([]);
  });

  it('flags synthetic flat/dark images and passes noisy ones', async () => {
    expect((await assessQuality(await noiseJpeg())).issues).toEqual([]);
    expect((await assessQuality(await flatJpeg(128))).issues).toEqual(['blurry']);
    expect((await assessQuality(await flatJpeg(4))).issues).toEqual(['dark']);
  });
});

// Real catalogue photos (customer data, git-ignored): skipped when the data is not on this machine.
const { dataDir, rawRoot } = resolvePaths();
const catalogFile = path.join(dataDir, 'photo_catalog.jsonl');
const realPhotos: string[] = existsSync(catalogFile)
  ? readFileSync(catalogFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => path.join(rawRoot, (JSON.parse(l) as { relPath: string }).relPath))
      .filter((_, i) => i % 97 === 0)
      .filter((f) => existsSync(f))
      .slice(0, 6)
  : [];

describe.skipIf(realPhotos.length === 0)('quality gate on real catalogue photos', () => {
  it('passes accepted photos, flags their blurred and darkened versions', async () => {
    for (const file of realPhotos) {
      const src = readFileSync(file);
      const q = await assessQuality(src);
      expect(q.issues, file).toEqual([]);
      const blurred = await sharp(src).blur(8).jpeg().toBuffer();
      expect((await assessQuality(blurred)).issues, `${file} blurred`).toContain('blurry');
      const dark = await sharp(src).linear(0.1, 0).jpeg().toBuffer();
      expect((await assessQuality(dark)).issues, `${file} darkened`).toEqual(['dark']);
    }
  });
});
