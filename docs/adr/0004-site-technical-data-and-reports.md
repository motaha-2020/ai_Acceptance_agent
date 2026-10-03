# ADR 0004: Site technical data and acceptance reports

Date: 2026-10-03 · Status: accepted · Tasks: T6.1–T6.4

## Context

The acceptance report (SID layout, 12 sections) needs per-site technical data that does not come
from photos: SID site-data fields, `show inventory`, LLD install table and internal links, ODF port
mapping and utilization grids, fiber test results, and BOM. The sources are customer files
(txt/xlsx/docx) whose parsers already existed in `tools/ingest` (T1.3).

## Decision

1. **Parsers are a package.** `packages/parsers` holds the pure parsers (input = path or
   `{name, data}`), the zod schemas, upload classification (`guessKind`, `parseSiteDocuments`),
   merge rules and cross-checks. `tools/ingest` re-exports them.
2. **Storage = one row per site with typed JSON columns** (`site_technical_data`: `siteData`,
   `inventory`, `lld`, `portMap`, `utilization`, `fiberTests`, `survey`, `sources`, `warnings`).
   - Every write (API import) and read (report worker) goes through `SiteTechnical` (zod), so the
     columns are typed even though Postgres stores JSONB.
   - Rejected: normalised tables for ports/fibers/measurements. The data is read only as a whole
     by the report, is never queried per port, and the shapes follow customer spreadsheets that
     change; a dozen small tables would add migrations without a query that needs them.
   - BOM stays in the existing `bom_lines` table (`source` = `sid` | `inventory`); the report
     prefers SID active lines and falls back to the inventory-derived BOM.
3. **Imports merge**: single-file kinds (inventory, LLD, SID site data) replace; multi-file kinds
   merge by key (port; ODF kind+number; ODF number) so sheets can be uploaded one by one. Raw
   source files are stored in object storage under `site-docs/<siteId>/…`, provenance in `sources`.
4. **Cross-checks** (inventory vs BOM serials, LLD vs mapping uplinks, mapping vs utilization,
   loss > 3 dB, invalid IPs, SID vs inventory) run after each import and again at report time;
   checks comparing two sources run only when both exist. Results are warnings, never errors.
5. **Reports** (`reports` table): status `queued → running → ready | failed`, version per site,
   `draft` flag, `docxKey`/`pdfKey`, `warnings`, `meta` (counts, checklist summary, AI stats).
   A final report is refused while open/unverified snags or unreviewed photos exist; `draft=true`
   bypasses the gate and marks the document DRAFT. Generation runs in the worker
   (`generate-report` job): DOCX with the `docx` library (`packages/report`, pure), PDF with
   LibreOffice headless when `soffice` is installed (otherwise a warning, DOCX only).

## Consequences

- The worker image needs LibreOffice + fonts for PDF (see `packages/report/README.md`).
- Changing a JSON shape needs a schema change in `packages/parsers` and, for stored rows, a
  data migration or a tolerant `default()`.
