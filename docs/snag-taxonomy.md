# Snag taxonomy (for reviewer approval)

Version: `2026-10-03.2` — generated from `packages/checklist/src/taxonomy.ts`; do not edit by hand.

These codes are what the AI emits and what reviewers pick when labelling. Please check for each row: is the meaning right, is the Arabic how you would say it, is the severity right, and does it apply to the right photo categories.

Severity: **critical** = safety/service risk; **major** = must be fixed before acceptance (rejects the photo); **minor** = cosmetic, reported as a note to fix; does not reject the photo on its own, the photo goes to a human (decision D9 in `packages/checklist/src/decisions.ts`).
Origin: `snag_docs` = seen in the reviewers' snag Word files; `sid_checklist` = from the SID acceptance checklist; `photo_quality` = retake reasons; `catch_all` = for issues not yet in the list.

Total: 46 codes.

## Site decisions (defaults pending reviewer confirmation)

Evidence-based defaults from prompt tuning (T3.5, docs/ai-tuning-log.md). Each is one setting in `packages/checklist/src/decisions.ts`.

- **D1** Rack doors: open doors are normal in shots of the rack interior. Emit RACK_DOOR_NOT_CLOSED only when the shot is meant to show the closed rack (closed-rack overview, final front/back shot) and a door is open, or when a door is visibly ajar / not latched.
- **D2** People: a hand or fingers holding a label or cord flat for a close-up is normal and NOT a snag; any other body part, a face or a person in the background is PERSON_IN_FRAME; a faint reflection of the photographer in a glossy door or ODF window is NOT a snag unless the person is clearly recognisable.
- **D3** SID-derived codes (LABEL_INFO_INCOMPLETE, RACK_BASE_NOT_LEVEL, RACK_MISALIGNED, POWER_CABLE_ROUTING_UNTIDY, ODF_SHEET_MISSING_OR_UNREADABLE) have no reviewer evidence yet: report them only with specific, clearly visible evidence and confidence >= 0.85; they are minor.
- **D4** PDU breakers: blank label slots on unused PDU breakers are NOT a snag; only a used breaker or cable without its label is LABEL_MISSING.
- **D5** Critical severity is reserved for POWER_CABLE_DAMAGED.
- **D6** Related categories: a close-up of the labels, cords or an item belonging to a related category of the declared one (listed in the category block) is the SAME subject, not WRONG_CATEGORY.
- **D7** Housekeeping: pre-existing building dirt (old exchange floor, the void under the raised floor, walls, ceiling) is NOT a snag. DUST_OR_DIRT = dust on the installed equipment, rack interior or ODF, or a few cable-tie off-cuts. PACKAGING_OR_DEBRIS_LEFT = clear installer leftovers only (cartons, bags, wrapping, spare material, tools) in or at the installation.
- **D8** Photo-gate codes WRONG_CATEGORY and SUBJECT_NOT_FULLY_VISIBLE route the photo to a human (verdict uncertain) instead of rejecting it, unless a clear major snag is also present.
- **D9** Only major/critical snags reject; photos with only minor snags go to a human (uncertain) with the notes listed (accept-with-notes is a one-line switch, pending reviewer confirmation).

| # | Code | العربي | English | Severity | Origin | Categories |
|---|---|---|---|---|---|---|
| 1 | `PERSON_IN_FRAME` | ظهور شخص في الصورة | Person visible in photo | major | snag_docs | _all_ |
| 2 | `PHOTO_BLURRY` | الصورة مهزوزة أو مش واضحة | Photo blurry / out of focus | major | photo_quality | _all_ |
| 3 | `PHOTO_TOO_DARK` | الصورة ضلمة | Photo too dark / poor lighting | major | photo_quality | _all_ |
| 4 | `WRONG_CATEGORY` | الصورة مش تبع البند ده | Photo does not match its category | major | photo_quality | _all_ |
| 5 | `SUBJECT_NOT_FULLY_VISIBLE` | البند مش ظاهر كله في الصورة | Subject cropped or obstructed | minor | photo_quality | _all_ |
| 6 | `SPARE_LEFT_IN_ODF` | الاسبير متساب جوه الاو دي اف | Spare cords/items left inside ODF | major | snag_docs | odf_cross_connect, odf_tie, test_room, odf_cross_connect_labels, odf_tie_labels, rack |
| 7 | `SPARE_LEFT_IN_RACK` | الاسبير متساب في الراك أو قدام الراوتر | Spare items left in rack / in front of router | major | snag_docs | rack, router, odf_cross_connect, odf_tie, pdu, power_system, management, patch_cords, test_room |
| 8 | `PACKAGING_OR_DEBRIS_LEFT` | كرتون أو مخلفات متسابة | Cardboard, packaging or debris left | major | snag_docs | _all_ |
| 9 | `DUST_OR_DIRT` | تراب على الراك أو الاو دي اف | Dust or dirt on rack / ODF / equipment | minor | snag_docs | _all_ |
| 10 | `MARKER_OR_STAIN_MARKS` | باغة (شخبطة ماركر أو بقع) على الأسطح | Marker writing / stains on surfaces ("الباغه") | minor | snag_docs | _all_ |
| 11 | `RACK_DOOR_NOT_CLOSED` | باب الراك مفتوح أو مش مقفول صح | Rack door left open / not latched | minor | snag_docs | rack, pdu, router, odf_cross_connect, odf_tie |
| 12 | `PATCH_CORD_NOT_BUNDLED` | البشات مش متجمعة باسكوتش | Patch cords not bundled with velcro (اسكوتش) | major | snag_docs | patch_cords, router, odf_cross_connect, odf_tie, test_room, uplink, rack |
| 13 | `PATCH_CORD_MULTIPLE_PATHS` | مسار البشات مش من مكان واحد | Patch cords not taking a single path | major | snag_docs | patch_cords, router, odf_cross_connect, odf_tie, test_room, uplink, rack |
| 14 | `PATCH_CORD_EXCESS_LENGTH` | أطوال زيادة في البشات | Excess patch cord length / slack loops | major | snag_docs | patch_cords, router, odf_cross_connect, odf_tie, test_room, uplink, rack |
| 15 | `PATCH_CORD_CROSSING` | كروس في البشات | Patch cords crossing each other | major | snag_docs | patch_cords, router, odf_cross_connect, odf_tie, test_room, uplink, rack |
| 16 | `PATCH_CORD_UNDER_TENSION` | البشات مشدودة | Patch cords pulled tight (no slack) | major | snag_docs | patch_cords, router, odf_cross_connect, odf_tie, test_room, uplink, rack |
| 17 | `FIBER_BEND_RADIUS_TOO_TIGHT` | الكرفة (ثنية) البشات ضيقة | Fiber bend radius too tight | major | snag_docs | patch_cords, router, odf_cross_connect, odf_tie, test_room, uplink, rack, armoured_cables |
| 18 | `PATCH_CORD_ROUTING_UNTIDY` | سستمة البشات مش مظبوطة | Patch cord dressing untidy (السستمه) — fallback | major | snag_docs | patch_cords, router, odf_cross_connect, odf_tie, test_room, uplink, rack |
| 19 | `DUST_CAP_MISSING` | الكابلر من غير غطاء | Dust cap missing on unused coupler/port | major | snag_docs | odf_cross_connect, odf_tie, test_room, router, odf_cross_connect_labels, odf_tie_labels, uplink |
| 20 | `DUCT_COVER_OPEN` | الداكت مفتوح (مش مقفول من النزلة) | Duct cover open / not closed at drop | major | snag_docs | duct, patch_cords, armoured_cables, uplink, management, power_path, earth_path, power_system |
| 21 | `DUCT_SECTION_MISSING` | الداكت مش مكمل في المسار | Duct missing on part of the route | major | snag_docs | duct, patch_cords, armoured_cables, uplink, management, power_path, earth_path, power_system |
| 22 | `DUCT_TILTED` | ميل في الداكت | Duct tilted / not straight | minor | snag_docs | duct, patch_cords, armoured_cables, uplink, management, power_path, earth_path, power_system |
| 23 | `DUCT_BROKEN` | الداكت مكسور | Duct broken / damaged | major | snag_docs | duct, patch_cords, armoured_cables, uplink, management, power_path, earth_path, power_system |
| 24 | `RUBBER_GLAND_MISSING` | رابر جلاد مش متركب | Rubber gland / edge protector missing at opening | major | snag_docs | duct, patch_cords, armoured_cables, uplink, management, power_path, earth_path, power_system, rack |
| 25 | `CABLE_TRAY_MISALIGNED` | الباسكت تراي أو السلم مش على نفس المستوى | Cable tray / ladder not level or misaligned | minor | snag_docs | duct, patch_cords, armoured_cables, uplink, management, power_path, earth_path, power_system, rack_base |
| 26 | `CABLE_TRAY_SUPPORT_MISSING` | دعامة التراي مش متركبة | Tray support / hanger missing (دعامة) | major | snag_docs | duct, patch_cords, armoured_cables, uplink, management, power_path, earth_path, power_system |
| 27 | `FLOOR_OPENING_NOT_SEALED` | فتحة البلاط مش مقفولة | Raised-floor opening not closed | major | snag_docs | rack, rack_base, duct, armoured_cables, power_path, earth_path, management, uplink |
| 28 | `RACK_FLOOR_GAP` | مسافة بين الراك والبلاط | Gap between rack and floor tiles | major | snag_docs | rack, rack_base |
| 29 | `WALL_OPENING_NOT_SEALED` | الشنيشة (فتحة الحيطة) مش مقفولة | Wall/ceiling cable opening not sealed (الشنيشه) | major | snag_docs | power_path, earth_path, armoured_cables, uplink, duct, management |
| 30 | `RACK_BASE_BOLTS_MISSING` | مسامير رجل القاعدة ناقصة (8 مسامير) | Rack base leg bolts missing (8 per leg) | major | snag_docs | rack_base |
| 31 | `RACK_BASE_NOT_LEVEL` | قاعدة الراك مش مظبوطة على الميزان أو مستوى البلاط | Rack base not level / not at tile level | minor | sid_checklist | rack_base |
| 32 | `RACK_MISALIGNED` | الراك مش على استقامة الصف أو حرف البلاط | Rack not aligned with row / floor tile edge | minor | sid_checklist | rack |
| 33 | `HOSTNAME_LABEL_MISSING` | الهوست نيم مش موجود | Hostname label missing on router/rack | major | snag_docs | router, rack, odf_cross_connect, odf_tie, pdu, test_room |
| 34 | `LABEL_MISSING` | الليبول مش موجود | Cable / port label missing | major | snag_docs | odf_cross_connect_labels, odf_tie_labels, uplink_labels, power_labels, router, rack, odf_cross_connect, odf_tie, pdu, test_room, uplink, earth_path, management |
| 35 | `LABEL_DAMAGED` | الليبول مقطوع | Label torn / damaged | minor | snag_docs | odf_cross_connect_labels, odf_tie_labels, uplink_labels, power_labels, router, rack, odf_cross_connect, odf_tie, pdu, test_room, uplink, earth_path, management |
| 36 | `LABEL_MISPLACED` | الليبول مش في مكانه | Label in wrong position | minor | snag_docs | odf_cross_connect_labels, odf_tie_labels, uplink_labels, power_labels, router, rack, odf_cross_connect, odf_tie, pdu, test_room, uplink, earth_path, management |
| 37 | `LABEL_INFO_INCOMPLETE` | بيانات الليبول ناقصة أو مش بالفورمات | Label content incomplete / not in agreed format | minor | sid_checklist | odf_cross_connect_labels, odf_tie_labels, uplink_labels, power_labels, router, rack, odf_cross_connect, odf_tie, pdu, test_room, uplink, earth_path, management |
| 38 | `POWER_PLUG_EXPOSED` | الفيشة باينة | Loose power plug / cord visible (الفيشه) | minor | snag_docs | rack, pdu, power_system, router |
| 39 | `PDU_SCREW_MISSING` | مسمار الـ PDU ناقص | PDU fixing screw missing | major | snag_docs | pdu, rack, power_system |
| 40 | `POWER_CABLE_DAMAGED` | خدوش في كابل الباور | Power/earth cable insulation scratched or damaged | critical | snag_docs | pdu, power_path, earth_path, power_labels, power_system |
| 41 | `BUSBAR_WRONG_DRILLING` | تخريم في مكان غلط في البارة | Wrong / extra drilling on busbar | major | snag_docs | power_path, earth_path, power_system, pdu |
| 42 | `POWER_CABLE_ROUTING_UNTIDY` | سستمة كابلات الباور مش مظبوطة | Power/earth cable dressing untidy or mixed with data | minor | sid_checklist | pdu, power_path, earth_path, power_labels, power_system |
| 43 | `MANAGEMENT_CABLE_UNTIDY` | المانجمنت مش مظبوط | Management (UTP) cable routing untidy | major | snag_docs | management, router, rack, patch_cords |
| 44 | `ARMOURED_CABLE_ROUTING_UNTIDY` | سستمة الارمود مش مظبوطة | Armoured fibre cable routing untidy | major | snag_docs | armoured_cables, odf_tie, test_room, duct |
| 45 | `ODF_SHEET_MISSING_OR_UNREADABLE` | شيت الاو دي اف مش موجود أو مش مقروء | ODF port utilization sheet missing / unreadable | minor | sid_checklist | odf_sheet, rack |
| 46 | `OTHER_SNAG` | ملاحظة تانية مش في القائمة | Other issue (not in taxonomy) | minor | catch_all | _all_ |

