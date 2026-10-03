# AI tuning log (T3.5)

Append-only. Each iteration: date, what changed, metrics, spend. Model: Claude Sonnet 5.5
(`claude-sonnet-5-5`) unless stated. Eval outputs (git-ignored) are in `data/eval/`.

Metric definitions (`packages/ai/eval/metrics.ts`): **FA** = snag photo -> accept (strict, incl. accept with
notes; hard constraint 0%); **FR** = assumed-good photo -> reject; **unc good / unc snag** = share answered
`uncertain` (goes to a human, Phase 1 reviews everything anyway); code **P/R** = micro precision/recall of
snag codes vs codes mapped from reviewer remarks.

## 2026-10-03 - Iteration 0: error analysis of the T3.6 run (no spend)

Run analysed: `2026-10-03T07-07-34-124Z-claude` (150 photos, legacy split, `--few-shot 2`):
FA 0%, FR 50.7% (38/75), uncertain 14.7%, code P/R 20.5%/34.5%. 36 images inspected by eye
(18 false rejects, 18 snag photos), the rest classified from the predictions and the cross-run agreement of
all 9 earlier runs.

### False rejects on good photos (38)

| cause | n | examples |
|---|---|---|
| (a) eval-label noise: "good" photo shows a real snag | 5 | person in background (NCS rack (5), patch cords 9906 (10)), work-in-progress photo with legs and debris (9902 power path (31)), loose SC connectors in the ODF tray (9906 ODF CC (6)), loose AC plug above the PDU (9902 PDU with cover (2)) |
| (a) eval-label noise: wrong/duplicate category | 2 | NASR3 uplink-label close-ups filed under ODF(1)CC/ODF(2)CC *and* "Up Links" (76 cross-category sha256 duplicate groups in total); power system/power path duplicates |
| (b) prompt over-strictness | 22 | DUST_OR_DIRT / PACKAGING_OR_DEBRIS_LEFT for pre-existing dirt under the raised floor or old exchange floors (9); LABEL_INFO_INCOMPLETE on correct short labels (5); DUCT_COVER_OPEN on open bend fittings / cover joints (4); management/patch cord "untidy" on accepted dressing (4) |
| (c) taxonomy / category ambiguity | 9 | WRONG_CATEGORY on close-ups of a related category (ODF labels under the ODF, rack label under test room, label held at the router) (6); SUBJECT_NOT_FULLY_VISIBLE on normal close-ups / cropped sheets (3) |
| (d) model limitation | 0 | - |

"Any snag rejects" (old rule 7) turned every cosmetic doubt into a reject; rule "WRONG_CATEGORY -> reject,
skip the checklist" turned category ambiguity into rejects.

### Wrong / missing codes on snag photos (75)

| cause | n | notes |
|---|---|---|
| (a) inferred upload category wrong -> model answered WRONG_CATEGORY and skipped the checklist | 13 | e.g. PDU photo inferred as rack (po18/08), ODF window inferred as rack (po18/49), earth bar inferred as ODF labels (po17/30) |
| (a) remark does not describe the picture (document pairing) | 3 | afro-tt/02, afro-tt/04 (tray-level remark on a busbar panel / router), po18/42 (armoured remark on a router top) |
| (c) code-family ambiguity | ~15 | reviewers' generic "السستمه تتعدل" vs NOT_BUNDLED / MULTIPLE_PATHS / EXCESS_LENGTH; DUST vs MARKER |
| (d) small/subtle defects missed | ~12 | door ajar (po17/12), dust (po18/39), rack-floor gap (po17/42), dust caps in close-ups |

### Cleanup produced (hypotheses for reviewers)

* `data/eval/category_overrides.json` (`co1`): 43 entries - 24 NASR3 uplink-label cross-duplicates ->
  `uplink_labels`; 17 snag photos with a visually verified / >= 4-of-6-runs category (3 of them marked
  `codesUnreliable`: kept for verdict metrics, excluded from code metrics); 2 good photos.
* `data/eval/good_exclusions.json` (`ge1`): 6 "good" photos with a visible real snag (the 5 above plus a
  cable dropping through a bare rack-top opening, 8/9 runs agree).

## 2026-10-03 - Setup: splits, decision layer, curated few-shot

* Splits (`--split tune|val`): few-shot pool reserved first (3 good + 2 snag per category, seed 1, 80 photos;
  contains the legacy `--few-shot 2` selection), remainder split with seed 101: TUNE = 30 snag + 247 good,
  VAL = 58 snag + 363 good, 6 exclusions. Pool/TUNE/VAL asserted sha256-disjoint. TUNE runs: 30+30 photos;
  VAL: 58 snag + 92 good = 150.
* Baseline on TUNE/VAL = the pre-T3.5 code (commit d4a5da6 harness, prompt `2026-10-03.1+...+ai.1`,
  `--few-shot 2`) run from a scratch worktree on exactly the same items.
