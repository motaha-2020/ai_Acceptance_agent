/**
 * T3.2 local quality gate: cheap pixel statistics computed before any vendor call.
 *  - blur: variance of the 3x3 Laplacian on a fixed-size greyscale copy (low variance = few edges = blurry);
 *  - darkness: mean luminance (0..255) and the share of near-black pixels.
 * Person-in-frame and wrong-category cannot be measured locally; they are handled by the prompt
 * (see prompt.ts) and reported by the model.
 */
import sharp from 'sharp';
import type { AnalysisResult } from '@acceptance/shared';

export type LocalQualityIssue = Extract<AnalysisResult['qualityIssues'][number], 'blurry' | 'dark'>;

export interface QualityThresholds {
  /** Laplacian variance below this => blurry. */
  blurVarianceMin: number;
  /** Mean luminance below this => dark. */
  darkMeanMax: number;
  /** Share of pixels with luminance < 30 above this => dark (catches mostly-black frames). */
  darkPixelShareMax: number;
  /** Side length the image is resized to before measuring, so thresholds do not depend on resolution. */
  analysisSide: number;
}

/**
 * Calibrated 2026-10-03 on the 791 catalogue photos (accepted deliverables) + 108 snag photos
 * (scripts/quality-stats.ts). Racks are black, so accepted photos are often dark: catalogue minimum mean
 * luminance 30, max near-black share 0.75; minimum Laplacian variance 52 (soft but legible WhatsApp
 * photo). Thresholds sit below every accepted photo so the gate flags only clear outliers (a false
 * "blurry" costs a needless retake). Synthetic check on a real photo: Gaussian blur sigma 5 -> 31
 * (flagged), sigma 3 -> 141 (not flagged); brightness x0.4 -> mean 14 (flagged); darkest
 * snag photo (mean 16, still legible) passes. Re-calibrate once reviewers have rejected real blurry/dark photos.
 */
export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  blurVarianceMin: 40,
  darkMeanMax: 15,
  darkPixelShareMax: 0.92,
  analysisSide: 512,
};

export interface QualityMetrics {
  laplacianVariance: number;
  meanLuminance: number;
  darkPixelShare: number;
  width: number;
  height: number;
}

export interface QualityReport {
  issues: LocalQualityIssue[];
  metrics: QualityMetrics;
}

/** Variance of the 4-neighbour Laplacian over interior pixels of a single-channel image. */
export function laplacianVariance(px: Uint8Array, width: number, height: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const i = row + x;
      const lap = (px[i - 1] ?? 0) + (px[i + 1] ?? 0) + (px[i - width] ?? 0) + (px[i + width] ?? 0) - 4 * (px[i] ?? 0);
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export function luminanceStats(px: Uint8Array): { mean: number; darkShare: number } {
  let sum = 0;
  let dark = 0;
  for (const v of px) {
    sum += v;
    if (v < 30) dark++;
  }
  return px.length === 0 ? { mean: 0, darkShare: 1 } : { mean: sum / px.length, darkShare: dark / px.length };
}

export function classifyQuality(m: QualityMetrics, t: QualityThresholds): LocalQualityIssue[] {
  const issues: LocalQualityIssue[] = [];
  if (m.meanLuminance < t.darkMeanMax || m.darkPixelShare > t.darkPixelShareMax) issues.push('dark');
  // A very dark frame also has low Laplacian variance; report it as dark only.
  else if (m.laplacianVariance < t.blurVarianceMin) issues.push('blurry');
  return issues;
}

export async function assessQuality(
  image: Uint8Array,
  thresholds: QualityThresholds = DEFAULT_QUALITY_THRESHOLDS,
): Promise<QualityReport> {
  const { data, info } = await sharp(image)
    .rotate()
    .greyscale()
    .resize({ width: thresholds.analysisSide, height: thresholds.analysisSide, fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const px = new Uint8Array(n);
  for (let i = 0; i < n; i++) px[i] = data[i * info.channels] ?? 0; // greyscale: channel 0 is luminance
  const lum = luminanceStats(px);
  const metrics: QualityMetrics = {
    laplacianVariance: laplacianVariance(px, info.width, info.height),
    meanLuminance: lum.mean,
    darkPixelShare: lum.darkShare,
    width: info.width,
    height: info.height,
  };
  return { issues: classifyQuality(metrics, thresholds), metrics };
}
