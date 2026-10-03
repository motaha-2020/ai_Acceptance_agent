/**
 * Eval / bake-off CLI.
 *   run:     pnpm --filter @acceptance/ai eval --provider gemini --model X --limit 150 --concurrency 4 [--dry-run]
 *   compare: pnpm --filter @acceptance/ai eval:compare --last 3        (or explicit .jsonl paths)
 * Outputs (git-ignored): data/eval/<timestamp>-<label>.jsonl, .md (summary), .run.json (run info).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { AnalysisProvider, PhotoCategory } from '@acceptance/shared';
import {
  CascadeProvider,
  createFewShotSource,
  createProvider,
  DEFAULT_VERDICT_POLICY,
  FEW_SHOT_MANIFEST,
  FewShotManifest,
  LEGACY_VERDICT_POLICY,
  type FewShotImageStore,
  type FewShotSource,
  type VerdictPolicy,
  isProviderName,
  loadPriceTable,
  type FewShotExample,
  type ProviderName,
  type ProviderOptions,
  type QualityGateMode,
} from '../src/index.js';
import { buildSplitDataset, CatalogRecord, CategoryOverrides, GoodExclusions, readJsonl, SeedRecord, type EvalItem, type SplitName } from './dataset.js';
import { computeMetrics, EvalRecord, replayRecords } from './metrics.js';
import { resolvePaths } from './paths.js';
import { renderComparison, renderSummary, type RunInfo } from './report.js';
import { mediaTypeOf, runEval } from './runner.js';

const KEY_ENV: Record<ProviderName, string | undefined> = {
  claude: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  fake: undefined,
};

export interface CliIO {
  log: (msg: string) => void;
  env: NodeJS.ProcessEnv;
  cwd: string;
  now: () => Date;
}

const defaultIO: CliIO = { log: (m) => console.log(m), env: process.env, cwd: process.cwd(), now: () => new Date() };

const stamp = (d: Date): string => d.toISOString().replace(/[:.]/g, '-');

/** "gemini" or "gemini:gemini-3.8-flash" -> name + model. */
export function parseProviderSpec(spec: string): { name: ProviderName; model?: string } {
  const [name, ...rest] = spec.split(':');
  if (!name || !isProviderName(name)) throw new Error(`unknown provider "${spec}" (claude | gemini | openai | fake)`);
  const model = rest.join(':');
  return model ? { name, model } : { name };
}

function loadFewShot(items: readonly EvalItem[]): (c: PhotoCategory) => FewShotExample[] {
  const examples = items.map<FewShotExample>((it) => ({
    id: it.sha256,
    category: it.category,
    kind: it.kind,
    image: { data: readFileSync(it.file), mediaType: mediaTypeOf(it.file) },
    codes: it.expectedCodes,
    ...(it.remarks[0] ? { note: it.remarks[0] } : {}),
  }));
  return (c) => examples.filter((e) => e.category === c);
}

/** Few-shot images for a manifest, read from the dataset files of the reserved pool (eval only). */
function poolImageStore(pool: readonly EvalItem[]): FewShotImageStore {
  const bySha = new Map(pool.map((p) => [p.sha256, p.file] as const));
  return {
    get: async (key) => {
      const file = bySha.get(key.replace(/\.[a-z]+$/i, ''));
      if (!file) throw new Error(`few-shot image ${key} is not in the reserved few-shot pool`);
      return readFileSync(file);
    },
    describe: () => 'eval-pool',
  };
}

export function parsePolicy(values: { policy?: string; 'reject-confidence'?: string; 'report-confidence'?: string; 'route-confidence'?: string; 'accept-confidence'?: string; 'minor-only'?: string }): VerdictPolicy {
  const base = values.policy === 'legacy' ? LEGACY_VERDICT_POLICY : DEFAULT_VERDICT_POLICY;
  const p: VerdictPolicy = { ...base };
  const tags: string[] = [];
  if (values['reject-confidence']) (p.rejectConfidence = Number(values['reject-confidence'])), tags.push(`rc${values['reject-confidence']}`);
  if (values['report-confidence']) (p.reportConfidence = Number(values['report-confidence'])), tags.push(`pc${values['report-confidence']}`);
  if (values['route-confidence']) (p.routeConfidence = Number(values['route-confidence'])), tags.push(`rt${values['route-confidence']}`);
  if (values['accept-confidence']) (p.acceptConfidence = Number(values['accept-confidence'])), tags.push(`ac${values['accept-confidence']}`);
  if (values['minor-only']) {
    const m = values['minor-only'];
    if (m !== 'accept' && m !== 'uncertain' && m !== 'reject') throw new Error('--minor-only must be accept|uncertain|reject');
    p.minorOnlyVerdict = m;
    tags.push(`mo-${m}`);
  }
  if (tags.length) p.version = `${p.version}~${tags.join('-')}`;
  return p;
}