## Details

### `PERSON_IN_FRAME` — Person visible in photo

- **الوصف:** ظهور شخص (جسم أو وش أو رجلين أو هدوم) في صورة التسليم النهائية. إيد ماسكة الليبول عشان يتقري في صور الليبولات مش سناج.
- **Description:** A person (body, face, legs, clothing) appears in a final acceptance photo. A hand or fingers holding a label or cord flat for a close-up is NOT this snag, nor is a faint reflection of the photographer in a glossy surface.
- **Look for:** human body, head, face, legs or clothing anywhere in the frame, including a clearly recognisable person reflected in rack doors or ODF windows; a person working in the background of a rack or room overview shot
- **Reviewer wording:** «نصور بدون ظهور الشخص»، «عدم ظهور شخص في الصور النهائيه»، «عدم ظهور شخص في الصوره»
- **الإصلاح:** نعيد التصوير من غير ما حد يظهر في الكادر، ونبعد أي حد واقف ورا الراك.
- **Fix:** Retake the photo with nobody in the frame; ask anyone behind the rack to step away.

### `PHOTO_BLURRY` — Photo blurry / out of focus

- **الوصف:** الصورة مهزوزة أو الفوكس مش مظبوط لدرجة إن الحاجات المطلوبة (الليبولات، البشات، المسامير) مش باينة.
- **Description:** Motion blur or out-of-focus image so that the items the category must show (labels, cords, bolts) cannot be judged.
- **Look for:** smeared edges, double contours; label text that cannot be read in a label close-up; video screenshot with play button overlay
- **Not to confuse with:** `PHOTO_TOO_DARK`
- **الإصلاح:** نثبت الموبايل ونستنى الفوكس ونعيد التصوير، ومنبعتش سكرين شوت من فيديو.
- **Fix:** Hold the phone steady, wait for focus and retake; do not send video screenshots.

### `PHOTO_TOO_DARK` — Photo too dark / poor lighting

- **الوصف:** الصورة ضلمة (بتحصل جوه الراك وتحت البلاط) ومش باين فيها اللي محتاجين نشوفه.
- **Description:** Under-exposed photo (typical inside racks and under raised floor) where the subject cannot be assessed.
- **Look for:** most of the frame near-black; subject only visible as silhouettes; strong backlight hiding the subject
- **Not to confuse with:** `PHOTO_BLURRY`
- **الإصلاح:** نستخدم الفلاش أو كشاف ونعيد التصوير.
- **Fix:** Use the flash or a torch and retake.

### `WRONG_CATEGORY` — Photo does not match its category

- **الوصف:** الصورة متصورة لحاجة غير البند اللي اترفعت عليه (مثلاً صورة PDU مترفوعة على قاعدة الراك).
- **Description:** The photo shows a different subject than the category it was uploaded under (e.g. a PDU photo uploaded as rack_base). A close-up of labels, cords or items of a related category (e.g. ODF labels under odf_cross_connect) is not this snag.
- **Look for:** main subject belongs to another category; no element required by this category is visible
- **Not to confuse with:** `SUBJECT_NOT_FULLY_VISIBLE`
- **الإصلاح:** نرفع الصورة على البند الصح أو نصور البند المطلوب.
- **Fix:** Move the photo to the correct category or take the required shot.

### `SUBJECT_NOT_FULLY_VISIBLE` — Subject cropped or obstructed

- **الوصف:** الصورة للبند الصح بس جزء مهم مقصوص أو مستخبي (نص القاعدة، ليبول مطبق، باب الاو دي اف مداري البورتات).
- **Description:** Right category, but part of what must be shown is cut off or hidden (e.g. half the rack base, label folded, ODF door hiding ports).
- **Look for:** required element cut by the frame edge; object or door blocking the subject; label turned so its text is not facing the camera
- **Not to confuse with:** `WRONG_CATEGORY`, `PHOTO_BLURRY`
- **الإصلاح:** نرجع لورا شوية أو نغير الزاوية ونصور البند كامل.
- **Fix:** Step back or change the angle so the whole subject is in frame.

### `SPARE_LEFT_IN_ODF` — Spare cords/items left inside ODF

- **الوصف:** باتشات أو بيج تيل أو كابلرات اسبير متشالة جوه الاو دي اف أو باينة من الشباك بتاعه. الاسبير يتحط في كيس ويتشال بعيد عن الاو دي اف.
- **Description:** Spare patch cords, pigtails, adapters or cord coils are stored inside the ODF tray/window. Spares must be bagged and stored away, not in the ODF.
- **Look for:** loose coils of yellow patch cord lying inside the ODF behind the transparent window; unconnected connectors or SC/LC adapters resting at the bottom of the ODF tray; cords inside the ODF that do not terminate on a port
- **Not to confuse with:** `SPARE_LEFT_IN_RACK`, `PATCH_CORD_EXCESS_LENGTH`
- **Reviewer wording:** «نشيل الاسيبر  من جوا الاو دي اف»، «نشيل الاسيبر من جواه ال او دي اف»، «الاسيبر جوا الاو دي اف»، «الاسبير داخل الاو دي اف»، «الاسيبر يتشل من او دي اف»، «نشيل الاسيبر من الاو دي اف»، «عدم وضع الاسيبر داخل الاو دي اف»، «نحط الاسيبر في كيس مش جواه الاو دي اف»
- **الإصلاح:** نشيل الاسبير من جوه الاو دي اف ونحطه في كيس ونخفيه بعيد عن الراك.
- **Fix:** Remove all spares from the ODF, put them in a bag and store them out of sight.

### `SPARE_LEFT_IN_RACK` — Spare items left in rack / in front of router

- **الوصف:** حاجات اسبير (باتشات، SFP، كروت، اكسسوارات) متسابة في أرضية الراك أو فوق الأجهزة أو قدام الراوتر. لو جوه الاو دي اف يبقى SPARE_LEFT_IN_ODF ولو كرتون يبقى PACKAGING_OR_DEBRIS_LEFT.
- **Description:** Spare material (cords, SFPs, cards, accessories) left on the rack floor, on top of equipment or in front of the router. Not for items inside an ODF (use SPARE_LEFT_IN_ODF) or packaging (use PACKAGING_OR_DEBRIS_LEFT).
- **Look for:** bags, boxes of SFPs or loose cord coils on the rack floor or shelf; spare items placed in front of the router chassis; accessory kits left on top of equipment
- **Not to confuse with:** `SPARE_LEFT_IN_ODF`, `PACKAGING_OR_DEBRIS_LEFT`
- **Reviewer wording:** «نشيل الاسيبر بتاع الرواتر»، «عدم وضع الاسيبر في الاتجاه الامامي من الرواتر»، «الاسيبر نحطه في كيس ونخفي»، «نشيل لاسيبر»
- **الإصلاح:** نشيل الاسبير من الراك ونحطه في كيس ونخزنه بعيد، ومفيش حاجة تتساب قدام الراوتر.
- **Fix:** Remove spares from the rack, bag them and store them away; nothing may stay in front of the router.

### `PACKAGING_OR_DEBRIS_LEFT` — Cardboard, packaging or debris left

