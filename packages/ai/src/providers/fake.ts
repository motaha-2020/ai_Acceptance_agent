/**
 * Offline vendor for --dry-run, tests and local development of the worker. It goes through the full
 * shared core (quality gate, prompt build, parsing, cost) but answers deterministically from a hash of
 * the photo bytes instead of calling a model. Its "accuracy" is meaningless; it only exercises plumbing.
 */
import type { PhotoCategory } from '@acceptance/shared';
import { PhotoCategory as PhotoCategoryEnum } from '@acceptance/shared';
import { fnv1a, snagsForCategory } from '@acceptance/checklist';
import type { VendorClient, VendorReply, VendorRequest } from '../core.js';

export interface FakeOptions {
  model?: string;
  /** Simulated latency in ms. */
  latencyMs?: number;
  /** Rate of malformed first answers, to exercise the repair path (0..1). */
  malformedRate?: number;
}

function declaredCategory(categoryBlock: string): PhotoCategory {
  const m = /# Declared category: ([a-z_]+)/.exec(categoryBlock);
  const parsed = PhotoCategoryEnum.safeParse(m?.[1]);
  return parsed.success ? parsed.data : 'rack';
}

export class FakeVendor implements VendorClient {
  readonly vendor = 'fake';
  readonly model: string;

  constructor(private readonly opts: FakeOptions = {}) {
    this.model = opts.model ?? 'fake';
  }

  async complete(req: VendorRequest): Promise<VendorReply> {
    if (this.opts.latencyMs) await new Promise((r) => setTimeout(r, this.opts.latencyMs));
    const h = parseInt(fnv1a(req.parts.photo.base64), 16);
    const usage = { inputTokens: 1500, outputTokens: 120, cacheReadTokens: 0, cacheWriteTokens: 0 };
    if (!req.repair && (h % 1000) / 1000 < (this.opts.malformedRate ?? 0)) {
      return { text: '{"verdict": "accept"', usage, model: this.model };
    }
    const category = declaredCategory(req.parts.categoryBlock);
    const codes = snagsForCategory(category).map((s) => s.code).filter((c) => !c.startsWith('PHOTO_') && c !== 'WRONG_CATEGORY' && c !== 'PERSON_IN_FRAME');
    const bucket = h % 100;
    const code = codes[h % Math.max(1, codes.length)] ?? 'OTHER_SNAG';
    const snag = { code, severity: 'minor', reasonAr: 'ملاحظة تجريبية', reasonEn: 'dry-run finding' };
    const answer =
      bucket < 60
        ? { categoryMatches: true, qualityIssues: [], verdict: 'accept', confidence: 0.85, snags: [] }
        : bucket < 80
          ? { categoryMatches: true, qualityIssues: [], verdict: 'reject', confidence: 0.8, snags: [snag] }
          : bucket < 90
            ? { categoryMatches: true, qualityIssues: [], verdict: 'uncertain', confidence: 0.4, snags: [] }
            : { categoryMatches: true, qualityIssues: [], verdict: 'reject', confidence: 0.5, snags: [snag] };
    return { text: JSON.stringify(answer), usage, model: this.model };
  }
}