function readJsonIfExists<T>(file: string, schema: { parse: (v: unknown) => T }): T | undefined {
  return existsSync(file) ? schema.parse(JSON.parse(readFileSync(file, 'utf8'))) : undefined;
}

export async function runCommand(argv: string[], io: CliIO = defaultIO): Promise<{ jsonl: string; summary: string }> {
  const { values } = parseArgs({
    args: argv,
    options: {
      provider: { type: 'string', default: 'gemini' },
      model: { type: 'string' },
      cascade: { type: 'string' },
      'min-confidence': { type: 'string' },
      limit: { type: 'string', default: '150' },
      concurrency: { type: 'string', default: '4' },
      'snag-share': { type: 'string', default: '0.5' },
      seed: { type: 'string', default: '1' },
      'few-shot': { type: 'string', default: '0' },
      'few-shot-manifest': { type: 'string' },
      'few-shot-max-side': { type: 'string' },
      split: { type: 'string', default: 'legacy' },
      overrides: { type: 'string' },
      exclusions: { type: 'string' },
      'export-items': { type: 'string' },
      policy: { type: 'string', default: 'default' },
      'reject-confidence': { type: 'string' },
      'report-confidence': { type: 'string' },
      'route-confidence': { type: 'string' },
      'accept-confidence': { type: 'string' },
      'minor-only': { type: 'string' },
      'image-max-side': { type: 'string' },
      label: { type: 'string' },
      'quality-gate': { type: 'string', default: 'hint' },
      effort: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'data-dir': { type: 'string' },
      'raw-root': { type: 'string' },
      out: { type: 'string' },
    },
    strict: true,
  });
  const paths = resolvePaths(
    { ...io.env, ...(values['data-dir'] ? { DATA_DIR: values['data-dir'] } : {}), ...(values['raw-root'] ? { RAW_ROOT: values['raw-root'] } : {}) },
    io.cwd,
  );
  const envFile = path.join(paths.repoRoot, '.env');
  if (!values['dry-run'] && existsSync(envFile)) process.loadEnvFile(envFile);

  const dryRun = values['dry-run'];
  const limit = Number(values.limit);
  const concurrency = Number(values.concurrency);
  const fewShotK = Number(values['few-shot']);
  const gate = values['quality-gate'] as QualityGateMode;
  if (!['off', 'hint', 'short_circuit'].includes(gate)) throw new Error(`--quality-gate must be off|hint|short_circuit`);

  // ---- dataset
  const split = values.split as SplitName;
  if (!['legacy', 'tune', 'val'].includes(split)) throw new Error('--split must be legacy|tune|val');
  const evalDir = path.join(paths.dataDir, 'eval');
  const overridesFile = values.overrides ? path.resolve(io.cwd, values.overrides) : path.join(evalDir, 'category_overrides.json');
  const exclusionsFile = values.exclusions ? path.resolve(io.cwd, values.exclusions) : path.join(evalDir, 'good_exclusions.json');
  const dataset = buildSplitDataset(
    {
      seed: readJsonl(path.join(paths.dataDir, 'snags_seed.jsonl'), SeedRecord),
      catalog: readJsonl(path.join(paths.dataDir, 'photo_catalog.jsonl'), CatalogRecord),
      snagFile: (p) => path.join(paths.dataDir, p),
      catalogFile: (p) => path.join(paths.rawRoot, p),
    },
    {
      split,
      limit,
      snagShare: Number(values['snag-share']),
      seed: Number(values.seed),
      fewShotGoodPerCategory: fewShotK,
      fewShotSnagPerCategory: fewShotK > 0 ? 1 : 0,
      ...(split === 'legacy' ? {} : { overrides: readJsonIfExists(overridesFile, CategoryOverrides), exclusions: readJsonIfExists(exclusionsFile, GoodExclusions) }),
    },
  );
  if (values['export-items']) writeFileSync(path.resolve(io.cwd, values['export-items']), JSON.stringify(dataset.eval, null, 2));

  // ---- few-shot: legacy random K per category, or a curated manifest (must come from the reserved pool)
  let fewShot: FewShotSource | undefined;
  let fewShotTag = fewShotK > 0 ? `fs${fewShotK}` : '';
  if (values['few-shot-manifest']) {
    const manifest =
      values['few-shot-manifest'] === 'curated'
        ? FEW_SHOT_MANIFEST
        : FewShotManifest.parse(JSON.parse(readFileSync(path.resolve(io.cwd, values['few-shot-manifest']), 'utf8')));
    const poolShas = new Set(dataset.pool.map((p) => p.sha256));
    const outside = manifest.examples.filter((e) => !poolShas.has(e.id));
    if (outside.length) throw new Error(`few-shot manifest ${manifest.version} uses ${outside.length} image(s) outside the reserved pool: ${outside.map((e) => e.id.slice(0, 12)).join(', ')}`);
    fewShot = createFewShotSource(manifest, poolImageStore(dataset.pool));
    fewShotTag = manifest.version;
  } else if (fewShotK > 0) {
    fewShot = loadFewShot(dataset.fewShot);
  }
  const policy = parsePolicy(values);

  // ---- provider(s)
  const prices = loadPriceTable(io.env.AI_PRICES_FILE);
  const shared: ProviderOptions = {
    prices,
    qualityGate: { mode: gate },
    policy,
    defaultFewShot: false,
    ...(values['image-max-side'] ? { image: { maxSide: Number(values['image-max-side']), quality: 85 } } : {}),
    ...(fewShot ? { fewShot, fewShotMaxSide: Number(values['few-shot-max-side'] ?? (values['few-shot-manifest'] === 'curated' ? FEW_SHOT_MANIFEST.maxSide : 768)) } : {}),
  };
  const leaf = (spec: { name: ProviderName; model?: string }): AnalysisProvider => {
    if (!dryRun) {
      const key = KEY_ENV[spec.name];
      if (key && !io.env[key]) throw new Error(`${key} is not set (add it to .env at the repo root, or use --dry-run)`);
    }
    const name: ProviderName = dryRun ? 'fake' : spec.name;
    const opts: ProviderOptions = { ...shared, ...(dryRun ? {} : spec.model ? { model: spec.model } : {}) };
    if (!dryRun && spec.name === 'claude' && values.effort) opts.claude = { effort: values.effort as 'low' | 'medium' | 'high' };
    return createProvider(name, opts);
  };

  let provider: AnalysisProvider;
  let label: string;
  let modelLabel: string;
  if (values.provider === 'cascade') {
    const specs = (values.cascade ?? 'gemini,claude:claude-sonnet-5-5').split(',').map((s) => parseProviderSpec(s.trim()));
    const [a, b] = specs;
    if (!a || !b) throw new Error('--cascade needs two providers, e.g. gemini:gemini-3.8-flash,claude:claude-sonnet-5-5');
    provider = new CascadeProvider(leaf(a), leaf(b), values['min-confidence'] ? { minConfidence: Number(values['min-confidence']) } : {});
    label = `cascade-${a.name}-${b.name}`;
    modelLabel = `${a.model ?? 'default'}->${b.model ?? 'default'}`;
  } else {
    const spec = parseProviderSpec(values.model ? `${values.provider}:${values.model}` : (values.provider ?? 'gemini'));
    provider = leaf(spec);
    label = spec.name;
    modelLabel = spec.model ?? 'default';
  }
  if (split !== 'legacy') label = `${label}-${split}`;
  if (fewShotTag) label = `${label}-${fewShotTag}`;
  if (values.label) label = `${label}-${values.label}`;
  if (dryRun) label = `dryrun-${label}`;

  // ---- run
  const startedAt = io.now();
  const outDir = values.out ? path.resolve(io.cwd, values.out) : path.join(paths.dataDir, 'eval');
  mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, `${stamp(startedAt)}-${label}`);
  io.log(`eval: ${dataset.eval.length} photos (${dataset.stats.evalSnag} snag / ${dataset.stats.evalGood} good), few-shot pool ${dataset.fewShot.length}, provider ${provider.name}${dryRun ? ' [dry-run]' : ''}`);
  const records = await runEval({
    items: dataset.eval,
    provider,
    concurrency,
    onRecord: (r, done, total) => {
      if (done % 10 === 0 || done === total) io.log(`  ${done}/${total}${r.error ? ` (last error: ${r.error.slice(0, 120)})` : ''}`);
    },
  });
  writeFileSync(`${base}.jsonl`, records.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const metrics = computeMetrics(records);
  const info: RunInfo = {
    label: path.basename(base),
    provider: provider.name,
    model: records.find((r) => r.model !== '?')?.model ?? modelLabel,
    startedAt: startedAt.toISOString(),
    promptVersion: records.find((r) => r.promptVersion)?.promptVersion,
    dryRun,
    args: { ...values },
    datasetStats: { ...dataset.stats, split, splitSizes: dataset.splitSizes, policy: policy.version },
  };
  writeFileSync(`${base}.run.json`, JSON.stringify(info, null, 2));
  const summary = renderSummary(metrics, info);
  writeFileSync(`${base}.md`, summary);
  io.log(`wrote ${base}.jsonl\nwrote ${base}.md`);
  return { jsonl: `${base}.jsonl`, summary: `${base}.md` };
}