- **الوصف:** كراتين أو نايلون أو بواقي رباطات أو عدة أو مخلفات تركيب متسابة في الراك أو تحت البلاط أو في الموقع.
- **Description:** Clear installer leftovers - cardboard boxes, plastic bags or wrapping, spare material, tools - left in or at the installation (rack, ODF, tray, rack base). Pre-existing building dirt and a few cable-tie off-cuts are not this code (see DUST_OR_DIRT).
- **Look for:** brown cardboard box inside a rack; plastic bags / wrapping inside the rack or on the tray; boxes or spare material stacked at the rack base; tools left behind
- **Not to confuse with:** `SPARE_LEFT_IN_RACK`, `DUST_OR_DIRT`
- **Reviewer wording:** «نشيل الكرتونه من جواه الراك»
- **الإصلاح:** نشيل الكرتون وأي مخلفات من الراك والموقع وننضف المكان.
- **Fix:** Remove all cardboard, packaging and waste from the rack and site.

### `DUST_OR_DIRT` — Dust or dirt on rack / ODF / equipment

- **الوصف:** تراب أو بودرة أسمنت أو وساخة باينة على أرضية الراك أو فوق الأجهزة أو على الاو دي اف أو التراي بعد التركيب.
- **Description:** Visible dust, cement powder or dirt on the installed equipment: rack floor, equipment tops, ODF or new trays, or a few cable-tie off-cuts left behind. Pre-existing building dirt (old floors, the void under the raised floor) is not a snag.
- **Look for:** grey dust layer on black rack surfaces; footprints or powder on rack floor; dust on ODF window or router top
- **Not to confuse with:** `MARKER_OR_STAIN_MARKS`, `PACKAGING_OR_DEBRIS_LEFT`
- **Reviewer wording:** «نسمح التراب من جواه الراك»، «نمسح او دي اف»، «مسح ااراك و او دي اف»، «نمسح الراك من التراب»، «نمسح التراب»، «نسمح التراب»، «نمسح الراك»
- **الإصلاح:** نمسح الراك والاو دي اف والأجهزة من التراب ونعيد التصوير.
- **Fix:** Clean the rack, ODF and equipment, then retake.

### `MARKER_OR_STAIN_MARKS` — Marker writing / stains on surfaces ("الباغه")

- **الوصف:** كتابة ماركر أو قلم أو بقع أو شخبطة متسابة على الأجهزة أو شباك الاو دي اف أو جسم الراك أو الداكت.
- **Description:** Marker or pen writing, smudges or stains left on equipment, ODF windows, rack panels or ducts. Writing on floor tiles is out of scope unless in the photo subject.
- **Look for:** hand-written marker text or scribbles on ODF window, duct or rack; smudges / stains on transparent covers; leftover marking used during installation
- **Not to confuse with:** `DUST_OR_DIRT`
- **Reviewer wording:** «نمسح الباغه»، «مسح الباغه»، «نسمح الباغه»
- **الإصلاح:** نمسح الباغة (الماركر والبقع) بكحول أو منظف مناسب.
- **Fix:** Wipe off marker marks and stains with alcohol or a suitable cleaner.

### `RACK_DOOR_NOT_CLOSED` — Rack door left open / not latched

- **الوصف:** باب من أبواب الراك (قدام أو ورا أو جنب) غير الباب اللي اتفتح عشان التصوير متساب مفتوح أو مش مقفول صح.
- **Description:** A rack door is visibly ajar / not latched, or a door is open in a shot meant to show the closed rack (closed-rack overview, final front/back shot). Doors opened to photograph the inside are normal and are not this snag.
- **Look for:** rear door visibly open behind the open front; door ajar / misaligned, latch not engaged; closed-rack overview with a door standing open
- **Reviewer wording:** «نقف الباب الخلفي»، «نقفل الباب»، «الباب مش مقفول بشكل صحيح»، «الباب مفتوح»
- **الإصلاح:** نقفل كل أبواب الراك صح ونتأكد إن الكالون قافل.
- **Fix:** Close and latch all rack doors properly.

### `PATCH_CORD_NOT_BUNDLED` — Patch cords not bundled with velcro (اسكوتش)

- **الوصف:** البشات سايبة أو متقسمة مجموعات بدل ما تكون حزمة واحدة متربطة باسكوتش على مسافات ثابتة (حوالي 15 سم للـ PIC و25 سم للـ MIC).
- **Description:** Patch cords run loose or in several small groups instead of one bundle held by velcro (اسكوتش) at regular spacing (~15 cm per PIC, ~25 cm per MIC per SID).
- **Look for:** long runs of yellow cords with no black velcro straps; velcro straps very far apart or irregular; several separate small bundles where one bundle is expected
- **Not to confuse with:** `PATCH_CORD_ROUTING_UNTIDY`
- **Reviewer wording:** «نحط الاسكوتش»، «-نحط الاسكوتش»، «نحط اسكوتش»، «تجميع البشات في اسكوتش واحد»، «نحط اسكوتش في البشتات لتظبط السستمه»، «نحط اسكوتش لتظبيط شكل السستمه»، «نضع اسكوتش في السستمه»، «نحط اسكوتش نظبط السستمه باسكوتش»، «وضع اسكوتش للتظبيط السستمه»
- **الإصلاح:** نجمع البشات في حزمة واحدة ونربطها اسكوتش على مسافات متساوية (15 سم تقريباً).
- **Fix:** Gather the cords into one bundle and strap with velcro at equal spacing (~15 cm).

### `PATCH_CORD_MULTIPLE_PATHS` — Patch cords not taking a single path

- **الوصف:** بشات نفس الجهاز أو الاو دي اف طالعة أو داخلة من أكتر من مكان (من الجنبين أو من النص) بدل مسار واحد.
- **Description:** Cords of the same device/ODF leave or enter through more than one route (both sides, through the middle) instead of one defined path.
- **Look for:** cords exiting ODF/router on both left and right sides; some cords dropping through the middle of the rack; cords entering the basket tray at several points
- **Not to confuse with:** `PATCH_CORD_ROUTING_UNTIDY`, `PATCH_CORD_CROSSING`
- **Reviewer wording:** «مسار البشات من مكان واحد»، «تعديل مسار الباتشات»، «تتعديل مسار الباتشات»
- **الإصلاح:** نعدل المسار بحيث كل البشات تطلع من جنب واحد وتمشي في مسار واحد لحد التراي.
- **Fix:** Re-route so all cords leave on one side and follow a single path to the tray.

### `PATCH_CORD_EXCESS_LENGTH` — Excess patch cord length / slack loops

- **الوصف:** لفات أو أطوال زيادة في البشات مدلدلة أو باينة بدل ما تتنظم على السلم أو التراي أو المنظمات.
- **Description:** Visible slack loops or hanging excess length on patch cords instead of being organised on the ladder/tray or cable organisers.
- **Look for:** loops of cord hanging below the bundle; cords bulging out of the vertical organiser; coiled extra length near router or ODF
- **Not to confuse with:** `SPARE_LEFT_IN_ODF`, `PATCH_CORD_ROUTING_UNTIDY`
- **Reviewer wording:** «اطوال البشتات زياده»، «في اطوال زياده في الباتشات»
- **الإصلاح:** نلم الأطوال الزيادة وننظمها على السلم أو المنظم أو نستخدم باتش بطول مناسب.
- **Fix:** Take up the slack on the tray/organiser or replace with a correct-length cord.

### `PATCH_CORD_CROSSING` — Patch cords crossing each other

- **الوصف:** البشات أو الحزم معدية فوق بعض (كروس) بدل ما تمشي جنب بعض بالترتيب.
- **Description:** Cords or bundles cross over each other instead of running in parallel ordered layers.
- **Look for:** X-shaped crossings of cords or bundles; one bundle passing over another at a tray entry; cords weaving between organiser fingers
- **Not to confuse with:** `PATCH_CORD_ROUTING_UNTIDY`, `PATCH_CORD_MULTIPLE_PATHS`
- **Reviewer wording:** «في كروس في الباتشات وسستمه غير صحيحه»
- **الإصلاح:** نفك الكروس ونرتب البشات بالترتيب على حسب البورتات.
- **Fix:** Undo the crossings and re-lay cords in port order.

### `PATCH_CORD_UNDER_TENSION` — Patch cords pulled tight (no slack)

- **الوصف:** البشات مشدودة على الآخر بين الكونكتور والمنظم أو التراي وبتشد على الكونكتورات.
- **Description:** Cords are stretched taut between connector and organiser/tray, pulling on the connectors.
- **Look for:** straight taut cords with no relief near connectors; connectors angled / pulled out of line; cords pressed hard against sharp edges
- **Not to confuse with:** `FIBER_BEND_RADIUS_TOO_TIGHT`
- **Reviewer wording:** «البشات مشدوده»
- **الإصلاح:** نرخي البشات ونسيب طول مناسب قبل الكونكتور من غير ما يبقى فيه أطوال زيادة.
- **Fix:** Relieve the tension with a small service slack near connectors (without creating excess loops).

### `FIBER_BEND_RADIUS_TOO_TIGHT` — Fiber bend radius too tight

- **الوصف:** البشات أو الارمود متثنية ثنية حادة (عند النزلة من التراي أو دخول الراك أو حرف المنظم) بدل كرفة واسعة أو على الووترفول.
- **Description:** Cords or armoured fibre bent sharply (at tray drops, rack entries, organiser edges) instead of following a wide curve or waterfall guide.
- **Look for:** sharp kink where the bundle drops from the tray into the rack; cords bent around a metal edge; bundle not following the waterfall guide
- **Not to confuse with:** `PATCH_CORD_UNDER_TENSION`
- **Reviewer wording:** «توسيع الكرف بتاع بتاع الباتشات»
- **الإصلاح:** نوسع الكرفة ونمشي البشات على الووترفول أو المنظم من غير ثني حاد.
- **Fix:** Widen the bend and route over the waterfall/organiser without sharp kinks.

### `PATCH_CORD_ROUTING_UNTIDY` — Patch cord dressing untidy (السستمه) — fallback

- **الوصف:** سستمة البشات عموماً مش مظبوطة ومفيش كود أدق ينطبق. لو فيه سبب واضح (اسكوتش، مسار، أطوال، كروس، شد، كرفة) نستخدم الكود بتاعه.
- **Description:** General patch cord dressing ("السستمه") is not neat and none of the more specific fiber codes fits. Prefer NOT_BUNDLED, MULTIPLE_PATHS, EXCESS_LENGTH, CROSSING, UNDER_TENSION or BEND_RADIUS when they apply.
- **Look for:** messy, uneven cord layout; cords not following organiser fingers; bundle shape irregular / bulging
- **Not to confuse with:** `PATCH_CORD_NOT_BUNDLED`, `PATCH_CORD_MULTIPLE_PATHS`, `PATCH_CORD_EXCESS_LENGTH`, `PATCH_CORD_CROSSING`, `PATCH_CORD_UNDER_TENSION`, `FIBER_BEND_RADIUS_TOO_TIGHT`
- **Reviewer wording:** «السستمه تتعدل»، «نظبط السستمه»، «نظبط شكل السستمه»، «نعدل السستمه»، «تتعدل السستمه»، «تظبط السستمه»، «سستمه الباتشات مش مظبوطه»، «نخلي الستمه في مسارها المظبوط»، «نظبط البشتات»
- **الإصلاح:** نعيد سستمة البشات: نرتبها ونمشيها في المنظمات ونربطها اسكوتش بشكل منتظم.
- **Fix:** Re-dress the cords neatly through the organisers and strap them evenly.

