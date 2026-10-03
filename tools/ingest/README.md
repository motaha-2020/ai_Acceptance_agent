# @acceptance/ingest

Node-only ingestion tools (TypeScript, run with `tsx`) that turn the raw customer data in
`E:\Claud code\Ai acceptance agent\` (read-only, one level above the repo) into seed data under
`acceptance-system/data/` (git-ignored: it contains customer photos).

Override locations with `RAW_ROOT` / `DATA_DIR` environment variables.

| Script | Task | Output |
|---|---|---|
| `pnpm ingest:snags` | T1.1 | `data/snags_seed.jsonl`, `data/snags/<docSlug>/<nn>.<ext>` |
| `pnpm ingest:site`  | T1.3 | `data/sites/nasr3-r21c.json` |
| `pnpm ingest:photos`| T1.4 | `data/photo_catalog.jsonl`, `data/photo_duplicates.json` |
| `pnpm test`         | unit tests (vitest) | |
| `pnpm typecheck`    | `tsc --noEmit` | |

All output schemas are zod schemas in `src/schemas.ts`.

## T1.1 Snag seed

Sources: `po17 sangs.docx`, `po18 sangs.docx`, `sangs afro & T.t.docx` (slugs `po17`, `po18`, `afro-tt`).

`word/document.xml` is walked in body order (`src/docx/bodyTokens.ts`): each embedded image
(`a:blip r:embed`, resolved through `word/_rels/document.xml.rels`) and each non-empty paragraph
becomes a token. `mc:Fallback` blocks (VML duplicates of the red/green annotation arrows) are ignored.
`src/snags/group.ts` groups consecutive images with the following text paragraph(s); a new group
starts at the next image after remarks.

One JSONL record per (image, remark):

```
{ id, sourceDoc, order, imageNo, imagePath, remarkAr, remarkIndex, remarksInGroup, groupId, imagesInGroup }
```

* `id`: `<slug>-<nn>` or `<slug>-<nn>-r<k>` when the group has several remarks.
* `order`: running record position in document order. `imageNo`: 1-based image number in the doc
  (= file name `<nn>`); `imagePath` is relative to `data/`.
* `remarkAr`: trimmed, list numbering (`1_`, `2-`, `-`, Arabic digits) stripped, whitespace collapsed.
  `null` when an image has no remark. Text with no image yields `imageNo/imagePath = null` (none exist today).
* Several photos sharing one remark: same `groupId`, `imagesInGroup > 1`.
* One photo with several numbered remarks: one record per remark (`remarkIndex` / `remarksInGroup`), so
  count images with `imageNo` (distinct), not with record count.
* Numbering-only or single-character paragraphs (`1`, `-`, a stray `ا`) are dropped.

## T1.3 Site seed (`NASR3...C(R21C)`)

Generic parsers (path in, typed object out) in `src/site/`:

| Parser | Input | Notes |
|---|---|---|
| `inventory.ts` | Cisco `show inventory` text | NAME/DESCR + PID/VID/SN blocks, classified: chassis, route_processor, line_card, fabric_card, fan_tray, power_tray, power_module, transceiver |
| `mapping.ts` | `Mapping Sheet/*odf mapping.xlsx` | port -> `ODF n - X(a,b)` for CC and TIE, plus UPLINK peer |
| `mapping.ts` | `Mapping Sheet/*utilization sheet*.xlsx` | 12 panels x 12 fibers grid per ODF, kind CC/TIE |
| `fiberTest.ts` | `Fiber Test/*.xlsx` | two layouts auto-detected: panel-by-fiber (ODF1) and fiber-pair-by-panel with TX/RX (ODF2-4) |
| `lld.ts` | LLD docx | header info, install table, internal links (parent/child router + interface, cost) |
| `sid.ts` | SID docx | `Site Data` label/value grid (handles merged 5-cell rows), active BOM, passive power and telco passive tables |
| `checks.ts` | assembled seed | cross-source consistency checks -> `warnings[]` |

`build.ts` assembles everything and validates it with `SiteSeed` (zod) before writing.
Interface names are normalised to short form (`Gi0/0/0/1`, `Te0/0/0/30`).

`warnings` lists real inconsistencies found in the source files (loss outliers, copied sheets,
BOM/inventory/LLD/mapping mismatches). Treat them as data-quality findings, not parser failures.

## T1.4 Photo catalogue

`data/photo_catalog.jsonl`: `{ site, device, category, relPath, bytes, sha256 }`, one line per photo
(791 photos for the 4 sites). `relPath` is relative to the raw root; photos are not copied.
`category` is the `PhotoCategory` enum from `@acceptance/shared`.

Folder -> category mapping is rule based (`src/photos/category.ts`) on the normalised folder name, so
the source typos work (`Aromourd`, `Managment`, `Lables`, `saystem`, `Pasth`, `ARMOUD PATH`, ...).
`Labels` folders take their meaning from the parent (cross connect / tie / uplink / power).
NASR3 specifics: `ODF(1|2)CC` -> `odf_cross_connect`, `ODF(3|4)MMR` -> `odf_tie`, `Up Links` -> `uplink`,
`BASE` -> `rack_base`, `RACKS` -> `rack`. The loose `POWER` folder (no sub-folders) is an **assumption**:
mapped to `power_path` and reported by the CLI.

The CLI prints counts per category and site, unmapped folders, assumed mappings, and duplicate groups
(`data/photo_duplicates.json`, classified `same-category` / `cross-category` / `cross-site`).
Exact duplicates across categories/sites will leak if photos are split into train/eval by file;
split by `sha256` instead.