export function loadRun(jsonlFile: string): { info: RunInfo; metrics: ReturnType<typeof computeMetrics> } {
  const records = readJsonl(jsonlFile, EvalRecord);
  const infoFile = jsonlFile.replace(/\.jsonl$/, '.run.json');
  const info: RunInfo = existsSync(infoFile)
    ? (JSON.parse(readFileSync(infoFile, 'utf8')) as RunInfo)
    : { label: path.basename(jsonlFile, '.jsonl'), provider: records[0]?.provider ?? '?', model: records[0]?.model ?? '?', startedAt: '?', dryRun: false, args: {} };
  return { info, metrics: computeMetrics(records) };
}

export function compareCommand(argv: string[], io: CliIO = defaultIO): { file: string; markdown: string } {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { last: { type: 'string' }, 'data-dir': { type: 'string' }, out: { type: 'string' } },
    allowPositionals: true,
  });
  const paths = resolvePaths({ ...io.env, ...(values['data-dir'] ? { DATA_DIR: values['data-dir'] } : {}) }, io.cwd);
  const evalDir = path.join(paths.dataDir, 'eval');
  let files = positionals.map((p) => path.resolve(io.cwd, p));
  if (files.length === 0) {
    const all = existsSync(evalDir) ? readdirSync(evalDir).filter((f) => f.endsWith('.jsonl')).sort() : [];
    files = all.slice(-Number(values.last ?? 3)).map((f) => path.join(evalDir, f));
  }
  if (files.length === 0) throw new Error(`no runs found in ${evalDir}`);
  const markdown = renderComparison(files.map(loadRun));
  const outFile = values.out ? path.resolve(io.cwd, values.out) : path.join(evalDir, `compare-${stamp(io.now())}.md`);
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, markdown);
  io.log(markdown);
  io.log(`wrote ${outFile}`);
  return { file: outFile, markdown };
}

