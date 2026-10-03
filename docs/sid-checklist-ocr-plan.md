# SID "Acceptance check list" — transcription and reconciliation (T1.5)

Status: **transcribed** (2026-10-03). The images were legible enough to read by eye, so no OCR pipeline is needed for this document. This file now serves two purposes: the transcription itself, and how each SID item is covered (or not) by the photo checklists in `packages/checklist`.

## Source

- File: `NASR3...C(R21C)/NASR3...C(R21C)/PO17...SID...NASR3-R21C-C-EG.docx` (read-only raw data).
- Section 15 "Acceptance check list." is not text: it is **5 PNG screenshots of an Excel table**, `word/media/image23.png` … `image27.png`, placed right after the paragraph "Acceptance check list." and before "Photo gallery.".
- Embedded order in the docx is 23, 24, 25, 26, 27, but the reading order of the table is **24 → 23 → 25 → 26 → 27** (image24 holds the table header and "Security"; image23 continues from the "Spacing" heading at the bottom of image24).
- Columns: `#` (blank), `Area`, `Status`, `Comments` (all blank for this site). Status values below are this site's answers (NASR3 R21C).

How to repeat for another SID: unzip the docx (`unzip -o <sid>.docx -d out`), find the paragraph "Acceptance check list." in `word/document.xml`, follow the `r:embed` ids to `word/_rels/document.xml.rels` to get the media files. If a future SID has the checklist as a real Word table, parse it from `document.xml` directly; if it is images again, the item list below is the template and only the Status column needs reading (a vision-LLM call per image is cheaper and more accurate on these screenshots than Tesseract, which has no reliable Arabic/English mixed-table support on this machine).

## Transcription

Legend for "Photo?": **yes** = verifiable from installation photos (mapped to criteria/codes), **partly** = some aspect visible, **no** = needs measurement, system output or documents.

### Security
| # | Item | NASR3 status | Photo? | Covered by |
|---|---|---|---|---|
| S1 | Is the Hall / Racks well secured? The door of the room locked well? | YES | partly | RACK-02 → `RACK_DOOR_NOT_CLOSED` |
| S2 | Does we have any Fire / Smoke / Water Leak Detection systems and fire extinguishers? If found, specify the number and status | NO | no | site survey field, not a photo snag |

### Environmental — Cleaning
| # | Item | NASR3 status | Photo? | Covered by |
|---|---|---|---|---|
| E1 | Specify cleaning status of the room; ensure that routine maintenance occurred on the room after installation | OK | yes | `DUST_OR_DIRT`, `MARKER_OR_STAIN_MARKS` (all categories) |
| E2 | Is there any extra material remaining on the site? | NO | yes | RACK-01 → `SPARE_LEFT_IN_RACK`, `SPARE_LEFT_IN_ODF`, `PACKAGING_OR_DEBRIS_LEFT` |

### Environmental — POP Ventilation & Lighting
| # | Item | NASR3 status | Photo? | Covered by |
|---|---|---|---|---|
| V1 | Is there A/C found? specify No# and status | 3 Good | no | site survey field |
| V2 | Type of A/Cs (Free stand – Split – Closed control) | free stand | no | site survey field |
| V3 | The installed A/Cs equivalent to the thermal loads and heat dissipation? | YES | no | site survey field |
| V4 | The temperature degree at the installation area? | 24.7 | no | measured value |
| V5 | Is the temperature degree of the device accepted? Less than 45 degree for Routing Engines while the fans running in its normal speed | YES | no | router CLI output (`show environment`) |
| V6 | Specify the lighting condition at the hall? | OK | no | site survey field (indirectly: `PHOTO_TOO_DARK`) |
| V7 | Are all access holes from / to current room are cleared and filled by foam after finalizing installation? | YES | yes | ARMD-05, PWRP-04 → `WALL_OPENING_NOT_SEALED`, `FLOOR_OPENING_NOT_SEALED` |

### Spacing
| # | Item | NASR3 status | Photo? | Covered by |
|---|---|---|---|---|
| P1 | Is the selected space suitable with No# of Racks? | YES | no | survey |
| P2 | Is there adequate clearance for O&M actions in front and behind of racks? (60 cm minimum) | YES | no | needs measurement |

