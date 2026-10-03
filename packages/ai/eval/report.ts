/** Markdown rendering for a single run summary and for the side-by-side bake-off comparison (T3.6). */
import type { EvalMetrics } from './metrics.js';

export interface RunInfo {
  label: string;
  provider: string;
  model: string;
  startedAt: string;
  promptVersion?: string;
  dryRun: boolean;
  args: Record<string, unknown>;
  datasetStats?: Record<string, unknown>;
}

const pct = (x: number | null): string => (x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
const num = (x: number | null, d = 0): string => (x === null ? 'n/a' : x.toFixed(d));
const usd = (x: number | null): string => (x === null ? 'n/a' : `$${x < 0.01 ? x.toFixed(5) : x.toFixed(4)}`);

function table(header: string[], rows: string[][]): string {
  return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

export function renderSummary(m: EvalMetrics, info: RunInfo): string {
  const c = m.confusion;
  const lines = [
    `# Eval run ${info.label}`,
    '',
    `- provider: \`${info.provider}\`  model: \`${info.model}\`${info.dryRun ? '  **DRY RUN (fake provider; numbers are meaningless)**' : ''}`,
    `- started: ${info.startedAt}`,
    `- prompt version: \`${info.promptVersion ?? 'n/a'}\``,
    `- args: \`${JSON.stringify(info.args)}\``,
    info.datasetStats ? `- dataset: \`${JSON.stringify(info.datasetStats)}\`` : '',
    '',
    '## Photo level',
    '',
    table(
      ['metric', 'value'],
      [
        ['photos', String(m.photos)],
        ['errors', String(m.errors)],
        ['accuracy (decided verdicts)', pct(m.decidedAccuracy)],
        ['accuracy (strict: uncertain/error = wrong)', pct(m.strictAccuracy)],
        ['uncertain rate', pct(m.uncertainRate)],
        ['snag catch rate (reject+uncertain on snag photos)', pct(m.snagCatchRate)],
        ['false accept rate (snag photo -> accept)', pct(m.falseAcceptRate)],
        ['silent false accept rate (snag photo -> accept, no snag reported)', pct(m.silentFalseAcceptRate)],
        ['snag photos accepted with minor notes / good photos accepted with notes', `${m.snagAcceptWithNotes} / ${m.goodAcceptWithNotes}`],
        ['false reject rate (assumed-good -> reject)', pct(m.falseRejectRate)],
        ['uncertain on good / on snag photos', `${pct(m.goodUncertainRate)} / ${pct(m.snagUncertainRate)}`],
        ['snag photos with >=1 expected code found', pct(m.snagCodeHitRate)],
        ['code micro precision / recall / F1', `${pct(m.micro.precision)} / ${pct(m.micro.recall)} / ${pct(m.micro.f1)}`],
        ['latency avg / p50 / p95 (ms)', `${num(m.latencyMs.avg)} / ${num(m.latencyMs.p50)} / ${num(m.latencyMs.p95)}`],
        ['cost total / per photo', `${usd(m.cost.totalUsd)} / ${usd(m.cost.perPhotoUsd)}`],
        ['tokens in / out', `${m.tokens.input} / ${m.tokens.output}`],
        ['escalation rate (cascade)', pct(m.escalationRate)],
      ],
    ),
    '',
    '## Confusion (rows = expected, columns = predicted)',
    '',
    table(
      ['expected \\ predicted', 'accept', 'reject', 'uncertain', 'error'],
      (['accept', 'reject'] as const).map((e) => [e, String(c[e].accept), String(c[e].reject), String(c[e].uncertain), String(c[e].error)]),
    ),
    '',
    '## Per snag code',
    '',
    'Expected codes come from reviewer remarks via `matchReviewerRemark`; "good" photos are only *assumed* good, so some false positives on them may be real snags worth a look.',
    '',
    table(
      ['code', 'support', 'TP', 'FP', 'FN', 'precision', 'recall', 'F1'],
      m.perCode.map((s) => [s.code, String(s.support), String(s.tp), String(s.fp), String(s.fn), pct(s.precision), pct(s.recall), pct(s.f1)]),
    ),
    '',
  ];
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

export function renderComparison(runs: ReadonlyArray<{ info: RunInfo; metrics: EvalMetrics }>): string {
  const header = ['metric', ...runs.map((r) => `${r.info.label}${r.info.dryRun ? ' (dry)' : ''}`)];
  const row = (name: string, f: (m: EvalMetrics) => string): string[] => [name, ...runs.map((r) => f(r.metrics))];
  const main = table(header, [
    ['model', ...runs.map((r) => `\`${r.info.model}\``)],
    row('photos', (m) => String(m.photos)),
    row('errors', (m) => String(m.errors)),
    row('accuracy (decided)', (m) => pct(m.decidedAccuracy)),
    row('accuracy (strict)', (m) => pct(m.strictAccuracy)),
    row('uncertain rate', (m) => pct(m.uncertainRate)),
    row('snag catch rate', (m) => pct(m.snagCatchRate)),
    row('false accept rate', (m) => pct(m.falseAcceptRate)),
    row('silent false accept rate', (m) => pct(m.silentFalseAcceptRate)),
    row('false reject rate', (m) => pct(m.falseRejectRate)),
    row('uncertain good / snag', (m) => `${pct(m.goodUncertainRate)} / ${pct(m.snagUncertainRate)}`),
    row('snag code hit rate', (m) => pct(m.snagCodeHitRate)),
    row('code micro P / R', (m) => `${pct(m.micro.precision)} / ${pct(m.micro.recall)}`),
    row('latency avg (ms)', (m) => num(m.latencyMs.avg)),
    row('latency p95 (ms)', (m) => num(m.latencyMs.p95)),
    row('cost per photo', (m) => usd(m.cost.perPhotoUsd)),
    row('cost total', (m) => usd(m.cost.totalUsd)),
    row('cost per 1000 photos', (m) => usd(m.cost.perPhotoUsd === null ? null : m.cost.perPhotoUsd * 1000)),
    row('escalation rate', (m) => pct(m.escalationRate)),
  ]);
  const codes = [...new Set(runs.flatMap((r) => r.metrics.perCode.filter((s) => s.support > 0).map((s) => s.code)))];
  const recallRows = codes.map((code) => [
    code,
    ...runs.map((r) => {
      const s = r.metrics.perCode.find((x) => x.code === code);
      return s ? `${pct(s.recall)} (P ${pct(s.precision)}, n=${s.support})` : 'n/a';
    }),
  ]);
  return [
    '# Provider bake-off comparison',
    '',
    'Prices are configuration (src/pricing.ts) and must be verified on vendor pricing pages before decisions.',
    '',
    main,
    '',
    '## Recall per snag code (precision, support)',
    '',
    table(['code', ...runs.map((r) => r.info.label)], recallRows),
    '',
  ].join('\n');
}