/**
 * Offline re-scoring of a recorded run under another verdict policy (no API calls). With `--items` (an
 * `--export-items` file) the records are re-annotated with the current codesUnreliable flags, so runs
 * made by older harness versions (e.g. the baseline) are scored on the same basis.
 */
export function replayCommand(argv: string[], io: CliIO = defaultIO): { markdown: string; metrics: ReturnType<typeof computeMetrics> } {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      policy: { type: 'string', default: 'default' },
      'reject-confidence': { type: 'string' },
      'report-confidence': { type: 'string' },
      'route-confidence': { type: 'string' },
      'accept-confidence': { type: 'string' },
      'minor-only': { type: 'string' },
      items: { type: 'string' },
      out: { type: 'string' },
      raw: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });
  const file = positionals[0];
  if (!file) throw new Error('usage: cli.ts replay <run.jsonl> [--policy default|legacy] [--reject-confidence x] [--report-confidence x] [--minor-only accept|uncertain|reject] [--items items.json] [--raw]');
  let records = readJsonl(path.resolve(io.cwd, file), EvalRecord);
  if (values.items) {
    const items = JSON.parse(readFileSync(path.resolve(io.cwd, values.items), 'utf8')) as EvalItem[];
    const bySource = new Map(items.map((i) => [i.source, i] as const));
    records = records.filter((r) => bySource.has(r.source ?? '')).map((r) => {
      const it = bySource.get(r.source ?? '');
      return { ...r, ...(it?.codesUnreliable ? { codesUnreliable: true } : {}), expectedCodes: it?.expectedCodes ?? r.expectedCodes };
    });
  }
  const policy = parsePolicy(values);
  const scored = values.raw ? records : replayRecords(records, policy);
  const metrics = computeMetrics(scored);
  const info = loadRun(path.resolve(io.cwd, file)).info;
  const markdown = renderSummary(metrics, { ...info, label: `${info.label} replay ${values.raw ? 'as-recorded' : policy.version}` });
  if (values.out) writeFileSync(path.resolve(io.cwd, values.out), markdown);
  io.log(markdown);
  return { markdown, metrics };
}

export async function main(argv: string[], io: CliIO = defaultIO): Promise<void> {
  const [cmd, ...rest] = argv;
  if (cmd === 'run') await runCommand(rest, io);
  else if (cmd === 'compare') compareCommand(rest, io);
  else if (cmd === 'replay') replayCommand(rest, io);
  else throw new Error('usage: cli.ts run [--provider gemini|claude|openai|cascade|fake] [--model X] [--dry-run] ... | compare [--last N | files...]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
