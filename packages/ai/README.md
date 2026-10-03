# @acceptance/ai

Vision analysis of installation photos (P3): provider adapters behind the `AnalysisProvider` contract
from `@acceptance/shared`, a local photo-quality gate, a cascade (cheap model first, strong model for
doubtful photos), and the eval / bake-off harness.

```
src/
  core.ts          VisionProvider: quality gate -> prompt -> vendor call (retry) -> zod parse -> 1 repair -> cost
  prompt.ts        vendor-neutral prompt parts (checklist prefix + photo gate + category block + few-shot + photo)
  schema.ts        one JSON schema from the zod AnalysisResult, adapted per vendor (Claude / OpenAI strict / Gemini)
  parse.ts         JSON extraction, null stripping, zod validation, deterministic normalisation, repair message
  quality.ts       local blur (Laplacian variance) + darkness (mean luminance) gate, configurable thresholds
  image.ts         EXIF rotate + downscale (longest side 1568 px) + JPEG re-encode (drops GPS metadata)
  retry.ts         exponential backoff with jitter on 429/5xx/timeouts, honours Retry-After
  errors.ts        ProviderError (vendor-neutral error kinds)
  pricing.ts       price table (CONFIG, must be verified) + cost calculation
  cascade.ts       CascadeProvider + escalation policy
  factory.ts       createProvider(name, options), createCascade(spec)
  providers/       claude.ts, gemini.ts, openai.ts (thin SDK adapters), fake.ts (offline)
eval/              dataset builder, runner, metrics, markdown reports, CLI
scripts/           quality-stats.ts (quality gate calibration over the real photos)
```

## Usage (worker)

```ts
import { createCascade, createProvider } from '@acceptance/ai';

// Production default (pending bake-off numbers): Gemini Flash first, Claude Sonnet 5.5 on escalation.
const provider = createCascade();
// or a single provider:
const claude = createProvider('claude', { model: 'claude-opus-5-5', claude: { effort: 'medium' } });

const { result, meta } = await provider.analyze({ image: { data, mediaType: 'image/jpeg' }, category: 'patch_cords' });
// meta.promptVersion must be stored with every Analysis row (eval regressions are keyed on it).
```

`meta` is an `AnalysisMeta`; providers return a superset (`ExtendedMeta` with token usage breakdown,
`repaired`, `quality` report; `CascadeMeta` with `escalated`, `escalationReasons`, `stages`). The shared
contract was **not** changed. Few-shot examples are passed through provider options (`fewShot`), not the request.