### Physical Installation — Facility
| # | Item | NASR3 status | Photo? | Covered by |
|---|---|---|---|---|
| F1 | Type of the Floor (Raised Floor / Concrete) | Raised floor | no | site data field |
| F2 | Are the used racks full perforated? | YES | partly | visible in rack photos; no snag code (all project racks are perforated) |
| F3 | Are perforated tiles placed in front of each rack? | NO | partly | **reviewer decision**: no code yet (this site answered NO and was still accepted) |
| F4 | Are there installed paths for all cables (Power, Data)? | Partially & we complete | yes | `DUCT_SECTION_MISSING`, `CABLE_TRAY_SUPPORT_MISSING` |
| F5 | Cable ladders or trays under raised floor to organize cables and isolate it away from the ground | OK | yes | TRAY_OK criteria → `CABLE_TRAY_MISALIGNED`, `CABLE_TRAY_SUPPORT_MISSING`, `RUBBER_GLAND_MISSING` |
| F6 | Basket Tray above racks with closed duct for organizing patch cords | OK | yes | DUCT_OK criteria → `DUCT_COVER_OPEN`, `DUCT_SECTION_MISSING`, `DUCT_TILTED`, `DUCT_BROKEN` |
| F7 | Racks fixed well on a suitable stable metal base fixed by Akmons (10 cm height maximum in Concrete floor or in the same level of raised floor) | OK | yes | BASE-01/02 → `RACK_BASE_BOLTS_MISSING`, `RACK_BASE_NOT_LEVEL`, `RACK_FLOOR_GAP` |

