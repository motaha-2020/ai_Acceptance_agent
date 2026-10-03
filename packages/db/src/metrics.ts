import { Prisma, type PrismaClient } from '@prisma/client';

export interface AgreementFilter {
  projectId?: string;
  category?: string;
  from?: Date;
  to?: Date;
}

export interface CategoryAgreement {
  category: string;
  /** Photos with at least one human review (latest review per photo counts). */
  reviewed: number;
  /** Reviewed photos that had an AI result at review time. */
  withAi: number;
  agree: number;
  override: number;
  addSnag: number;
  /** Human verdict equals AI verdict (AI "uncertain" never matches). */
  verdictMatch: number;
  /** agree / withAi: share of photos where the reviewer accepted the AI output unchanged. */
  agreementRate: number | null;
  verdictAccuracy: number | null;
  aiSnags: number;
  aiSnagsDismissed: number;
  humanSnags: number;
  /** AI snags kept by reviewers / all AI snags. */
  snagPrecision: number | null;
  /** AI snags kept / (kept + snags reviewers had to add). */
  snagRecall: number | null;
}

interface ReviewRow {
  category: string;
  reviewed: number;
  with_ai: number;
  agree: number;
  override: number;
  add_snag: number;
  verdict_match: number;
}
interface SnagRow {
  category: string;
  ai_snags: number;
  ai_dismissed: number;
  human_added: number;
}

const ratio = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 10_000) / 10_000 : null);

/**
 * AI-vs-human agreement per photo category, computed from the append-only Review labels
 * (latest review per photo). Feeds the accuracy dashboard and the Phase 2 autonomy gate.
 */
export async function computeAgreement(prisma: PrismaClient, filter: AgreementFilter = {}): Promise<CategoryAgreement[]> {
  const conds: Prisma.Sql[] = [];
  if (filter.projectId) conds.push(Prisma.sql`s."projectId" = ${filter.projectId}`);
  if (filter.category) conds.push(Prisma.sql`p.category::text = ${filter.category}`);
  if (filter.from) conds.push(Prisma.sql`r."createdAt" >= ${filter.from}`);
  if (filter.to) conds.push(Prisma.sql`r."createdAt" < ${filter.to}`);
  const where = conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}` : Prisma.empty;

  const reviews = await prisma.$queryRaw<ReviewRow[]>`
    WITH latest AS (
      SELECT DISTINCT ON (r."photoId") r."photoId", r.decision, r.verdict, r."aiVerdict", p.category
      FROM reviews r
      JOIN photos p ON p.id = r."photoId"
      JOIN sites s ON s.id = p."siteId"
      ${where}
      ORDER BY r."photoId", r."createdAt" DESC
    )
    SELECT category::text AS category,
      count(*)::int AS reviewed,
      count(*) FILTER (WHERE "aiVerdict" IS NOT NULL)::int AS with_ai,
      count(*) FILTER (WHERE decision = 'agree' AND "aiVerdict" IS NOT NULL)::int AS agree,
      count(*) FILTER (WHERE decision = 'override')::int AS override,
      count(*) FILTER (WHERE decision = 'add_snag')::int AS add_snag,
      count(*) FILTER (WHERE "aiVerdict" = verdict)::int AS verdict_match
    FROM latest
    GROUP BY category`;

  const snags = await prisma.$queryRaw<SnagRow[]>`
    SELECT p.category::text AS category,
      count(*) FILTER (WHERE sn.source = 'ai')::int AS ai_snags,
      count(*) FILTER (WHERE sn.source = 'ai' AND sn."dismissedAt" IS NOT NULL)::int AS ai_dismissed,
      count(*) FILTER (WHERE sn.source = 'human')::int AS human_added
    FROM snags sn
    JOIN photos p ON p.id = sn."photoId"
    JOIN sites s ON s.id = p."siteId"
    WHERE EXISTS (
      SELECT 1 FROM reviews r WHERE r."photoId" = p.id
      ${conds.length ? Prisma.sql`AND ${Prisma.join(conds, ' AND ')}` : Prisma.empty}
    )
    GROUP BY p.category`;

  const snagBy = new Map(snags.map((s) => [s.category, s]));
  return reviews
    .map((r) => {
      const s = snagBy.get(r.category);
      const aiSnags = s?.ai_snags ?? 0;
      const dismissed = s?.ai_dismissed ?? 0;
      const human = s?.human_added ?? 0;
      const kept = aiSnags - dismissed;
      return {
        category: r.category,
        reviewed: r.reviewed,
        withAi: r.with_ai,
        agree: r.agree,
        override: r.override,
        addSnag: r.add_snag,
        verdictMatch: r.verdict_match,
        agreementRate: ratio(r.agree, r.with_ai),
        verdictAccuracy: ratio(r.verdict_match, r.with_ai),
        aiSnags,
        aiSnagsDismissed: dismissed,
        humanSnags: human,
        snagPrecision: ratio(kept, aiSnags),
        snagRecall: ratio(kept, kept + human),
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category));
}
