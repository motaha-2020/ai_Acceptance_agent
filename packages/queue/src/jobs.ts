/** Job names and payloads shared by producers (API) and consumers (worker). */
export const JobName = {
  analyzePhoto: 'analyze-photo',
} as const;

export interface AnalyzePhotoJob {
  photoId: string;
  /** Who/what triggered the analysis (upload, reanalyze). */
  reason: 'upload' | 'reanalyze';
}

/** Deterministic job id so duplicate enqueues of the same photo collapse into one job. */
export function analyzePhotoJobId(photoId: string, reason: AnalyzePhotoJob['reason'], nonce?: string): string {
  return reason === 'upload' ? `analyze:${photoId}` : `analyze:${photoId}:${nonce ?? Date.now()}`;
}
