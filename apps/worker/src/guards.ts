import { computeAgreement, type PrismaClient } from '@acceptance/db';
import type { AnalysisResult, PhotoCategory } from '@acceptance/shared';

// ───────────────────────────── daily budget ─────────────────────────────

export interface BudgetStatus {
  ok: boolean;
  spentUsd: number;
  limitUsd: number;
}

export interface BudgetGuard {
  check(): Promise<BudgetStatus>;
}

/** Stops paid AI calls once today's (UTC) recorded spend reaches the limit. limit <= 0 disables the guard. */
export class DailyBudgetGuard implements BudgetGuard {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly limitUsd: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async check(): Promise<BudgetStatus> {
    if (this.limitUsd <= 0) return { ok: true, spentUsd: 0, limitUsd: this.limitUsd };
    const n = this.now();
    const dayStart = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
    const agg = await this.prisma.analysis.aggregate({ _sum: { costUsd: true }, where: { createdAt: { gte: dayStart } } });
    const spentUsd = Number(agg._sum.costUsd ?? 0);
    return { ok: spentUsd < this.limitUsd, spentUsd, limitUsd: this.limitUsd };
  }
}

// ───────────────────────────── autonomy gate ─────────────────────────────

export type GateDecision = 'pending_review' | 'approved';

export interface AutonomyGate {
  decide(input: { category: PhotoCategory; result: AnalysisResult }): Promise<{ decision: GateDecision; reason: string }>;
}

/** Phase 1: every photo goes to a human. */
export class HumanReviewGate implements AutonomyGate {
  async decide(): Promise<{ decision: GateDecision; reason: string }> {
    return { decision: 'pending_review', reason: 'phase1_human_review' };
  }
}

/**
 * Phase 2 hook: auto-approve only clean, confident AI results in categories whose measured
 * agreement with reviewers meets the category's AutonomyPolicy. Off unless AUTONOMY_ENABLED=true
 * AND the category policy is enabled. Anything uncertain or with snags always goes to a human.
 */
export class PolicyAutonomyGate implements AutonomyGate {
  constructor(private readonly prisma: PrismaClient) {}

  async decide({ category, result }: { category: PhotoCategory; result: AnalysisResult }): Promise<{ decision: GateDecision; reason: string }> {
    const policy = await this.prisma.autonomyPolicy.findUnique({ where: { category } });
    if (!policy?.enabled) return { decision: 'pending_review', reason: 'policy_disabled' };
    if (result.verdict !== 'accept' || result.snags.length > 0 || result.qualityIssues.length > 0 || !result.categoryMatches) {
      return { decision: 'pending_review', reason: 'not_clean_accept' };
    }
    if (result.confidence < policy.minConfidence) return { decision: 'pending_review', reason: 'low_confidence' };
    const [stats] = await computeAgreement(this.prisma, { category });
    if (!stats || stats.withAi < policy.minSamples) return { decision: 'pending_review', reason: 'not_enough_samples' };
    if ((stats.agreementRate ?? 0) < policy.minAgreement) return { decision: 'pending_review', reason: 'agreement_below_threshold' };
    return { decision: 'approved', reason: 'autonomy_policy' };
  }
}