### `DUST_CAP_MISSING` — Dust cap missing on unused coupler/port

- **الوصف:** الكابلرات (الادابتر) الفاضية في الاو دي اف أو البورتات الفاضية في الراوتر من غير الغطاء بتاعها.
- **Description:** Unused ODF couplers (adapters) or unused router optical ports are left open without their protective dust cap.
- **Look for:** empty green/blue SC adapter showing an open hole instead of a capped front; one open adapter in an otherwise capped row; open SFP cage or optical port without plug on the router
- **Reviewer wording:** «نغطي الكابلر»، «نغطي لكابلر»، «الكابلر مش راكب الغطاء بتاعه»، «الكابلر بدون غطاء»، «اغطاء الكابلر»، «غطاء الكابلر»
- **الإصلاح:** نركب غطا على كل كابلر أو بورت فاضي.
- **Fix:** Fit a dust cap on every unused coupler and port.

### `DUCT_COVER_OPEN` — Duct cover open / not closed at drop

- **الوصف:** الداكت موجود بس الغطا بتاعه مش مركب أو مش مقفول، غالباً عند النزلة على الراك.
- **Description:** The duct exists but its cover is missing or not closed, typically at the drop (النزله) into the rack.
- **Look for:** open-top duct with visible cords inside; cover lifted / displaced at the rack drop; gap between duct cover sections
- **Not to confuse with:** `DUCT_SECTION_MISSING`, `DUCT_BROKEN`
- **Reviewer wording:** «نقفل الداكت من النزله»، «غلق الداكت بشكل صحيح»
- **الإصلاح:** نقفل غطا الداكت كله خصوصاً عند النزلة على الراك.
- **Fix:** Close the duct cover along its full length, especially at the rack drop.

### `DUCT_SECTION_MISSING` — Duct missing on part of the route

- **الوصف:** جزء من المسار (غالباً النزلات) مفيهوش داكت أصلاً والكابلات ماشية مكشوفة.
- **Description:** Part of the cable route (often the drops / النزلات) has no duct at all, so cables run exposed.
- **Look for:** cords running bare between two duct ends; vertical drop to rack without duct; duct ends abruptly before the rack
- **Not to confuse with:** `DUCT_COVER_OPEN`
- **Reviewer wording:** «نكمل الداكت في النزلات»، «نحط داكت في باقي المسار»
- **الإصلاح:** نكمل الداكت في باقي المسار والنزلات لحد دخول الراك.
- **Fix:** Install duct over the remaining route and drops up to the rack entry.

### `DUCT_TILTED` — Duct tilted / not straight

- **الوصف:** الداكت مايل أو مهبط أو مش على استقامة التراي أو السلم.
- **Description:** Duct run is tilted, sagging or not aligned with the tray/ladder.
- **Look for:** duct visibly sloping relative to the ladder; duct sections at different heights; duct twisted on its support
- **Not to confuse with:** `CABLE_TRAY_MISALIGNED`, `DUCT_BROKEN`
- **Reviewer wording:** «ميل في الداكت»
- **الإصلاح:** نعدل الداكت ونثبته على استقامة التراي.
- **Fix:** Straighten and re-fix the duct in line with the tray.

### `DUCT_BROKEN` — Duct broken / damaged

- **الوصف:** جزء من الداكت أو الغطا أو الاكسسوار مشروخ أو مكسور أو مبعوج.
- **Description:** A duct section, cover or fitting is cracked, broken or deformed.
- **Look for:** cracks or missing pieces in white plastic duct; broken cover edge; deformed bend fitting
- **Not to confuse with:** `DUCT_COVER_OPEN`, `DUCT_TILTED`
- **Reviewer wording:** «الداكت في جزء منه مكسور»
- **الإصلاح:** نغير الجزء المكسور من الداكت.
- **Fix:** Replace the broken duct section.

### `RUBBER_GLAND_MISSING` — Rubber gland / edge protector missing at opening

- **الوصف:** الكابلات معدية من فتحة مقصوصة في الداكت أو التراي أو سقف الراك من غير رابر جلاد يحميها من الحرف.
- **Description:** Cables pass through a cut opening in a duct, tray or rack top without a rubber gland/grommet protecting them from the sharp edge.
- **Look for:** cords exiting a duct through a bare cut hole; raw cut edge touching cables; rack-top cable entry without brush/grommet
- **Not to confuse with:** `WALL_OPENING_NOT_SEALED`
- **Reviewer wording:** «نركب رابر جلاد»
- **الإصلاح:** نركب رابر جلاد على الفتحة اللي الكابلات معدية منها.
- **Fix:** Fit a rubber gland/grommet on the opening the cables pass through.

### `CABLE_TRAY_MISALIGNED` — Cable tray / ladder not level or misaligned

- **الوصف:** الباسكت تراي أو درجات السلم أو أجزاءه مش على نفس المستوى أو مش على استقامة واحدة.
- **Description:** Basket tray, ladder rungs or sections are not at the same level, misaligned or not straight.
- **Look for:** ladder rungs at different heights or angles; tray sections stepped at a joint; tray sloping where it should be level
- **Not to confuse with:** `DUCT_TILTED`, `CABLE_TRAY_SUPPORT_MISSING`
- **Reviewer wording:** «الباكست تري مش نفس المستوي»
- **الإصلاح:** نظبط الباسكت تراي والسلم على نفس المستوى ونربط الوصلات كويس.
- **Fix:** Level and align the tray/ladder sections and tighten the joints.

### `CABLE_TRAY_SUPPORT_MISSING` — Tray support / hanger missing (دعامة)

- **الوصف:** جزء من التراي أو السلم من غير دعامة (تعليقة من السقف أو الحيطة) وفاضل سايب.
- **Description:** A tray or ladder span lacks a support/hanger rod (دعامة / "دماعه") from ceiling or wall, leaving it unsupported.
- **Look for:** long unsupported tray span; tray end resting without hanger; ceiling above tray with no threaded rod where neighbours have one
- **Not to confuse with:** `CABLE_TRAY_MISALIGNED`
- **Reviewer wording:** «تركيب دماعه»
- **الإصلاح:** نركب دعامة (تعليقة) للتراي من السقف أو الحيطة.
- **Fix:** Install a support/hanger rod for the tray span.

### `FLOOR_OPENING_NOT_SEALED` — Raised-floor opening not closed

- **الوصف:** بلاطة مقصوصة أو مشالة جنب الراك أو حواليه وسايبة فتحة على تحت البلاط.
- **Description:** A cut or removed raised-floor tile next to/around the rack leaves an open hole into the under-floor void.
- **Look for:** dark gap/hole in the floor next to the rack; missing tile or partially cut tile; cables visible under the floor through an opening
- **Not to confuse with:** `RACK_FLOOR_GAP`, `WALL_OPENING_NOT_SEALED`
- **Reviewer wording:** «سد مكان البلاط»، «نقفل جزء البلاط للاخر»
- **الإصلاح:** نقفل فتحة البلاط للآخر ببلاطة مقصوصة على المقاس أو غطا مناسب.
- **Fix:** Close the floor opening completely with a tile cut to size or a proper cover.

### `RACK_FLOOR_GAP` — Gap between rack and floor tiles

- **الوصف:** فيه مسافة باينة بين قاعدة الراك والبلاط اللي حواليه من قدام أو من الجنب.
- **Description:** Visible gap between the bottom of the rack (plinth) and the surrounding floor tiles along the rack front/side.
- **Look for:** dark strip between rack plinth and tiles; rack bottom raised above tile level; tile edge not reaching the rack
- **Not to confuse with:** `FLOOR_OPENING_NOT_SEALED`
- **Reviewer wording:** «عدم ترك مسافه بين الراك والبلاط»
- **الإصلاح:** نقفل المسافة بين الراك والبلاط (نقص البلاط على المقاس أو نظبط القاعدة).
- **Fix:** Close the gap between rack and tiles (tile cut to size or base adjusted).

### `WALL_OPENING_NOT_SEALED` — Wall/ceiling cable opening not sealed (الشنيشه)

- **الوصف:** فتحة عدية الكابلات في الحيطة أو السقف (الشنيشة) متسابة مفتوحة أو مكسرة ومتقفلتش ومتملتش فوم بعد التركيب.
- **Description:** Cable penetration through a wall or ceiling is left open/broken instead of being closed and filled (fire foam) after installation.
- **Look for:** broken plaster around cables entering a wall; open hole around cable bundle at wall/ceiling; no foam / sealing around penetration
- **Not to confuse with:** `FLOOR_OPENING_NOT_SEALED`, `RUBBER_GLAND_MISSING`
- **Reviewer wording:** «نقفل الشينشه»، «نقفل الشنيشه»
- **الإصلاح:** نقفل الشنيشة ونملاها فوم ونشطب حواليها.
- **Fix:** Close the wall opening, fill it with fire foam and finish around it.

### `RACK_BASE_BOLTS_MISSING` — Rack base leg bolts missing (8 per leg)

- **الوصف:** كل رجل من رجول قاعدة الراك لازم تتربط بـ 8 مسامير، وفيه خرم أو أكتر فاضي.
- **Description:** Each leg of the rack base must be fixed with 8 bolts; one or more bolt holes are empty.
- **Look for:** empty bolt holes on the vertical leg brackets; fewer bolts on one leg than on the others; floor anchor plate without anchor bolt
- **Not to confuse with:** `RACK_BASE_NOT_LEVEL`
- **Reviewer wording:** «نحط 8 مسامير في كل رجل من القاعده»
- **الإصلاح:** نركب 8 مسامير في كل رجل من القاعدة ونربطها كويس.
- **Fix:** Fit and tighten all 8 bolts on every base leg.

### `RACK_BASE_NOT_LEVEL` — Rack base not level / not at tile level

