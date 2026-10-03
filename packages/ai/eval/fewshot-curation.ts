/**
 * Curated few-shot selection (T3.5). Every pick must come from the reserved few-shot pool of the eval
 * splits (never TUNE/VAL). Run `pnpm --filter @acceptance/ai fewshot:build` to regenerate
 * src/fewshot-manifest.ts; `--export <dir>` also copies the images as `<sha256>.jpg` for object storage.
 *
 * Selection rules: 2 accepted photos per category, preferring accepted photos that earlier runs wrongly
 * flagged (they teach what normal looks like), plus 1 rejected photo for the categories whose codes the
 * model confused most (ODF spares/caps, patch-cord dressing, duct cover, management, rack housekeeping).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSnag } from '@acceptance/checklist';
import type { PhotoCategory } from '@acceptance/shared';
import { FewShotManifest, type FewShotManifestEntry } from '../src/fewshot.js';
import { buildSplitDataset, CatalogRecord, readJsonl, SeedRecord, type EvalItem } from './dataset.js';
import { resolvePaths } from './paths.js';

export const CURATED_VERSION = 'fs1-2026-10-03';
export const CURATED_MAX_SIDE = 768;

/** sha256 prefix -> [category to show it under, explanation]. */
const PICKS: ReadonlyArray<readonly [string, PhotoCategory, string]> = [
  // ── accepted ──
  ['9b7fdc6411', 'armoured_cables', 'Armoured cable on the ladder; ordinary building dust on the old floor is not a snag.'],
  ['4c4bcc4760', 'armoured_cables', 'Armoured cables dressed along the ladder and tied; this is the expected standard.'],
  ['89d4f30ee3', 'duct', 'Closed duct with covers on; small gaps between cover sections and the open finger-type bend fittings are normal.'],
  ['e5d3eb460a', 'duct', 'Duct run with covers fitted; nothing to remark.'],
  ['ce8d978321', 'earth_path', 'Earth cable tied along the under-floor ladder; pre-existing dirt under the raised floor is not a snag.'],
  ['d17e654dfd', 'earth_path', 'Earth bar connection with labelled lugs; accepted.'],
  ['3d86a94aa4', 'management', 'Management cable routed in the tray and tied; accepted.'],
  ['a4b86628be', 'management', 'Management cable path; accepted.'],
  ['0f63b9f9a3', 'odf_cross_connect', 'ODF with cords bundled in velcro, labels hanging on the cords, no spares inside; accepted.'],
  ['e4072b7de6', 'odf_cross_connect', 'Close-up inside the ODF; labels and cords as expected; accepted.'],
  ['28aa625d73', 'odf_cross_connect_labels', 'Printed cord labels read in a close-up, fingers may hold them; accepted.'],
  ['b468fe94b0', 'odf_cross_connect_labels', 'Label close-up; short "ODF-CC x(y,z)" text is the agreed format, not incomplete.'],
  ['420e99ce87', 'odf_sheet', 'ODF port sheet in its plastic sleeve; partly cropped or glossy sheets are still accepted.'],
  ['676afab35e', 'odf_sheet', 'ODF sheet posted on the door; accepted.'],
  ['9441f5bbc7', 'odf_tie', 'Tie ODF with armoured cable entry and labelled cords; accepted.'],
  ['c9ba93688c', 'odf_tie', 'Tie ODF close-up; accepted.'],
  ['522ebadde1', 'odf_tie_labels', 'Tie ODF label close-up; the short printed label is the agreed format.'],
  ['3050040a9e', 'odf_tie_labels', 'Tie ODF labels; accepted.'],
  ['aa0b1214f1', 'patch_cords', 'Patch cords in the overhead tray, bundled with velcro; accepted.'],
  ['5673ccfe6f', 'patch_cords', 'Patch cord bundles splitting towards several racks is the design, not multiple paths; accepted.'],
  ['44aec038b6', 'pdu', 'PDU with breakers and labelled feed cables; blank labels on unused breakers are fine.'],
  ['e7e24f92ca', 'pdu', 'PDU without cover; accepted.'],
  ['32a754762e', 'power_labels', 'Printed wrap-around power labels; accepted.'],
  ['d58c74db82', 'power_labels', 'Power cable labels; accepted.'],
  ['2d0c112f6e', 'power_path', 'Power cables on the under-floor ladder; old floor dirt is not a snag.'],
  ['b9a61f4612', 'power_path', 'Power path; accepted.'],
  ['3f286417d0', 'power_system', 'Power cables dressed and tied; accepted.'],
  ['f0aa0f7dad', 'power_system', 'Power cable dressing; accepted.'],
  ['86b16c5902', 'rack', 'Rack with doors open to show the inside; open doors in an inside shot are normal.'],
  ['891594ce21', 'rack', 'Rack overview; accepted.'],
  ['2e59981201', 'rack_base', 'Rack base with spirit level and bolts; accepted.'],
  ['ca412036bd', 'rack_base', 'Rack base; accepted.'],
  ['9535e2c05f', 'router', 'Router front with labelled cords; accepted.'],
  ['71f1683dce', 'router', 'Router close-up; accepted.'],
  ['4a7e155580', 'test_room', 'ODF tie in the test room; accepted.'],
  ['d075029166', 'test_room', 'Rack in the test room; accepted.'],
  ['00641b47c3', 'uplink', 'Uplink cords in the tray following the patch cord bundle; accepted.'],
  ['94939ab910', 'uplink', 'Uplink path; accepted.'],
  ['1d6ab7f47a', 'uplink_labels', 'Two-line uplink label (local and remote hostname/port); accepted.'],
  ['c6c8f9b18c', 'uplink_labels', 'Uplink label close-up; accepted.'],
  // ── rejected ──
  ['902ddc5972', 'odf_cross_connect', ''],
  ['5816297cd1', 'odf_tie', ''],
  ['a60cb87cd3', 'patch_cords', ''],
  ['05eafd8200', 'duct', ''],
  ['629710671c', 'management', ''],
  ['c03b48e5ab', 'rack', ''],
  ['0af7670f93', 'armoured_cables', ''],
  ['2204c2b354', 'rack_base', ''],
  ['d86782c893', 'router', ''],
];