API keys: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY` (or the `apiKey` option).

### Vendor specifics (all isolated in `src/providers/*`)

| | Claude (`@anthropic-ai/sdk`) | Gemini (`@google/genai`) | OpenAI (`openai`, Responses API) |
|---|---|---|---|
| strict JSON | `output_config.format` json_schema | `responseMimeType` + `responseJsonSchema` | `text.format` json_schema, `strict: true` (optional -> nullable) |
| caching | explicit: breakpoint on system prefix + after category block/few-shot | implicit prefix caching (systemInstruction first) | automatic + `prompt_cache_key` per prompt version/category |
| reasoning | adaptive thinking (default on 5.5 models), `effort` default `medium`; omitted for Haiku 4.5 | `thinkingLevel` optional | `reasoning.effort` optional |
| extras | server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`) on Opus/Sonnet 5.5, disable with `refusalFallback: false` | SDK retries off | `store: false` |
| default model | `claude-sonnet-5-5` | `gemini-3.8-flash` | `gpt-6.1-sol` |

SDK-level retries are disabled everywhere; `withRetry` in the core retries 429/5xx/timeouts uniformly.
Every response is re-validated with zod; an invalid answer gets exactly one repair turn that feeds the
validator error back to the model, then fails with `ProviderError('invalid_output')`.
Haiku 4.5 alias: `claude-haiku-4-5` (the dated id `claude-haiku-4-5-20251001` also works and prices by prefix).

## Quality gate (T3.2)

* Local, before any vendor call: blur = variance of the 3x3 Laplacian on a 512 px greyscale copy;
  darkness = mean luminance and share of near-black pixels. Thresholds in `DEFAULT_QUALITY_THRESHOLDS`,
  overridable via `qualityGate.thresholds`.
* Modes: `hint` (default: measurements are given to the model, report returned in `meta.quality`),
  `short_circuit` (reject locally without calling the vendor - enable only after thresholds are validated
  against real reviewer rejections), `off`.
* PERSON_IN_FRAME / WRONG_CATEGORY / blurry / dark are judged by the model in a "Step 1 - photo gate"
  block appended to the cached system prefix (`PHOTO_GATE_INSTRUCTIONS` in `prompt.ts`).

**Calibration** (`pnpm --filter @acceptance/ai quality:stats`, 2026-10-03, 791 catalogue + 108 snag photos):
the racks are black, so accepted photos are dark (catalogue min mean luminance 30, max near-black share 0.75)
and some are soft (min Laplacian variance 52). Defaults (`blur < 40`, `mean < 15` or `near-black > 0.92`)
flag none of the accepted photos; a Gaussian blur of sigma 5 or a 0.4x brightness on a real photo is
flagged. No genuinely rejected-for-blur photo exists yet, so re-calibrate from reviewer decisions.

## Eval harness (T3.4)

Dataset (deterministic per `--seed`):
* **snag photos**: `data/snags_seed.jsonl` grouped per image, expected codes = union of
  `matchReviewerRemark()` over its remarks, duplicates across documents merged by sha256. Their upload
  category is unknown: it is inferred from the codes (primary category of each code) and category
  judgements (`WRONG_CATEGORY`) are not scored for them.
* **assumed-good photos**: `data/photo_catalog.jsonl`, deduplicated by sha256, excluding any sha256 that is
  also a snag photo, sampled round-robin across categories. They are only *assumed* good: false
  positives on them are worth a human look.
* **splits**: `--few-shot K` reserves K good photos per category + 1 snag photo per category as few-shot
  examples; split is by sha256 and asserted disjoint from the eval split.

Metrics: per-code precision/recall/F1 (+ micro), photo-level accuracy (decided and strict), confusion
(expected accept/reject x predicted accept/reject/uncertain/error), snag catch rate (reject+uncertain on
snag photos: what a human will see), false-accept rate (the dangerous error), false-reject rate, uncertain
rate, latency avg/p50/p95, total and per-photo cost, cascade escalation rate.

```bash
# offline smoke test (fake provider through the full core; numbers meaningless)
pnpm --filter @acceptance/ai eval --provider gemini --limit 150 --concurrency 4 --dry-run
```

Options: `--provider claude|gemini|openai|cascade|fake`, `--model`, `--cascade a[:model],b[:model]`,
`--min-confidence 0.7`, `--limit 150`, `--snag-share 0.5`, `--concurrency 4`, `--seed 1`, `--few-shot K`,
`--quality-gate hint|off|short_circuit`, `--effort low|medium|high` (Claude), `--dry-run`,
`--data-dir`, `--raw-root`, `--out`. Outputs (git-ignored, contain customer data references):
`data/eval/<timestamp>-<label>.jsonl` (one record per photo), `.md` (summary), `.run.json` (run info).

## Bake-off (T3.6) - how to run once API keys exist

1. Put the keys in `acceptance-system/.env` (git-ignored; template in `.env.example`):
   `ANTHROPIC_API_KEY=...`, `GEMINI_API_KEY=...`, `OPENAI_API_KEY=...`.
2. Verify the prices in `src/pricing.ts` against the vendor pricing pages (or write overrides to a JSON
   file and set `AI_PRICES_FILE`). Check that the default model ids are still current.
3. Smoke-test each key with 5 photos, then run the full set (same `--seed`/`--limit` = same 150 photos):

```bash
pnpm --filter @acceptance/ai eval --provider gemini --limit 5 --concurrency 2        # key check
pnpm --filter @acceptance/ai eval --provider gemini --model gemini-3.8-flash      --limit 150 --concurrency 4
pnpm --filter @acceptance/ai eval --provider gemini --model gemini-3.1-flash-lite --limit 150 --concurrency 4
pnpm --filter @acceptance/ai eval --provider claude --model claude-haiku-4-5      --limit 150 --concurrency 4
pnpm --filter @acceptance/ai eval --provider claude --model claude-sonnet-5-5     --limit 150 --concurrency 4
pnpm --filter @acceptance/ai eval --provider claude --model claude-opus-5-5       --limit 150 --concurrency 2
pnpm --filter @acceptance/ai eval --provider openai --model gpt-6.1-sol           --limit 150 --concurrency 4
pnpm --filter @acceptance/ai eval --provider cascade --cascade gemini:gemini-3.8-flash,claude:claude-sonnet-5-5 --min-confidence 0.7 --limit 150 --concurrency 4
pnpm --filter @acceptance/ai eval:compare --last 7      # side-by-side table -> data/eval/compare-<ts>.md
```

Rough budget (prompt prefix ~7k tokens + ~1.5-2.5k image tokens per photo, mostly cached after the
first photo of a category): low single-digit USD per 150-photo run for Flash/Sonnet-class models, about
double for Opus; the whole bake-off should stay well under 30 USD. The `.md` summaries report the exact
cost from token usage.

**How to choose**: first filter on false-accept rate (snag photos auto-accepted) and snag catch rate,
then per-code recall on the frequent codes, then cost per 1000 photos and p95 latency. The cascade's
`--min-confidence` trades escalation rate (cost) against false accepts; rerun the cascade at 0.6 / 0.7 /
0.8 and compare. In Phase 1 every photo is still reviewed by a human, so "uncertain" is cheap but a
false "accept" erodes trust in the agreement metrics that gate Phase 2 autonomy.

## Tests

`pnpm --filter @acceptance/ai test` - schema conversion, parsing/repair, cost, retry, cascade logic,
quality gate (synthetic + real catalogue photos when present), adapters against recorded HTTP responses
(real SDKs with an injected `fetch`), eval metrics with hand-computed fixtures, dataset splits, and a
dry-run end-to-end of the CLI on a temporary fixture dataset. No network is used.