### Racks / Cabinets Mounting & installation
| # | Item | NASR3 status | Photo? | Covered by |
|---|---|---|---|---|
| R1 | Plan layout (Single Cabinet / Row of Cabinets / Back to Back Cabinets) | OK | no | site data field |
| R2 | Racks or Cabinets installed according to Installation Standards | YES | yes | rack + rack_base checklists as a whole |
| R3 | Total No. of Rack / POP, does it match POP capacity? | NO POP | no | site data |
| R4 | Racks or Cabinets arranged in alternating pattern? | YES | no | layout |
| R5 | Cabins are aligned with one edge along with the edge of the floor tile? | YES | yes | RACK-03 → `RACK_MISALIGNED` |
| R6 | 42U Rack (60\*100) for Core or Big Edge Devices or (60\*80) for Edge devices with a suitable cable organizer | YES | no | BOM / LLD check |
| R7 | Is there adequate clearance for O&M actions inside racks? (to leave 3 U between door of the rack and front of device) | YES | no | measurement |
| R8 | Are all Devices/ODFs are Rack mounted? | YES | partly | `SPARE_LEFT_IN_RACK` catches loose equipment; otherwise no code |
| R9 | Devices/Equipment are mounted in rack from the front side | YES | partly | no code (always true in this project's photos) |
| R10 | Total No. of Devices / Rack, does it match rack capacity? (The agreed design of rack utilization) | YES | no | LLD check |

### Cabling
| # | Item | NASR3 status | Photo? | Covered by |
|---|---|---|---|---|
| C1 | Route the cables with different types separately, consider future maintenance and expansion in cables | YES | yes | `POWER_CABLE_ROUTING_UNTIDY`, `MANAGEMENT_CABLE_UNTIDY` |
| C2 | Are the uplink cables marked and easy recognized all over its path? | YES | yes | UPL-04 → `LABEL_MISSING` |
| C3 | Are Power cables bundled well using tie wraps and organized in the cable organizer from the left side of the device and separated in a side of the tray/ladder? (30 cm at least between power and UTP cables) | YES | yes | POWER_DRESS criteria → `POWER_CABLE_ROUTING_UNTIDY` |
| C4 | Are UTP cables bundled well using tie wraps and organized in cable organizer? | YES | yes | MGMT-01 → `MANAGEMENT_CABLE_UNTIDY` |
| C5 | Are Fiber Patch Cords bundled by scotch from right / left side of the Device / ODF and organized well on the rack organizer and above the basket trays? | YES | yes | `PATCH_CORD_NOT_BUNDLED`, `PATCH_CORD_MULTIPLE_PATHS` |
| C6 | Are Fiber Patch Cords of every PIC are bundled by scotch with equal space between ties (15 cm)? | OK | yes | `PATCH_CORD_NOT_BUNDLED` |
| C7 | Are Fiber Patch Cords of every MIC are bundled by scotch with equal space between ties (25 cm)? | OK | yes | `PATCH_CORD_NOT_BUNDLED` |
| C8 | Are Fiber patch cords of every Router are bundled into one duct between active and passive racks above the ladder? | YES | yes | PATCH-02 → `DUCT_COVER_OPEN`, `DUCT_SECTION_MISSING` |
| C9 | Ensure that data cables arrange and bind with proper strength and not be bended excessively or pushed/pulled with the rotatable components such as a door is opened or closed | YES | yes | `PATCH_CORD_UNDER_TENSION`, `FIBER_BEND_RADIUS_TOO_TIGHT` |
| C10 | Are connectors of patch cords and ODFs matched? | YES | no | connector type check (SC/LC) — not reliably visible |
| C11 | Are Patch cords installed away of the intake, exhaust, fan tray and power supplies to facilitate O&M actions and clear the path of air flow, using cable entrance holes of the rack | YES | partly | **reviewer decision**: candidate code `CORDS_BLOCK_AIRFLOW` (not added; no snag evidence yet) |
| C12 | Is the power loss of the HW loop within the accepted range? (-0.5 dB for every coupling, reading -10 dBm maximum) | YES | no | fiber test sheets (`Fiber Test/*.xlsx`) |
| C13 | 10 % spare either in patch cords or ODF ports for O&M actions | YES | no | mapping sheet utilisation |
| C14 | 2 m spare at least of armored cables at every ODF | YES | partly | ARMD-01 → `ARMOURED_CABLE_ROUTING_UNTIDY` (spare presence), length not measurable |
| C15 | Are unused ports of ODFs / Patch cords covered using protective caps to protect it from damage? | YES | yes | `DUST_CAP_MISSING` (reviewers' "نغطي الكابلر") |
| C16 | Any extra length of cables should be organized well on ladder/tray or using cable organizers | YES | yes | `PATCH_CORD_EXCESS_LENGTH` |

### Labeling
| # | Item | NASR3 status | Photo? | Covered by |
|---|---|---|---|---|
| L1 | Labels Material must meet the standard of CSA | YES | no | material spec |
| L2 | Labels for Signal Cables different of labels for Power Cables and Uplink cables | YES | partly | UPLL-01 / PWRL-01; no dedicated code |
| L3 | Ensure Label have sufficient Info (From, TO, Circuit ID, Power Type, Power Level) (as the agreed formats) | YES | yes | `LABEL_INFO_INCOMPLETE` |
| L4 | Are all Devices / Passive elements (Racks, ODFs, PDUs, …) labelled with the agreed format? | YES | yes | `HOSTNAME_LABEL_MISSING`, `LABEL_MISSING` |
| L5 | Are port utilization sheets of ODFs available on active and passive racks? | YES | yes | SHEET-01 → `ODF_SHEET_MISSING_OR_UNREADABLE` |

### Hardware
| # | Item | NASR3 status | Photo? | Covered by |
|---|---|---|---|---|
| H1 | Redundancy in Power units | OK | no | `show inventory` / platform |
| H2 | Redundancy in Control boards | OK | no | `show inventory` |
| H3 | All Items are from Huawei only | OK | no | template leftover (project is Cisco) — **reviewer decision**: drop or reword |
| H4 | Both routing engines LEDs are in its normal status | OK | partly | router front photo shows LEDs; no code (judging LED state from a photo is unreliable) |
| H5 | The sent HW list match the actual installed | OK | no | `show inventory` vs BOM (Phase 2 Material/BOQ agent) |
| H6 | Is the fan module working in the normal speed without noise? | OK | no | CLI / on-site |
| H7 | Is the filter new and clean? no filter in Huawei router | OK | no | template leftover |

## Reconciliation summary

- 58 SID items: **32** are photo-verifiable fully or partly; 26 of them map to existing criteria/codes. The 6 without a code are F2 (perforated racks), R9 (front mounting), H4 (RE LEDs) — always satisfied or unreliable from a photo — and F3 (perforated tiles), C11 (airflow), L2 (label type distinction), left as reviewer decisions because no reviewer snag has been raised for them.
- Codes added because of the SID (no reviewer snag seen yet): `RACK_BASE_NOT_LEVEL`, `RACK_MISALIGNED`, `LABEL_INFO_INCOMPLETE`, `POWER_CABLE_ROUTING_UNTIDY`, `ODF_SHEET_MISSING_OR_UNREADABLE`.
- SID confirms two interpretations of reviewer slang: "الكابلر" = ODF coupler/adapter, its "غطاء" = protective dust cap (C15); "الشنيشه" = cable access hole in wall/ceiling to be filled with foam (V7).
- Non-photo items (A/C, temperature, power loss, HW redundancy, inventory) belong to the report generator (T6.x) and the site seed (T1.3), not to the vision model. Suggested split for the report: render the SID table from site data + the per-photo verdicts for the photo-verifiable rows above.

## Remaining work (if more SIDs arrive)

1. Repeat the extraction above per SID; compare the item list with this one (items are a fixed template; only Status/Comments change).
2. If a SID differs, add the new items here and decide per item: new criterion/code, or non-photo field.
3. Store Status values per site in the site seed (T1.3 owner) so the report generator (T6.1) can reproduce the table.
