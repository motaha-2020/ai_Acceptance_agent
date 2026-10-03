import sharp from 'sharp';
import type { AnalysisResult } from '@acceptance/shared';

/** Random-noise JPEG (sharp, high Laplacian variance). */
export async function noiseJpeg(width = 640, height = 480, seed = 1): Promise<Buffer> {
  const px = Buffer.alloc(width * height * 3);
  let s = seed;
  for (let i = 0; i < px.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    px[i] = 60 + (s % 160);
  }
  return sharp(px, { raw: { width, height, channels: 3 } }).jpeg().toBuffer();
}

/** Uniform-colour JPEG (zero Laplacian variance). */
export function flatJpeg(value: number, width = 320, height = 240): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: value, g: value, b: value } } }).jpeg().toBuffer();
}

export const ACCEPT: AnalysisResult = { categoryMatches: true, qualityIssues: [], verdict: 'accept', confidence: 0.9, snags: [] };

export const REJECT: AnalysisResult = {
  categoryMatches: true,
  qualityIssues: [],
  verdict: 'reject',
  confidence: 0.82,
  snags: [{ code: 'DUCT_COVER_OPEN', severity: 'minor', bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.2 }, reasonAr: 'نقفل الداكت', reasonEn: 'Close the duct cover.' }],
};

export interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface CannedResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

/**
 * A fetch replacement that replays canned HTTP responses in order and records every request.
 * Lets the real vendor SDKs run end-to-end (serialisation, error classes) without network.
 */
export function replayFetch(responses: CannedResponse[]): { fetch: typeof fetch; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const queue = [...responses];
  const fake = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    const raw = init?.body;
    calls.push({ url, method: init?.method ?? 'GET', headers, body: typeof raw === 'string' ? JSON.parse(raw) : raw });
    const next = queue.shift();
    if (!next) throw new Error(`unexpected request to ${url}`);
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { 'content-type': 'application/json', ...next.headers },
    });
  };
  return { fetch: fake as typeof fetch, calls };
}