* Decision layer (`packages/ai/src/policy.ts`): model reports snags with confidence + evidence + bbox, a
  versioned policy decides; runs can be re-scored offline (`eval/cli.ts replay`).

## Iterations on TUNE (60 photos)

All rows re-scored with the final policy `vp3` (replay) except the baseline (legacy rule, as run).

| it | change | FA | FR | unc good / snag | code P / R | $/photo | p50 ms | run cost |
|---|---|---|---|---|---|---|---|---|
| 0 | baseline (old prompt, any snag rejects, fs2 random) | 0.0% | 43.3% | 36.7% / 3.3% | 24.3% / 43.9% | 0.0137 | 4030 | $0.82 |
| 1 | new prompt (norms, site decisions, evidence+confidence, related categories, severity verdict), fs2 | 16.7% (as run vp1: 30%) | 6.7% | 36.7% / 50.0% | 32.5% / 31.7% | 0.0135 | 3132 | $0.81 |
| 2 | "never suppress a possible defect, report it with low confidence" | 0.0% | 3.3% | 60.0% / 70.0% | 29.4% / 36.6% | 0.0150* | 4961 | $0.90 |
| 3 | curated few-shot fs1 (2 accepted per category incl. previously over-flagged ones + 9 rejected) | 3.3% | 3.3% | 66.7% / 70.0% | 37.5% / 36.6% | 0.0124* | 4228 | $0.74 |
| 4 | it3 + effort high | 0.0% | 3.3% | 50.0% / 70.0% | 38.6% / 41.5% | 0.0137 | 6445 | $0.82 |
| 5 | + close-up rule (judge everything in the frame), effort high | 0.0% | 3.3% | 63.3% / 73.3% | 38.8% / 46.3% | 0.0181* | 6072 | $1.09 |
| 6 | it5 prompt, effort medium (**final candidate**) | 0.0% | 3.3% | 63.3% / 73.3% | 37.0% / 41.5% | 0.0107 | 4734 | $0.64 |

\* includes prompt-cache writes after a prompt change (first run of a new prefix).

Policy findings (offline replays, no spend):
* vp1 (drop < 0.5, reject >= 0.7) let silent false accepts through (model half-saw the defect at 0.25-0.3).
  Fix: **hold** - any reported defect >= 0.3 blocks an accept; **accept confidence** 0.65 (one snag photo was
  accepted at 0.6 with LABEL_DAMAGED 0.27). Both are needed for FA 0 on it2-it6 except it3 (po18/05, a
  label close-up accepted at 0.8 with no finding -> fixed by the close-up rule in it5).
* Ignoring SUBJECT_NOT_FULLY_VISIBLE in the hold (to cut good-photo uncertain) re-introduced a false accept
  (po18/34) -> rejected.
* Accept-with-notes for minor-only findings (D9 as requested) gave strict false accepts (1-2 per run) and no
  benefit on good photos -> D9 default set to `uncertain` (one-line switch).
* reject threshold 0.6 vs 0.7 vs 0.8: changes the reject/uncertain split on snag photos only; 0.7 kept.
* Effort high: slightly better codes, not consistently better uncertain, +40% latency, higher cost -> medium.

## 2026-10-03 - VALIDATION (final candidate vs baseline) - INCOMPLETE

Both runs were started together (`...-claude-val-fs2-baseline`, `...-claude-val-fs1-2026-10-03-final`).
After 61 photos each the Anthropic API returned `400 invalid_request_error: You have reached your specified
API usage limit` for the remaining 89 photos (account spend cap; not a code error). The 61 completed photos
are the same in both runs (58 snag + 3 good), compared in `data/eval/val-intersection-*.jsonl`:

| | FA | FR (n=3 good) | reject / uncertain on snag | code P / R | $/photo | p50 ms |
|---|---|---|---|---|---|---|
| baseline | 0.0% | 3/3 rejected | 98.3% / 1.7% | 38.8% / 41.7% | 0.0142 | 4634 |
| final (vp3, fs1, medium) | 0.0% | 0/3 rejected (3 uncertain) | 20.7% / 79.3% | 37.1% / 27.1% | 0.0119 | 4823 |

Reading: on 58 held-out snag photos the hard constraint holds (0 false accepts) and code precision is
unchanged, but the final policy sends 79% of snag photos to "uncertain" instead of "reject" and code recall
is lower. The good-photo half of VAL (92 photos) is still unmeasured, so the FR claim rests on TUNE
(43.3% -> 3.3%). **Re-run VAL once the API limit is raised** (about $2 for both):

```bash
# final candidate (repo)
pnpm --filter @acceptance/ai eval --provider claude --split val --limit 150 --few-shot-manifest curated --concurrency 4 --label final
# baseline: pre-T3.5 harness from a worktree of d4a5da6 with EVAL_ITEMS_FILE=<items-val.json from --export-items>
```

## Spend

| run | cost |
|---|---|
| TUNE baseline + it1-it6 | $5.82 |
| VAL baseline (61/150) + final (61/150) | $1.59 |
| **total T3.5** | **$7.41** (budget $20) |
