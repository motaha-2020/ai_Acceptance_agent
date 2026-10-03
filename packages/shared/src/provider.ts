import type { AnalysisResult } from './analysis.js';
import type { PhotoCategory } from './enums.js';

/** Input for one photo inspection. Image bytes are passed in, never a URL, so providers stay stateless. */
export interface AnalysisRequest {
  image: { data: Uint8Array; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' };
  category: PhotoCategory;
  /** Optional site context (device model, hostname) to ground label checks. */
  context?: { deviceModel?: string; hostname?: string };
}

export interface AnalysisMeta {
  provider: string;
  model: string;
  promptVersion: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  costUsd?: number;
}

/** Contract between the worker (P2) and the AI package (P3). */
export interface AnalysisProvider {
  readonly name: string;
  analyze(req: AnalysisRequest): Promise<{ result: AnalysisResult; meta: AnalysisMeta }>;
}