- **الوصف:** القاعدة الحديد مش مظبوطة على الميزان (الفقاعة مش في النص) أو سطحها مش في مستوى البلاط.
- **Description:** The metal base is not level (spirit level bubble off-centre) or its top is not flush with the raised-floor tiles.
- **Look for:** spirit level bubble off-centre; base frame top higher or lower than surrounding tiles; frame visibly twisted
- **Not to confuse with:** `RACK_BASE_BOLTS_MISSING`, `RACK_FLOOR_GAP`
- **الإصلاح:** نظبط القاعدة على الميزان وعلى مستوى البلاط ونصورها والميزان عليها.
- **Fix:** Level the base flush with the tiles and photograph it with the spirit level on top.

### `RACK_MISALIGNED` — Rack not aligned with row / floor tile edge

- **الوصف:** وش الراك مش على استقامة الراكات اللي جنبه أو مع حرف البلاط.
- **Description:** Rack front is not aligned with adjacent racks or with the floor-tile edge.
- **Look for:** rack front set back or forward relative to neighbours; rack rotated relative to the tile grid
- **Not to confuse with:** `RACK_FLOOR_GAP`
- **الإصلاح:** نظبط الراك على استقامة الصف وحرف البلاط.
- **Fix:** Align the rack with the row and the tile edge.

### `HOSTNAME_LABEL_MISSING` — Hostname label missing on router/rack

- **الوصف:** الراوتر (أو الراك/الاو دي اف) مفيش عليه ليبول الهوست نيم (زي SITE-R21C-C-EG) في المكان المتفق عليه.
- **Description:** The router (or rack/ODF it belongs to) has no hostname label (e.g. SITE-R21C-C-EG) in the agreed position.
- **Look for:** blank label area on router front/side panel; rack top without name strip; ODF front without its ODF name
- **Not to confuse with:** `LABEL_MISSING`
- **Reviewer wording:** «الهوست نيم مش موجود»
- **الإصلاح:** نطبع ليبول الهوست نيم بالفورمات المتفق عليه ونلزقه في مكانه.
- **Fix:** Print the hostname label in the agreed format and fix it in its position.

### `LABEL_MISSING` — Cable / port label missing

- **الوصف:** باتش أو كابل باور/أرضي أو أب لينك أو بريكر في الـ PDU أو جهاز من غير ليبول. ليبول اسم الجهاز ليه كود HOSTNAME_LABEL_MISSING.
- **Description:** A patch cord, power/earth cable, uplink, PDU breaker or device has no label where one is required. Use HOSTNAME_LABEL_MISSING for the device name label.
- **Look for:** cord ends without a flag label; power cable without label near termination; a used PDU breaker or its feed cable without a label (blank slots on unused breakers are fine)
- **Not to confuse with:** `HOSTNAME_LABEL_MISSING`, `LABEL_INFO_INCOMPLETE`
- **Reviewer wording:** «نحط الليبول»، «عدم وجود ليبول»
- **الإصلاح:** نحط ليبول على كل كابل أو باتش ناقص بالفورمات المتفق عليه (From / To).
- **Fix:** Add a label in the agreed From/To format to every unlabelled cable or cord.

### `LABEL_DAMAGED` — Label torn / damaged

- **الوصف:** الليبول موجود بس مقطوع أو بيقشر أو متكرمش أو جزء منه ناقص.
- **Description:** A label exists but is torn, peeling, crumpled or partially missing.
- **Look for:** ripped edge on flag label; label peeling off the cable; half a label left
- **Not to confuse with:** `LABEL_MISSING`, `LABEL_INFO_INCOMPLETE`
- **Reviewer wording:** «الليبول مقطوع»
- **الإصلاح:** نغير الليبول المقطوع بليبول جديد.
- **Fix:** Replace the damaged label.

### `LABEL_MISPLACED` — Label in wrong position

- **الوصف:** الليبول متلزق في مكان غلط (زي ليبول الهوست نيم مش على المسمار، أو مستخبي ورا البشات، أو بعيد عن طرف الكابل).
- **Description:** Label is fixed in the wrong place (e.g. hostname label not aligned on the screw line of the router lid, label hidden behind other cords, far from the termination).
- **Look for:** hostname strip offset from the screw / reference line; labels bunched far from connectors; label facing away / hidden
- **Not to confuse with:** `LABEL_MISSING`
- **Reviewer wording:** «وضح الليبول علي مسمار»
- **الإصلاح:** نشيل الليبول ونلزقه في المكان الصح (على المسمار / جنب الطرف).
- **Fix:** Re-fix the label in the correct position (on the screw line / next to the termination).

### `LABEL_INFO_INCOMPLETE` — Label content incomplete / not in agreed format

- **الوصف:** الليبول بيتقري بس ناقص بيانات (From / To، البورت، Circuit ID، نوع الباور) أو مكتوب بخط اليد مش مطبوع.
- **Description:** Label is readable but lacks required info (From / To, port, circuit ID, power type/level) or is hand-written instead of printed.
- **Look for:** only one end written (From without To); hand-written marker label; power label without feed/level info
- **Not to confuse with:** `LABEL_DAMAGED`, `LABEL_MISSING`
- **الإصلاح:** نطبع ليبول جديد فيه From و To والبورت بالفورمات المتفق عليه.
- **Fix:** Print a new label with From, To and port in the agreed format.

### `POWER_PLUG_EXPOSED` — Loose power plug / cord visible (الفيشه)

- **الوصف:** فيشة أو سلك باور (زي فيشة مراوح الراك) متسابة مدلدلة أو ملفوفة وباينة في الراك بدل ما تتخبى وتتسستم.
- **Description:** An unused or loose AC power cord/plug (e.g. rack fan cord) is left hanging or coiled visibly in the rack instead of being hidden/dressed.
- **Look for:** black AC plug hanging at top of rack; coiled power cord tied on a panel; loose plug resting on equipment
- **Not to confuse with:** `POWER_CABLE_ROUTING_UNTIDY`
- **Reviewer wording:** «اخفاء الفيشه»، «نخفي الفيشه»
- **الإصلاح:** نخفي الفيشة ونلم السلك ونربطه ورا البانل.
- **Fix:** Hide the plug and dress the cord out of sight behind the panel.

### `PDU_SCREW_MISSING` — PDU fixing screw missing

- **الوصف:** مسمار أو أكتر من مسامير تثبيت الـ PDU (أو الغطا بتاعه) في الراك ناقص.
- **Description:** One or more rack-mount screws/cage nuts of the PDU (or its cover) are missing.
- **Look for:** empty mounting hole on PDU ear; fewer screws on one side than the other; PDU cover not screwed
- **Reviewer wording:** «مسمار  بي دي يو»
- **الإصلاح:** نركب كل مسامير الـ PDU ونربطها.
- **Fix:** Fit and tighten all PDU mounting screws.

### `POWER_CABLE_DAMAGED` — Power/earth cable insulation scratched or damaged

- **الوصف:** عزل كابل الباور أو الأرضي (أو جلبة الكوس) فيه خدوش أو قطع أو النحاس باين.
- **Description:** Insulation of a power or earth cable (or its lug sleeve) is scratched, cut or exposes conductor.
- **Look for:** scuffed / cut insulation; copper visible near a lug; tape wrapped over damage
- **Reviewer wording:** «يوجد خدوش في كابل الباور»
- **الإصلاح:** نغير الكابل المخدوش أو الجزء التالف (مش بنلفه بلزق).
- **Fix:** Replace the damaged cable or section (taping over is not accepted).

### `BUSBAR_WRONG_DRILLING` — Wrong / extra drilling on busbar

- **الوصف:** خروم متخرمة في مكان غلط في بارة الباور أو الأرضي (خروم زيادة مش مستخدمة أو دهان باظ حواليها).
- **Description:** Holes drilled in the wrong place on a power or earth busbar (extra unused holes, damaged paint/plating around holes).
- **Look for:** empty fresh drill hole with bare metal ring; hole between existing terminals; swarf / damaged coating around hole
- **Reviewer wording:** «في تخريم في مكان غير صحيح في الباره»
- **الإصلاح:** نرجع للاستشاري: يا نغير البارة يا نعالج الخرم حسب التعليمات، ونخرم بعد كده في الأماكن المعتمدة بس.
- **Fix:** Escalate: replace the bar or treat the hole as instructed; drill only at approved positions.

### `POWER_CABLE_ROUTING_UNTIDY` — Power/earth cable dressing untidy or mixed with data

- **الوصف:** كابلات الباور أو الأرضي مش متربطة بتاي راب كويس، أو مش في الجنب بتاعها من التراي، أو ماشية مع الفايبر أو الـ UTP (المطلوب حوالي 30 سم فصل).
- **Description:** Power or earth cables not bundled with tie-wraps, not on their own side of the tray/ladder, or run together with fiber/UTP (SID requires ~30 cm separation).
- **Look for:** power cables crossing over each other on the ladder; missing or irregular tie-wraps; power and data in the same bundle/tray side
- **Not to confuse with:** `POWER_PLUG_EXPOSED`, `MANAGEMENT_CABLE_UNTIDY`
- **الإصلاح:** نعيد سستمة كابلات الباور بتاي راب على مسافات ثابتة وفي جنب لوحدها بعيد عن الداتا.
- **Fix:** Re-dress power cables with evenly spaced tie-wraps, on their own side away from data cables.

### `MANAGEMENT_CABLE_UNTIDY` — Management (UTP) cable routing untidy

- **الوصف:** كابل المانجمنت (UTP) سايب أو مش ماشي في التراي أو المنظم أو مدلدل أو معدي على البشات.
- **Description:** The management/UTP cable is loose, not following the tray/organiser, hanging, or crossing the fiber bundle.
- **Look for:** single grey/blue UTP cable running outside the organiser; UTP draped over fiber bundle; UTP loose between racks without tie
- **Not to confuse with:** `PATCH_CORD_ROUTING_UNTIDY`, `POWER_CABLE_ROUTING_UNTIDY`
- **Reviewer wording:** «نظبط المانجمنيت»، «نظبط المانجمنت»، «نعدل المانجمنت»، «المانجمنت نظبطه»، «نظبط المانجممنت»
- **الإصلاح:** نمشي كابل المانجمنت في مساره على التراي والمنظم ونربطه بعيد عن البشات.
- **Fix:** Route the management cable along the tray/organiser and tie it away from the fiber.

### `ARMOURED_CABLE_ROUTING_UNTIDY` — Armoured fibre cable routing untidy

