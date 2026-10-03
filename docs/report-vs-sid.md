# Generated report vs real SID (NASR3-R21C-C-EG)

Golden test: `apps/worker/test/golden-sid.int.test.ts` (skips when the seed JSON or the customer folder is missing, so it does not run in CI).

## Matches
| Area | Result |
|---|---|
| Sections | Same 12 sections, same order |
| Site Data | All 17 fields equal (incl. Arabic region and GPS as written) |
| Active BOM | 9/9 rows, quantities and every serial equal |
| Passive tables | Passive Power and Telco Passive descriptions and quantities equal |
| LLD | Install rows equal; all 11 SID internal links present |
| ODF / fiber data | Every port and reading from the source files appears |
| Acceptance checklist | All 58 items present |

## Differences (and why)
- **Internal links:** the LLD covers R21C and R22C; the report keeps R21C's 12 links. The SID shows 11 and omits `Te0/1/0/35 -> NASR3-R31C-C-EG Te0/2/0/10`, which is in the LLD (SID omission).
- **ODF utilization, port mapping, splice tests:** the SID embeds 10 Excel objects; the report renders real tables, readings > 3 dB or < 0 dB in red.
- **Facility survey, layout and connectivity drawings, config file:** not stored by the system yet; those sections show data-derived tables or a short note.
- **Checklist result for the sample:** 33 OK, 1 NOT OK, 24 N/A. NOT OK = C12 fiber loss: ODF2 has 8, 4.2 and -2.01 dB readings and ODF4 duplicates ODF3, yet the SID marked C12 YES. The 24 N/A items need survey answers (`PATCH /sites/:id/documents`).
- **H3 wording:** template leftover "Huawei only" reworded to "approved vendor only".
- **Additions:** info + sign-off appendix, per-category summary. No third-party logos. Header uses the English site name (no Arabic site-name field yet).