function explainSnag(it: EvalItem): string {
  const titles = it.expectedCodes.map((c) => getSnag(c)?.titleEn ?? c).join('; ');
  return `The reviewers rejected it for: ${titles}.`;
}

export function buildManifest(pool: readonly EvalItem[]): FewShotManifest {
  const examples: FewShotManifestEntry[] = PICKS.map(([prefix, category, explanation]) => {
    const it = pool.find((p) => p.sha256.startsWith(prefix));
    if (!it) throw new Error(`curated pick ${prefix} is not in the reserved few-shot pool`);
    return {
      id: it.sha256,
      category,
      kind: it.kind,
      codes: it.kind === 'snag' ? it.expectedCodes : [],
      ...(it.kind === 'snag' && it.remarks.length ? { note: it.remarks.join(' / ') } : {}),
      explanation: it.kind === 'snag' ? explainSnag(it) : explanation,
      source: it.source,
    };
  });
  return FewShotManifest.parse({ version: CURATED_VERSION, maxSide: CURATED_MAX_SIDE, examples });
}

function main(): void {
  const paths = resolvePaths();
  const ds = buildSplitDataset(
    {
      seed: readJsonl(path.join(paths.dataDir, 'snags_seed.jsonl'), SeedRecord),
      catalog: readJsonl(path.join(paths.dataDir, 'photo_catalog.jsonl'), CatalogRecord),
      snagFile: (p) => path.join(paths.dataDir, p),
      catalogFile: (p) => path.join(paths.rawRoot, p),
    },
    { split: 'tune', limit: 0 },
  );
  const manifest = buildManifest(ds.pool);
  const target = fileURLToPath(new URL('../src/fewshot-manifest.ts', import.meta.url));
  writeFileSync(
    target,
    [
      "import type { FewShotManifest } from './fewshot.js';",
      '',
      '/**',
      ' * Curated few-shot manifest (T3.5). GENERATED by `pnpm --filter @acceptance/ai fewshot:build` from',
      ' * eval/fewshot-curation.ts - edit the picks there. Images are NOT in git (see fewshot.ts / README).',
      ' */',
      `export const FEW_SHOT_MANIFEST: FewShotManifest = ${JSON.stringify(manifest, null, 2)};`,
      '',
    ].join('\n'),
  );
  console.log(`wrote ${target}: ${manifest.examples.length} examples (${manifest.version})`);
  const i = process.argv.indexOf('--export');
  const dir = i > 0 ? process.argv[i + 1] : undefined;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    for (const e of manifest.examples) {
      const it = ds.pool.find((p) => p.sha256 === e.id);
      if (it && existsSync(it.file)) copyFileSync(it.file, path.join(dir, `${e.id}.jpg`));
    }
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`exported ${manifest.examples.length} images to ${dir}`);
  }
  void readFileSync;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
