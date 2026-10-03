# @acceptance/report

Pure generator of the SID-style acceptance report (T6.1/T6.3).

- `buildAcceptanceReport(data: ReportData): Promise<Buffer>` — DOCX via the `docx` library. `ReportData`
  is zod-validated (`src/data.ts`); the worker builds it from the DB (`apps/worker/src/reports`).
- Layout follows the real SID: A4, 0.5" margins, double page border, different first page (cover, no
  header), header = site name (Arabic when given), Calibri body, numbered 12 sections, shaded label
  cells, blue table headers. Sections 8–9 (ODF grids, fiber tests) are a landscape section.
- Acceptance check list: the 58 SID items (`src/checklist/items.ts`), status derived in
  `deriveChecklist` from photos/snags (photo items), technical data (fiber loss, ODF spare, power /
  control redundancy, HW list vs inventory) or manual survey answers; otherwise "N/A – manual".
- Photo gallery: only the photos passed in `gallery` (the worker passes APPROVED photos, resized to
  1280 px / JPEG q70), two per row, captions = category en/ar, device, capture time.
- Arabic text: runs with Arabic characters get `w:rtl` and complex-script font `Arial`; Arabic-only
  paragraphs are bidirectional.
- `convertDocxToPdf(docx)` — LibreOffice headless (`soffice --headless --convert-to pdf`), private
  profile per call. `findSoffice()` checks `SOFFICE_PATH` then standard paths; PDF tests skip when absent.

## Deploy requirements (worker image)

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer-nogui fonts-crosextra-carlito fonts-liberation2 fonts-noto-core \
  && rm -rf /var/lib/apt/lists/*
# optional: ENV SOFFICE_PATH=/usr/bin/soffice
```

`fonts-crosextra-carlito` is metric-compatible with Calibri, `fonts-liberation2` with Arial/Cambria
fallbacks, `fonts-noto-core` provides Noto Naskh/Sans Arabic for the Arabic runs. LibreOffice adds
~250 MB; conversion takes 3–10 s per report. Without LibreOffice the worker still produces the DOCX and
records the warning "PDF not generated: LibreOffice (soffice) is not installed".
