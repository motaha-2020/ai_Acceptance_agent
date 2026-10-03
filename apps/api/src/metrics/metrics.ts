import { Controller, Get, Inject, Injectable, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { computeAgreement, type PrismaClient } from '@acceptance/db';
import { AgreementMetricsQuery } from '@acceptance/shared';
import { CheckPolicy } from '../auth/decorators.js';
import { PRISMA } from '../core/tokens.js';
import { ApiZodQuery, ZQuery } from '../core/zod.js';

@Injectable()
export class MetricsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /**
   * AI vs human agreement per category, with the category's autonomy policy and whether the
   * measured numbers would satisfy it (Phase 2 gate; `enabled` stays false in Phase 1).
   */
  async agreement(q: AgreementMetricsQuery) {
    const [stats, policies] = await Promise.all([
      computeAgreement(this.prisma, { projectId: q.projectId, from: q.from, to: q.to }),
      this.prisma.autonomyPolicy.findMany(),
    ]);
    const policyBy = new Map(policies.map((p) => [p.category as string, p]));
    const categories = stats.map((s) => {
      const p = policyBy.get(s.category);
      const policy = p ? { enabled: p.enabled, minSamples: p.minSamples, minAgreement: p.minAgreement, minConfidence: p.minConfidence } : null;
      const meetsThreshold = !!policy && s.withAi >= policy.minSamples && (s.agreementRate ?? 0) >= policy.minAgreement;
      return { ...s, policy, meetsThreshold };
    });
    const sum = (k: 'reviewed' | 'withAi' | 'agree' | 'override' | 'addSnag' | 'verdictMatch') => stats.reduce((n, s) => n + s[k], 0);
    const withAi = sum('withAi');
    return {
      from: q.from ?? null,
      to: q.to ?? null,
      totals: {
        reviewed: sum('reviewed'),
        withAi,
        agree: sum('agree'),
        override: sum('override'),
        addSnag: sum('addSnag'),
        agreementRate: withAi ? sum('agree') / withAi : null,
        verdictAccuracy: withAi ? sum('verdictMatch') / withAi : null,
      },
      categories,
    };
  }
}

@ApiTags('metrics')
@ApiBearerAuth()
@Controller('metrics')
export class MetricsController {
  constructor(@Inject(MetricsService) private readonly metrics: MetricsService) {}

  @Get('agreement')
  @CheckPolicy('read', 'Metrics')
  @ApiOperation({ summary: 'AI vs human agreement per photo category (accuracy dashboard / autonomy gate)' })
  @ApiZodQuery(AgreementMetricsQuery)
  agreement(@ZQuery(AgreementMetricsQuery) q: AgreementMetricsQuery) {
    return this.metrics.agreement(q);
  }
}

@Module({ controllers: [MetricsController], providers: [MetricsService] })
export class MetricsModule {}