- **الوصف:** كابل الارمود مش متسستم كويس في مساره (سايب أو معدي على غيره أو مش متربط أو الاسبير بتاعه مش منظم على السلم).
- **Description:** Armoured fibre cable is not dressed neatly along its path (loose, crossing, not tied, slack not organised on the ladder).
- **Look for:** armoured cable snaking loosely in the tray; cable outside the duct/tray; armoured slack coil hanging unsecured
- **Not to confuse with:** `FIBER_BEND_RADIUS_TOO_TIGHT`
- **Reviewer wording:** «نظبط سستمه الارمود»، «نظبط الارمود»
- **الإصلاح:** نسستم الارمود في مساره ونربطه، ونلم الاسبير (2 متر) بشكل منظم.
- **Fix:** Dress and tie the armoured cable along its path; coil the 2 m spare neatly.

### `ODF_SHEET_MISSING_OR_UNREADABLE` — ODF port utilization sheet missing / unreadable

- **الوصف:** شيت توزيع بورتات الاو دي اف مش متعلق في جراب على باب الراك، أو مش مقروء أو ناقص.
- **Description:** The printed port utilization sheet is not posted in a sleeve on the rack door, or it is unreadable/incomplete.
- **Look for:** rack door without the plastic sleeve and sheet; sheet hand-written or with empty columns; sheet torn / wet / faded
- **Not to confuse with:** `PHOTO_BLURRY`
- **الإصلاح:** نطبع شيت الاو دي اف المحدث ونعلقه في جراب على باب الراك.
- **Fix:** Print the up-to-date ODF sheet and post it in a sleeve on the rack door.

### `OTHER_SNAG` — Other issue (not in taxonomy)

- **الوصف:** عيب تركيب حقيقي مفيش كود يوصفه. لازم نشرح السبب كامل؛ الملاحظات دي بتتراجع عشان نضيف أكواد جديدة.
- **Description:** A real installation defect that no other code describes. Explain it fully in reasonEn/reasonAr; these are reviewed to extend the taxonomy.
- **Look for:** any clear workmanship defect not covered by a specific code
- **الإصلاح:** حسب الملاحظة؛ المراجع هيحدد الإصلاح.
- **Fix:** Depends on the remark; the reviewer will specify the fix.

## Checklists per category

### rack — Rack (active & passive) / الراك (الأكتيف والباسيف)

- **RACK-00** الصورة واضحة ومنورة وبتوضح البند كامل ومفيش حد ظاهر فيها. — Photo is sharp, well lit, shows the subject of this category completely, and nobody is in the frame. → `PERSON_IN_FRAME`, `PHOTO_BLURRY`, `PHOTO_TOO_DARK`, `WRONG_CATEGORY`, `SUBJECT_NOT_FULLY_VISIBLE`
- **RACK-01** مفيش اسبير ولا كرتون ولا مخلفات ولا تراب ولا باغة جوه الراك أو عليه. — No spare material, cardboard, debris, dust or marker marks in or on the rack. → `SPARE_LEFT_IN_RACK`, `PACKAGING_OR_DEBRIS_LEFT`, `DUST_OR_DIRT`, `MARKER_OR_STAIN_MARKS`
- **RACK-02** الأبواب اللي مش بنصور جواها مقفولة صح، وصورة الراك المقفول كل أبوابها مقفولة. — Doors not being photographed are closed and latched; closed-rack shot has all doors closed. → `RACK_DOOR_NOT_CLOSED`
- **RACK-03** الراك على استقامة الصف ولازق في البلاط ومفيش فتحة ولا مسافة حواليه. — Rack aligned with the row and flush with the floor; no open tile or gap around it. → `RACK_MISALIGNED`, `RACK_FLOOR_GAP`, `FLOOR_OPENING_NOT_SEALED`
- **RACK-04** الراك والراوتر والاو دي اف عليهم ليبول الاسم، وشيت الاو دي اف متعلق على الباب. — Rack, router and ODFs carry their hostname/name labels; ODF sheet posted on the door. → `HOSTNAME_LABEL_MISSING`, `ODF_SHEET_MISSING_OR_UNREADABLE`
- **RACK-05** مفيش فيشة أو سلك باور مدلدل في الراك، وفتحات دخول الكابلات محمية. — No loose power plug or cord hanging in the rack; cable entries protected. → `POWER_PLUG_EXPOSED`, `RUBBER_GLAND_MISSING`
- **RACK-06** البشات اللي باينة في الصورة متسستمة كويس في المنظمات الرأسية. — Patch cords visible in the overview are dressed neatly in the vertical organisers. → `PATCH_CORD_NOT_BUNDLED`, `PATCH_CORD_MULTIPLE_PATHS`, `PATCH_CORD_CROSSING`, `PATCH_CORD_EXCESS_LENGTH`, `PATCH_CORD_UNDER_TENSION`, `FIBER_BEND_RADIUS_TOO_TIGHT`, `PATCH_CORD_ROUTING_UNTIDY`

### rack_base — Rack base (raised-floor frame) / قاعدة الراك

- **BASE-00** الصورة واضحة ومنورة وبتوضح البند كامل ومفيش حد ظاهر فيها. — Photo is sharp, well lit, shows the subject of this category completely, and nobody is in the frame. → `PERSON_IN_FRAME`, `PHOTO_BLURRY`, `PHOTO_TOO_DARK`, `WRONG_CATEGORY`, `SUBJECT_NOT_FULLY_VISIBLE`
- **BASE-01** كل رجل متربطة بـ 8 مسامير والخوابير في الأرض موجودة. — Every leg fixed with 8 bolts; floor anchors present. → `RACK_BASE_BOLTS_MISSING`
- **BASE-02** القاعدة على الميزان وفي مستوى البلاط، والبلاط مقصوص مظبوط حواليها. — Base level and flush with the tile level; tiles cut tight around the frame. → `RACK_BASE_NOT_LEVEL`, `RACK_FLOOR_GAP`, `FLOOR_OPENING_NOT_SEALED`
- **BASE-03** تحت البلاط حوالين القاعدة نضيف من المخلفات والكرتون. — Under-floor area around the base clean of debris and cardboard. → `PACKAGING_OR_DEBRIS_LEFT`, `DUST_OR_DIRT`
- **BASE-04** السلم اللي تحت البلاط جنب القاعدة مظبوط ومستوي. — Under-floor ladder next to the base aligned and level. → `CABLE_TRAY_MISALIGNED`

### router — Router (front view) / الراوتر

- **ROUTER-00** الصورة واضحة ومنورة وبتوضح البند كامل ومفيش حد ظاهر فيها. — Photo is sharp, well lit, shows the subject of this category completely, and nobody is in the frame. → `PERSON_IN_FRAME`, `PHOTO_BLURRY`, `PHOTO_TOO_DARK`, `WRONG_CATEGORY`, `SUBJECT_NOT_FULLY_VISIBLE`
- **ROUTER-01** ليبول الهوست نيم موجود في مكانه. — Hostname label present in the agreed position. → `HOSTNAME_LABEL_MISSING`, `LABEL_MISPLACED`
- **ROUTER-02** البشات طالعة من الكروت في حزم متربطة اسكوتش ماشية في الجايد لجنب واحد. — Cords leave the line cards in velcro-bundled groups through the cable guide to one side. → `PATCH_CORD_NOT_BUNDLED`, `PATCH_CORD_MULTIPLE_PATHS`, `PATCH_CORD_CROSSING`, `PATCH_CORD_EXCESS_LENGTH`, `PATCH_CORD_UNDER_TENSION`, `FIBER_BEND_RADIUS_TOO_TIGHT`, `PATCH_CORD_ROUTING_UNTIDY`
- **ROUTER-03** كل باتش على الراوتر عليه ليبول، والبورتات الفاضية عليها غطا. — Every cord at the router carries a label; unused optical ports capped. → `LABEL_MISSING`, `DUST_CAP_MISSING`
- **ROUTER-04** مفيش حاجة متسابة قدام الراوتر أو عليه، وكابل المانجمنت متسستم. — Nothing stored in front of or on the router; management cable dressed. → `SPARE_LEFT_IN_RACK`, `MANAGEMENT_CABLE_UNTIDY`, `DUST_OR_DIRT`

### patch_cords — Patch cord path (السستمه) / مسار وسستمة البشات

- **PATCH-00** الصورة واضحة ومنورة وبتوضح البند كامل ومفيش حد ظاهر فيها. — Photo is sharp, well lit, shows the subject of this category completely, and nobody is in the frame. → `PERSON_IN_FRAME`, `PHOTO_BLURRY`, `PHOTO_TOO_DARK`, `WRONG_CATEGORY`, `SUBJECT_NOT_FULLY_VISIBLE`
- **PATCH-01** البشات متجمعة باسكوتش على مسافات متساوية، في مسار واحد، من غير كروس ولا أطوال زيادة ولا شد، والكرفة واسعة. — Patch cords bundled with velcro at equal spacing, single path, no crossing, no excess loops, not taut, wide bends. → `PATCH_CORD_NOT_BUNDLED`, `PATCH_CORD_MULTIPLE_PATHS`, `PATCH_CORD_CROSSING`, `PATCH_CORD_EXCESS_LENGTH`, `PATCH_CORD_UNDER_TENSION`, `FIBER_BEND_RADIUS_TOO_TIGHT`, `PATCH_CORD_ROUTING_UNTIDY`
- **PATCH-02** بشات الراوتر في داكت واحد بين الأكتيف والباسيف والداكت مقفول عند النزلات. — Patch cords of the router bundled into one duct between active and passive racks; duct closed at drops. → `DUCT_COVER_OPEN`, `DUCT_SECTION_MISSING`
- **PATCH-03** كابل المانجمنت بعيد عن حزمة الفايبر. — Management/UTP cable kept separate from the fiber bundle. → `MANAGEMENT_CABLE_UNTIDY`

### armoured_cables — Armoured fibre cable path / مسار كابل الارمود

- **ARMD-00** الصورة واضحة ومنورة وبتوضح البند كامل ومفيش حد ظاهر فيها. — Photo is sharp, well lit, shows the subject of this category completely, and nobody is in the frame. → `PERSON_IN_FRAME`, `PHOTO_BLURRY`, `PHOTO_TOO_DARK`, `WRONG_CATEGORY`, `SUBJECT_NOT_FULLY_VISIBLE`
- **ARMD-01** الارمود متسستم ومتربط في مساره والاسبير ملفوف بشكل منظم. — Armoured cable dressed and tied along its path; spare coiled neatly. → `ARMOURED_CABLE_ROUTING_UNTIDY`
- **ARMD-02** مفيش ثنيات حادة عند النزلات وتغيير التراي. — No sharp bends at drops and tray transitions. → `FIBER_BEND_RADIUS_TOO_TIGHT`
- **ARMD-03** الداكت مكمل في المسار كله ومقفول (حتى عند النزلات) ومستقيم ومش مكسور. — Duct is complete along the route, closed (including at drops), straight and undamaged. → `DUCT_SECTION_MISSING`, `DUCT_COVER_OPEN`, `DUCT_TILTED`, `DUCT_BROKEN`
- **ARMD-04** التراي والسلم على مستوى واحد ومتظبطين ومتعلقين بدعامات، والفتحات عليها رابر جلاد. — Tray/ladder level, aligned and supported; cable openings protected by rubber glands. → `CABLE_TRAY_MISALIGNED`, `CABLE_TRAY_SUPPORT_MISSING`, `RUBBER_GLAND_MISSING`
- **ARMD-05** فتحات الحيطة والبلاط مقفولة. — Wall/floor penetrations sealed. → `WALL_OPENING_NOT_SEALED`, `FLOOR_OPENING_NOT_SEALED`

### duct — Duct (with cover) / الداكت

- **DUCT-00** الصورة واضحة ومنورة وبتوضح البند كامل ومفيش حد ظاهر فيها. — Photo is sharp, well lit, shows the subject of this category completely, and nobody is in the frame. → `PERSON_IN_FRAME`, `PHOTO_BLURRY`, `PHOTO_TOO_DARK`, `WRONG_CATEGORY`, `SUBJECT_NOT_FULLY_VISIBLE`
- **DUCT-01** الداكت مكمل في المسار كله ومقفول (حتى عند النزلات) ومستقيم ومش مكسور. — Duct is complete along the route, closed (including at drops), straight and undamaged. → `DUCT_SECTION_MISSING`, `DUCT_COVER_OPEN`, `DUCT_TILTED`, `DUCT_BROKEN`
- **DUCT-02** التراي والسلم على مستوى واحد ومتظبطين ومتعلقين بدعامات، والفتحات عليها رابر جلاد. — Tray/ladder level, aligned and supported; cable openings protected by rubber glands. → `CABLE_TRAY_MISALIGNED`, `CABLE_TRAY_SUPPORT_MISSING`, `RUBBER_GLAND_MISSING`
- **DUCT-03** الداكت نضيف ومفيش عليه باغة أو مخلفات. — Duct clean, no marker marks or debris on top. → `DUST_OR_DIRT`, `MARKER_OR_STAIN_MARKS`, `PACKAGING_OR_DEBRIS_LEFT`

### management — Management cable path / مسار كابل المانجمنت

- **MGMT-00** الصورة واضحة ومنورة وبتوضح البند كامل ومفيش حد ظاهر فيها. — Photo is sharp, well lit, shows the subject of this category completely, and nobody is in the frame. → `PERSON_IN_FRAME`, `PHOTO_BLURRY`, `PHOTO_TOO_DARK`, `WRONG_CATEGORY`, `SUBJECT_NOT_FULLY_VISIBLE`
- **MGMT-01** كابل المانجمنت ماشي في التراي والمنظم ومتربط ومش معدي على الفايبر. — Management cable follows the tray/organiser, tied, not draped over fiber. → `MANAGEMENT_CABLE_UNTIDY`
- **MGMT-02** عليه ليبول من الطرفين. — Labelled at both ends. → `LABEL_MISSING`
- **MGMT-03** الداكت مكمل في المسار كله ومقفول (حتى عند النزلات) ومستقيم ومش مكسور. — Duct is complete along the route, closed (including at drops), straight and undamaged. → `DUCT_SECTION_MISSING`, `DUCT_COVER_OPEN`, `DUCT_TILTED`, `DUCT_BROKEN`

### odf_cross_connect — ODF cross-connect / الاو دي اف كروس كونكت

- **ODFCC-00** الصورة واضحة ومنورة وبتوضح البند كامل ومفيش حد ظاهر فيها. — Photo is sharp, well lit, shows the subject of this category completely, and nobody is in the frame. → `PERSON_IN_FRAME`, `PHOTO_BLURRY`, `PHOTO_TOO_DARK`, `WRONG_CATEGORY`, `SUBJECT_NOT_FULLY_VISIBLE`
- **ODFCC-01** مفيش اسبير جوه الاو دي اف، والكابلرات الفاضية عليها غطا. — No spare cords, pigtails or adapters stored inside the ODF; unused couplers capped. → `SPARE_LEFT_IN_ODF`, `DUST_CAP_MISSING`
- **ODFCC-02** البشات داخلة الاو دي اف من جنب واحد من المنظم ومتجمعة ومن غير كروس. — Cords enter the ODF from one side through the organiser, bundled, without crossing. → `PATCH_CORD_NOT_BUNDLED`, `PATCH_CORD_MULTIPLE_PATHS`, `PATCH_CORD_CROSSING`, `PATCH_CORD_EXCESS_LENGTH`, `PATCH_CORD_UNDER_TENSION`, `FIBER_BEND_RADIUS_TOO_TIGHT`, `PATCH_CORD_ROUTING_UNTIDY`
- **ODFCC-03** ليبول اسم الاو دي اف موجود والشباك نضيف. — ODF name label present; ODF window clean. → `HOSTNAME_LABEL_MISSING`, `MARKER_OR_STAIN_MARKS`, `DUST_OR_DIRT`

### odf_cross_connect_labels — ODF cross-connect labels / ليبولات الاو دي اف كروس كونكت

- **ODFCCL-00** الصورة واضحة ومنورة وبتوضح البند كامل ومفيش حد ظاهر فيها. — Photo is sharp, well lit, shows the subject of this category completely, and nobody is in the frame. → `PERSON_IN_FRAME`, `PHOTO_BLURRY`, `PHOTO_TOO_DARK`, `WRONG_CATEGORY`, `SUBJECT_NOT_FULLY_VISIBLE`
- **ODFCCL-01** كل باتش كروس كونكت عليه ليبول مطبوع وسليم وفي مكانه وفيه From / To. — Every cross-connect patch cord has a printed, intact, correctly placed label with From/To information. → `LABEL_MISSING`, `LABEL_DAMAGED`, `LABEL_MISPLACED`, `LABEL_INFO_INCOMPLETE`
- **ODFCCL-02** الكابلرات اللي باينة عليها غطا ومفيش اسبير في الاو دي اف. — Adapters visible in the background capped; no spares in ODF. → `DUST_CAP_MISSING`, `SPARE_LEFT_IN_ODF`

### odf_tie — ODF tie / الاو دي اف تاي

- **ODFTIE-00** الصورة واضحة ومنورة وبتوضح البند كامل ومفيش حد ظاهر فيها. — Photo is sharp, well lit, shows the subject of this category completely, and nobody is in the frame. → `PERSON_IN_FRAME`, `PHOTO_BLURRY`, `PHOTO_TOO_DARK`, `WRONG_CATEGORY`, `SUBJECT_NOT_FULLY_VISIBLE`
- **ODFTIE-01** مفيش اسبير جوه الاو دي اف، والكابلرات الفاضية عليها غطا. — No spare cords, pigtails or adapters stored inside the ODF; unused couplers capped. → `SPARE_LEFT_IN_ODF`, `DUST_CAP_MISSING`
- **ODFTIE-02** البشات متجمعة باسكوتش على مسافات متساوية، في مسار واحد، من غير كروس ولا أطوال زيادة ولا شد، والكرفة واسعة. — Patch cords bundled with velcro at equal spacing, single path, no crossing, no excess loops, not taut, wide bends. → `PATCH_CORD_NOT_BUNDLED`, `PATCH_CORD_MULTIPLE_PATHS`, `PATCH_CORD_CROSSING`, `PATCH_CORD_EXCESS_LENGTH`, `PATCH_CORD_UNDER_TENSION`, `FIBER_BEND_RADIUS_TOO_TIGHT`, `PATCH_CORD_ROUTING_UNTIDY`
- **ODFTIE-03** دخول الارمود متسستم والاسبير بتاعه منظم، وليبول اسم الاو دي اف موجود. — Armoured cable entry dressed with its spare; ODF name label present. → `ARMOURED_CABLE_ROUTING_UNTIDY`, `HOSTNAME_LABEL_MISSING`

### odf_tie_labels — ODF tie labels / ليبولات الاو دي اف تاي

- **ODFTIEL-00** الصورة واضحة ومنورة وبتوضح البند كامل ومفيش حد ظاهر فيها. — Photo is sharp, well lit, shows the subject of this category completely, and nobody is in the frame. → `PERSON_IN_FRAME`, `PHOTO_BLURRY`, `PHOTO_TOO_DARK`, `WRONG_CATEGORY`, `SUBJECT_NOT_FULLY_VISIBLE`
- **ODFTIEL-01** كل باتش تاي عليه ليبول مطبوع وسليم وفي مكانه وفيه From / To. — Every tie patch cord has a printed, intact, correctly placed label with From/To information. → `LABEL_MISSING`, `LABEL_DAMAGED`, `LABEL_MISPLACED`, `LABEL_INFO_INCOMPLETE`
- **ODFTIEL-02** الكابلرات اللي باينة عليها غطا ومفيش اسبير في الاو دي اف. — Adapters visible in the background capped; no spares in ODF. → `DUST_CAP_MISSING`, `SPARE_LEFT_IN_ODF`

### odf_sheet — ODF utilization sheet / شيت الاو دي اف

- **SHEET-00** الصورة واضحة ومنورة وبتوضح البند كامل ومفيش حد ظاهر فيها. — Photo is sharp, well lit, shows the subject of this category completely, and nobody is in the frame. → `PERSON_IN_FRAME`, `PHOTO_BLURRY`, `PHOTO_TOO_DARK`, `WRONG_CATEGORY`, `SUBJECT_NOT_FULLY_VISIBLE`
- **SHEET-01** الشيت متعلق في جراب، مطبوع وكامل ومقروء. — Sheet posted in a plastic sleeve, printed, complete and readable. → `ODF_SHEET_MISSING_OR_UNREADABLE`

### uplink — Uplink path / مسار الأب لينك

- **UPL-00** الصورة واضحة ومنورة وبتوضح البند كامل ومفيش حد ظاهر فيها. — Photo is sharp, well lit, shows the subject of this category completely, and nobody is in the frame. → `PERSON_IN_FRAME`, `PHOTO_BLURRY`, `PHOTO_TOO_DARK`, `WRONG_CATEGORY`, `SUBJECT_NOT_FULLY_VISIBLE`
- **UPL-01** البشات متجمعة باسكوتش على مسافات متساوية، في مسار واحد، من غير كروس ولا أطوال زيادة ولا شد، والكرفة واسعة. — Patch cords bundled with velcro at equal spacing, single path, no crossing, no excess loops, not taut, wide bends. → `PATCH_CORD_NOT_BUNDLED`, `PATCH_CORD_MULTIPLE_PATHS`, `PATCH_CORD_CROSSING`, `PATCH_CORD_EXCESS_LENGTH`, `PATCH_CORD_UNDER_TENSION`, `FIBER_BEND_RADIUS_TOO_TIGHT`, `PATCH_CORD_ROUTING_UNTIDY`
- **UPL-02** الداكت مكمل في المسار كله ومقفول (حتى عند النزلات) ومستقيم ومش مكسور. — Duct is complete along the route, closed (including at drops), straight and undamaged. → `DUCT_SECTION_MISSING`, `DUCT_COVER_OPEN`, `DUCT_TILTED`, `DUCT_BROKEN`
- **UPL-03** التراي والسلم على مستوى واحد ومتظبطين ومتعلقين بدعامات، والفتحات عليها رابر جلاد. — Tray/ladder level, aligned and supported; cable openings protected by rubber glands. → `CABLE_TRAY_MISALIGNED`, `CABLE_TRAY_SUPPORT_MISSING`, `RUBBER_GLAND_MISSING`
- **UPL-04** كابلات الأب لينك متعلمة وتتعرف على طول المسار. — Uplink cables marked and recognisable along the path. → `LABEL_MISSING`

### uplink_labels — Uplink labels / ليبولات الأب لينك

- **UPLL-00** الصورة واضحة ومنورة وبتوضح البند كامل ومفيش حد ظاهر فيها. — Photo is sharp, well lit, shows the subject of this category completely, and nobody is in the frame. → `PERSON_IN_FRAME`, `PHOTO_BLURRY`, `PHOTO_TOO_DARK`, `WRONG_CATEGORY`, `SUBJECT_NOT_FULLY_VISIBLE`
- **UPLL-01** كل أب لينك عليه ليبول مطبوع وسليم وفي مكانه وفيه From / To. — Every uplink cord has a printed, intact, correctly placed label with From/To information. → `LABEL_MISSING`, `LABEL_DAMAGED`, `LABEL_MISPLACED`, `LABEL_INFO_INCOMPLETE`

### pdu — PDU / الـ PDU

- **PDU-00** الصورة واضحة ومنورة وبتوضح البند كامل ومفيش حد ظاهر فيها. — Photo is sharp, well lit, shows the subject of this category completely, and nobody is in the frame. → `PERSON_IN_FRAME`, `PHOTO_BLURRY`, `PHOTO_TOO_DARK`, `WRONG_CATEGORY`, `SUBJECT_NOT_FULLY_VISIBLE`
- **PDU-01** كل مسامير تثبيت الـ PDU موجودة. — All PDU mounting screws fitted. → `PDU_SCREW_MISSING`
- **PDU-02** الـ PDU والبريكرات عليها ليبولات. — PDU and its breakers labelled. → `LABEL_MISSING`, `LABEL_INFO_INCOMPLETE`, `HOSTNAME_LABEL_MISSING`
- **PDU-03** مفيش فيشة سايبة، وكابلات الدخول متسستمة على الجنب. — No loose plug/cord; input cables dressed on the side. → `POWER_PLUG_EXPOSED`, `POWER_CABLE_ROUTING_UNTIDY`

### power_path — Power cable path / مسار كابلات الباور

- **PWRP-00** الصورة واضحة ومنورة وبتوضح البند كامل ومفيش حد ظاهر فيها. — Photo is sharp, well lit, shows the subject of this category completely, and nobody is in the frame. → `PERSON_IN_FRAME`, `PHOTO_BLURRY`, `PHOTO_TOO_DARK`, `WRONG_CATEGORY`, `SUBJECT_NOT_FULLY_VISIBLE`
- **PWRP-01** كابلات الباور والأرضي متربطة تاي راب في جنب لوحدها بعيد عن الداتا والعزل سليم. — Power/earth cables bundled with tie-wraps on their own side, separated from data, insulation undamaged. → `POWER_CABLE_ROUTING_UNTIDY`, `POWER_CABLE_DAMAGED`
- **PWRP-02** التوصيلات على البارة والفيوزات مظبوطة ومفيش تخريم غلط. — Busbar/fuse terminations neat; no wrong or extra drilling. → `BUSBAR_WRONG_DRILLING`
- **PWRP-03** التراي والسلم على مستوى واحد ومتظبطين ومتعلقين بدعامات، والفتحات عليها رابر جلاد. — Tray/ladder level, aligned and supported; cable openings protected by rubber glands. → `CABLE_TRAY_MISALIGNED`, `CABLE_TRAY_SUPPORT_MISSING`, `RUBBER_GLAND_MISSING`
- **PWRP-04** فتحات الحيطة والبلاط مقفولة. — Wall and floor openings closed/sealed. → `WALL_OPENING_NOT_SEALED`, `FLOOR_OPENING_NOT_SEALED`

### earth_path — Earth cable path / مسار كابل الأرضي

- **EARTH-00** الصورة واضحة ومنورة وبتوضح البند كامل ومفيش حد ظاهر فيها. — Photo is sharp, well lit, shows the subject of this category completely, and nobody is in the frame. → `PERSON_IN_FRAME`, `PHOTO_BLURRY`, `PHOTO_TOO_DARK`, `WRONG_CATEGORY`, `SUBJECT_NOT_FULLY_VISIBLE`
- **EARTH-01** كابلات الباور والأرضي متربطة تاي راب في جنب لوحدها بعيد عن الداتا والعزل سليم. — Power/earth cables bundled with tie-wraps on their own side, separated from data, insulation undamaged. → `POWER_CABLE_ROUTING_UNTIDY`, `POWER_CABLE_DAMAGED`
- **EARTH-02** التوصيلة على بارة الأرضي مظبوطة ومفيش تخريم غلط. — Earth bar termination neat; no wrong drilling. → `BUSBAR_WRONG_DRILLING`
- **EARTH-03** كابل الأرضي عليه ليبول عند الراك. — Earth cable labelled at the rack end. → `LABEL_MISSING`
- **EARTH-04** التراي والسلم على مستوى واحد ومتظبطين ومتعلقين بدعامات، والفتحات عليها رابر جلاد. — Tray/ladder level, aligned and supported; cable openings protected by rubber glands. → `CABLE_TRAY_MISALIGNED`, `CABLE_TRAY_SUPPORT_MISSING`, `RUBBER_GLAND_MISSING`

### power_labels — Power cable labels / ليبولات كابلات الباور

- **PWRL-00** الصورة واضحة ومنورة وبتوضح البند كامل ومفيش حد ظاهر فيها. — Photo is sharp, well lit, shows the subject of this category completely, and nobody is in the frame. → `PERSON_IN_FRAME`, `PHOTO_BLURRY`, `PHOTO_TOO_DARK`, `WRONG_CATEGORY`, `SUBJECT_NOT_FULLY_VISIBLE`
- **PWRL-01** كل كابل باور أو أرضي عليه ليبول مطبوع وسليم وفي مكانه وفيه From / To. — Every power/earth cable has a printed, intact, correctly placed label with From/To information. → `LABEL_MISSING`, `LABEL_DAMAGED`, `LABEL_MISPLACED`, `LABEL_INFO_INCOMPLETE`
- **PWRL-02** عزل الكابل سليم جنب الليبول. — Cable insulation undamaged near the label. → `POWER_CABLE_DAMAGED`

### power_system — Power cable dressing (system) / سستمة كابلات الباور

- **PWRS-00** الصورة واضحة ومنورة وبتوضح البند كامل ومفيش حد ظاهر فيها. — Photo is sharp, well lit, shows the subject of this category completely, and nobody is in the frame. → `PERSON_IN_FRAME`, `PHOTO_BLURRY`, `PHOTO_TOO_DARK`, `WRONG_CATEGORY`, `SUBJECT_NOT_FULLY_VISIBLE`
- **PWRS-01** كابلات الباور والأرضي متربطة تاي راب في جنب لوحدها بعيد عن الداتا والعزل سليم. — Power/earth cables bundled with tie-wraps on their own side, separated from data, insulation undamaged. → `POWER_CABLE_ROUTING_UNTIDY`, `POWER_CABLE_DAMAGED`
- **PWRS-02** دخول الكابلات من سقف الراك محمي ومفيش فيش سايبة. — Rack-top cable entry protected; no loose plugs. → `RUBBER_GLAND_MISSING`, `POWER_PLUG_EXPOSED`
- **PWRS-03** التراي والسلم على مستوى واحد ومتظبطين ومتعلقين بدعامات، والفتحات عليها رابر جلاد. — Tray/ladder level, aligned and supported; cable openings protected by rubber glands. → `CABLE_TRAY_MISALIGNED`, `CABLE_TRAY_SUPPORT_MISSING`, `RUBBER_GLAND_MISSING`

### test_room — ODF tie in test room / الاو دي اف تاي في غرفة التست

- **TEST-00** الصورة واضحة ومنورة وبتوضح البند كامل ومفيش حد ظاهر فيها. — Photo is sharp, well lit, shows the subject of this category completely, and nobody is in the frame. → `PERSON_IN_FRAME`, `PHOTO_BLURRY`, `PHOTO_TOO_DARK`, `WRONG_CATEGORY`, `SUBJECT_NOT_FULLY_VISIBLE`
- **TEST-01** مفيش اسبير جوه الاو دي اف، والكابلرات الفاضية عليها غطا. — No spare cords, pigtails or adapters stored inside the ODF; unused couplers capped. → `SPARE_LEFT_IN_ODF`, `DUST_CAP_MISSING`
- **TEST-02** الاو دي اف عليه ليبول ودخول الارمود متسستم. — ODF labelled; armoured cable entry dressed. → `HOSTNAME_LABEL_MISSING`, `ARMOURED_CABLE_ROUTING_UNTIDY`
- **TEST-03** البشات عند الاو دي اف متسستمة. — Cords at the test-room ODF dressed. → `PATCH_CORD_ROUTING_UNTIDY`, `PATCH_CORD_EXCESS_LENGTH`
