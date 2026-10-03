import type { PhotoCategory } from '@acceptance/shared';
import type { AcceptanceCriterion, CategoryChecklist } from './schema.js';

/**
 * Per-category acceptance checklists.
 *
 * Every checklist starts with the common photo-quality criterion (<PREFIX>-00).
 * `sidRef` points to the matching line of the SID "Acceptance check list"
 * (transcribed in docs/sid-checklist-ocr-plan.md).
 * `goodExampleNotes` describe the approved photos in the 9902/9906/NCS-57C3/NASR3 folders.
 */

function common(prefix: string): AcceptanceCriterion {
  return {
    id: `${prefix}-00`,
    textEn: 'Photo is sharp, well lit, shows the subject of this category completely, and nobody is in the frame.',
    textAr: 'الصورة واضحة ومنورة وبتوضح البند كامل ومفيش حد ظاهر فيها.',
    guardsCodes: ['PERSON_IN_FRAME', 'PHOTO_BLURRY', 'PHOTO_TOO_DARK', 'WRONG_CATEGORY', 'SUBJECT_NOT_FULLY_VISIBLE'],
  };
}

function checklist(prefix: string, c: Omit<CategoryChecklist, 'acceptanceCriteria'> & { criteria: AcceptanceCriterion[] }): CategoryChecklist {
  const { criteria, ...rest } = c;
  return { ...rest, acceptanceCriteria: [common(prefix), ...criteria] };
}

const CLEAN_RACK: Omit<AcceptanceCriterion, 'id'> = {
  textEn: 'No spare material, cardboard, debris, dust or marker marks in or on the rack.',
  textAr: 'مفيش اسبير ولا كرتون ولا مخلفات ولا تراب ولا باغة جوه الراك أو عليه.',
  guardsCodes: ['SPARE_LEFT_IN_RACK', 'PACKAGING_OR_DEBRIS_LEFT', 'DUST_OR_DIRT', 'MARKER_OR_STAIN_MARKS'],
  sidRef: 'Cleaning: Is there any extra material remaining on the site?',
};

const CORD_DRESSING: Omit<AcceptanceCriterion, 'id'> = {
  textEn: 'Patch cords bundled with velcro at equal spacing, single path, no crossing, no excess loops, not taut, wide bends.',
  textAr: 'البشات متجمعة باسكوتش على مسافات متساوية، في مسار واحد، من غير كروس ولا أطوال زيادة ولا شد، والكرفة واسعة.',
  guardsCodes: [
    'PATCH_CORD_NOT_BUNDLED',
    'PATCH_CORD_MULTIPLE_PATHS',
    'PATCH_CORD_CROSSING',
    'PATCH_CORD_EXCESS_LENGTH',
    'PATCH_CORD_UNDER_TENSION',
    'FIBER_BEND_RADIUS_TOO_TIGHT',
    'PATCH_CORD_ROUTING_UNTIDY',
  ],
  sidRef: 'Cabling: Fiber Patch Cords bundled by scotch ... equal space between ties (15 cm / 25 cm)',
};

const ODF_CLEAN: Omit<AcceptanceCriterion, 'id'> = {
  textEn: 'No spare cords, pigtails or adapters stored inside the ODF; unused couplers capped.',
  textAr: 'مفيش اسبير جوه الاو دي اف، والكابلرات الفاضية عليها غطا.',
  guardsCodes: ['SPARE_LEFT_IN_ODF', 'DUST_CAP_MISSING'],
  sidRef: 'Cabling: Are unused ports of ODFs / Patch cords covered using protective caps?',
};

const LABELS_OK = (what: string, whatAr: string): Omit<AcceptanceCriterion, 'id'> => ({
  textEn: `Every ${what} has a printed, intact, correctly placed label with From/To information.`,
  textAr: `كل ${whatAr} عليه ليبول مطبوع وسليم وفي مكانه وفيه From / To.`,
  guardsCodes: ['LABEL_MISSING', 'LABEL_DAMAGED', 'LABEL_MISPLACED', 'LABEL_INFO_INCOMPLETE'],
  sidRef: 'Labeling: Ensure Label have sufficient Info (From, TO, Circuit ID, Power Type, Power Level)',
});

const DUCT_OK: Omit<AcceptanceCriterion, 'id'> = {
  textEn: 'Duct is complete along the route, closed (including at drops), straight and undamaged.',
  textAr: 'الداكت مكمل في المسار كله ومقفول (حتى عند النزلات) ومستقيم ومش مكسور.',
  guardsCodes: ['DUCT_SECTION_MISSING', 'DUCT_COVER_OPEN', 'DUCT_TILTED', 'DUCT_BROKEN'],
  sidRef: 'Facility: Basket Tray above racks with closed duct for organizing patch cords',
};

const TRAY_OK: Omit<AcceptanceCriterion, 'id'> = {
  textEn: 'Tray/ladder level, aligned and supported; cable openings protected by rubber glands.',
  textAr: 'التراي والسلم على مستوى واحد ومتظبطين ومتعلقين بدعامات، والفتحات عليها رابر جلاد.',
  guardsCodes: ['CABLE_TRAY_MISALIGNED', 'CABLE_TRAY_SUPPORT_MISSING', 'RUBBER_GLAND_MISSING'],
  sidRef: 'Facility: Cable ladders or trays under raised floor to organize cables and isolate it away from the ground',
};

const POWER_DRESS: Omit<AcceptanceCriterion, 'id'> = {
  textEn: 'Power/earth cables bundled with tie-wraps on their own side, separated from data, insulation undamaged.',
  textAr: 'كابلات الباور والأرضي متربطة تاي راب في جنب لوحدها بعيد عن الداتا والعزل سليم.',
  guardsCodes: ['POWER_CABLE_ROUTING_UNTIDY', 'POWER_CABLE_DAMAGED'],
  sidRef: 'Cabling: Are Power cables bundled well using tie wraps ... (30 cm at least between power and UTP cables)',
};

export const CHECKLISTS: readonly CategoryChecklist[] = [
  checklist('RACK', {
    category: 'rack',
    titleEn: 'Rack (active & passive)',
    titleAr: 'الراك (الأكتيف والباسيف)',
    purposeEn: 'Overview of the installed active (router) and passive (ODF) racks showing layout, cleanliness and doors.',
    folderAliases: ['Rack'],
    requiredShots: [
      { id: 'front_open', descriptionEn: 'Front of active and passive racks with doors open, full height in frame.', descriptionAr: 'وش الراك الأكتيف والباسيف والأبواب مفتوحة والراك كله باين من فوق لتحت.' },
      { id: 'front_closed', descriptionEn: 'Racks with all doors closed, including the floor line.', descriptionAr: 'الراكات والأبواب كلها مقفولة ومعاها خط الأرضية.' },
    ],
    criteria: [
      { id: 'RACK-01', ...CLEAN_RACK },
      { id: 'RACK-02', textEn: 'Doors not being photographed are closed and latched; closed-rack shot has all doors closed.', textAr: 'الأبواب اللي مش بنصور جواها مقفولة صح، وصورة الراك المقفول كل أبوابها مقفولة.', guardsCodes: ['RACK_DOOR_NOT_CLOSED'], sidRef: 'Security: Is the Hall / Racks well secured?' },
      { id: 'RACK-03', textEn: 'Rack aligned with the row and flush with the floor; no open tile or gap around it.', textAr: 'الراك على استقامة الصف ولازق في البلاط ومفيش فتحة ولا مسافة حواليه.', guardsCodes: ['RACK_MISALIGNED', 'RACK_FLOOR_GAP', 'FLOOR_OPENING_NOT_SEALED'], sidRef: 'Racks: Cabins are aligned with one edge along with the edge of the floor tile?' },
      { id: 'RACK-04', textEn: 'Rack, router and ODFs carry their hostname/name labels; ODF sheet posted on the door.', textAr: 'الراك والراوتر والاو دي اف عليهم ليبول الاسم، وشيت الاو دي اف متعلق على الباب.', guardsCodes: ['HOSTNAME_LABEL_MISSING', 'ODF_SHEET_MISSING_OR_UNREADABLE'], sidRef: 'Labeling: Are all Devices / Passive elements (Racks, ODFs, PDUs, ...) labelled with the agreed format?' },
      { id: 'RACK-05', textEn: 'No loose power plug or cord hanging in the rack; cable entries protected.', textAr: 'مفيش فيشة أو سلك باور مدلدل في الراك، وفتحات دخول الكابلات محمية.', guardsCodes: ['POWER_PLUG_EXPOSED', 'RUBBER_GLAND_MISSING'] },
      { id: 'RACK-06', ...CORD_DRESSING, textEn: 'Patch cords visible in the overview are dressed neatly in the vertical organisers.', textAr: 'البشات اللي باينة في الصورة متسستمة كويس في المنظمات الرأسية.' },
    ],
    goodExampleNotes: [
      'Two black perforated racks side by side: active rack with the ASR chassis mid-height, passive rack with two COMtec ODFs at the top.',
      'Rack floor clean and empty; nothing stored on the rack floor or on top of the router.',
      'Yellow patch cords run down one vertical organiser (side) of the active rack with black velcro straps.',
      'Rack name strip on the top front; ODF sheets in plastic sleeves taped on the inside of the door.',
      'Overhead: patch cords go up through white waterfall guides into the basket tray, bundled with velcro.',
    ],
  }),

  checklist('BASE', {
    category: 'rack_base',
    titleEn: 'Rack base (raised-floor frame)',
    titleAr: 'قاعدة الراك',
    purposeEn: 'Metal base frame installed in the raised floor before the rack is placed.',
    folderAliases: ['Rack Base', 'BASE'],
    requiredShots: [
      { id: 'top_view', descriptionEn: 'Top view of the whole base frame with all legs and their bolts visible.', descriptionAr: 'صورة من فوق للقاعدة كلها وكل الرجول ومساميرها باينة.' },
      { id: 'level', descriptionEn: 'Spirit level placed on the frame showing the bubble.', descriptionAr: 'الميزان على القاعدة والفقاعة باينة.' },
    ],
    criteria: [
      { id: 'BASE-01', textEn: 'Every leg fixed with 8 bolts; floor anchors present.', textAr: 'كل رجل متربطة بـ 8 مسامير والخوابير في الأرض موجودة.', guardsCodes: ['RACK_BASE_BOLTS_MISSING'], sidRef: 'Facility: Racks fixed well on a suitable stable metal base fixed by Akmons' },
      { id: 'BASE-02', textEn: 'Base level and flush with the tile level; tiles cut tight around the frame.', textAr: 'القاعدة على الميزان وفي مستوى البلاط، والبلاط مقصوص مظبوط حواليها.', guardsCodes: ['RACK_BASE_NOT_LEVEL', 'RACK_FLOOR_GAP', 'FLOOR_OPENING_NOT_SEALED'], sidRef: 'Facility: ... (10 cm height maximum in Concrete floor or in the same level of raised floor)' },
      { id: 'BASE-03', textEn: 'Under-floor area around the base clean of debris and cardboard.', textAr: 'تحت البلاط حوالين القاعدة نضيف من المخلفات والكرتون.', guardsCodes: ['PACKAGING_OR_DEBRIS_LEFT', 'DUST_OR_DIRT'] },
      { id: 'BASE-04', textEn: 'Under-floor ladder next to the base aligned and level.', textAr: 'السلم اللي تحت البلاط جنب القاعدة مظبوط ومستوي.', guardsCodes: ['CABLE_TRAY_MISALIGNED'] },
    ],
    goodExampleNotes: [
      'Black welded rectangular frame(s) sitting in the opened raised floor, one frame per rack.',
      'Four adjustable leg brackets per frame, each with its full set of bolts and floor anchor plates.',
      'Orange spirit level placed across the frame with the bubble centred.',
    ],
  }),

  checklist('ROUTER', {
    category: 'router',
    titleEn: 'Router (front view)',
    titleAr: 'الراوتر',
    purposeEn: 'Front of the ASR-9902/9906 or NCS-57C3 chassis showing cards, hostname label and cord dressing at the chassis.',
    folderAliases: ['Router'],
    requiredShots: [
      { id: 'front', descriptionEn: 'Full chassis front, square-on, all cards and the hostname label readable.', descriptionAr: 'وش الشاسيه كله من قدام، والكروت وليبول الهوست نيم مقروءين.' },
    ],
    criteria: [
      { id: 'ROUTER-01', textEn: 'Hostname label present in the agreed position.', textAr: 'ليبول الهوست نيم موجود في مكانه.', guardsCodes: ['HOSTNAME_LABEL_MISSING', 'LABEL_MISPLACED'], sidRef: 'Labeling: Are all Devices ... labelled with the agreed format?' },
      { id: 'ROUTER-02', ...CORD_DRESSING, textEn: 'Cords leave the line cards in velcro-bundled groups through the cable guide to one side.', textAr: 'البشات طالعة من الكروت في حزم متربطة اسكوتش ماشية في الجايد لجنب واحد.' },
      { id: 'ROUTER-03', textEn: 'Every cord at the router carries a label; unused optical ports capped.', textAr: 'كل باتش على الراوتر عليه ليبول، والبورتات الفاضية عليها غطا.', guardsCodes: ['LABEL_MISSING', 'DUST_CAP_MISSING'] },
      { id: 'ROUTER-04', textEn: 'Nothing stored in front of or on the router; management cable dressed.', textAr: 'مفيش حاجة متسابة قدام الراوتر أو عليه، وكابل المانجمنت متسستم.', guardsCodes: ['SPARE_LEFT_IN_RACK', 'MANAGEMENT_CABLE_UNTIDY', 'DUST_OR_DIRT'] },
    ],
    goodExampleNotes: [
      'ASR-9906: fan trays on the left, RSPs and line cards in the middle, Cisco logo panel on the right with the hostname strip (e.g. HNOVIL1-R21C-ALX-EG).',
      'Two thick yellow bundles leave the line cards upward, strapped with black velcro every ~15 cm, into the top cable guide.',
      'White flag labels on every cord near the connectors, read the same direction.',
    ],
  }),

  checklist('PATCH', {
    category: 'patch_cords',
    titleEn: 'Patch cord path (السستمه)',
    titleAr: 'مسار وسستمة البشات',
    purposeEn: 'Patch cord route between router and ODFs over the basket tray / ducts above the racks.',
    folderAliases: ['Patch Cords'],
    requiredShots: [
      { id: 'tray_run', descriptionEn: 'The bundle along the basket tray above the racks.', descriptionAr: 'حزمة البشات ماشية على الباسكت تراي فوق الراكات.' },
      { id: 'drops', descriptionEn: 'Each drop from the tray into the active and passive rack (waterfall).', descriptionAr: 'كل نزلة من التراي للراك الأكتيف والباسيف (الووترفول).' },
    ],
    criteria: [
      { id: 'PATCH-01', ...CORD_DRESSING },
      { id: 'PATCH-02', textEn: 'Patch cords of the router bundled into one duct between active and passive racks; duct closed at drops.', textAr: 'بشات الراوتر في داكت واحد بين الأكتيف والباسيف والداكت مقفول عند النزلات.', guardsCodes: ['DUCT_COVER_OPEN', 'DUCT_SECTION_MISSING'], sidRef: 'Cabling: Are Fiber patch cords of every Router are bundled into one duct between active and passive racks above the ladder?' },
      { id: 'PATCH-03', textEn: 'Management/UTP cable kept separate from the fiber bundle.', textAr: 'كابل المانجمنت بعيد عن حزمة الفايبر.', guardsCodes: ['MANAGEMENT_CABLE_UNTIDY'] },
    ],
    goodExampleNotes: [
      'Thick yellow bundles on a white basket tray with black velcro at regular spacing; branches leave the main bundle in smooth curves.',
      'Drops into racks go over white plastic waterfall guides, never over sharp metal edges.',
      'No loose single cords, no loops hanging off the tray.',
    ],
  }),

  checklist('ARMD', {
    category: 'armoured_cables',
    titleEn: 'Armoured fibre cable path',
    titleAr: 'مسار كابل الارمود',
    purposeEn: 'Route of the armoured fibre cable(s) between the ODF tie and the test room / other floors.',
    folderAliases: ['Aromourd Cables', 'ARMOUD PATH'],
    requiredShots: [
      { id: 'path', descriptionEn: 'Successive shots following the armoured cable along trays/ducts from rack to destination.', descriptionAr: 'صور متتالية ماشية مع الارمود على التراي والداكت من الراك لحد آخره.' },
      { id: 'odf_spare', descriptionEn: 'Armoured cable spare (~2 m) at the ODF end.', descriptionAr: 'الاسبير بتاع الارمود (حوالي 2 متر) عند الاو دي اف.' },
    ],
    criteria: [
      { id: 'ARMD-01', textEn: 'Armoured cable dressed and tied along its path; spare coiled neatly.', textAr: 'الارمود متسستم ومتربط في مساره والاسبير ملفوف بشكل منظم.', guardsCodes: ['ARMOURED_CABLE_ROUTING_UNTIDY'], sidRef: 'Cabling: 2 m spare at least of armored cables at every ODF.' },
      { id: 'ARMD-02', textEn: 'No sharp bends at drops and tray transitions.', textAr: 'مفيش ثنيات حادة عند النزلات وتغيير التراي.', guardsCodes: ['FIBER_BEND_RADIUS_TOO_TIGHT'] },
      { id: 'ARMD-03', ...DUCT_OK },
      { id: 'ARMD-04', ...TRAY_OK },
      { id: 'ARMD-05', textEn: 'Wall/floor penetrations sealed.', textAr: 'فتحات الحيطة والبلاط مقفولة.', guardsCodes: ['WALL_OPENING_NOT_SEALED', 'FLOOR_OPENING_NOT_SEALED'], sidRef: 'Ventilation: Are all access holes from / to current room are cleared and filled by foam?' },
    ],
    goodExampleNotes: [
      'Armoured fibre cable runs inside a closed white duct or along the tray, tied, following the duct curves.',
      'Transitions between trays use bend fittings / waterfalls; no cable outside the duct.',
    ],
  }),

  checklist('DUCT', {
    category: 'duct',
    titleEn: 'Duct (with cover)',
    titleAr: 'الداكت',
    purposeEn: 'Plastic fiber duct over the racks, shown closed with its cover.',
    folderAliases: ['Duct'],
    requiredShots: [
      { id: 'run', descriptionEn: 'Duct run with covers closed, including every drop into racks.', descriptionAr: 'الداكت بالغطا مقفول ومعاه كل النزلات على الراكات.' },
    ],
    criteria: [
      { id: 'DUCT-01', ...DUCT_OK },
      { id: 'DUCT-02', ...TRAY_OK },
      { id: 'DUCT-03', textEn: 'Duct clean, no marker marks or debris on top.', textAr: 'الداكت نضيف ومفيش عليه باغة أو مخلفات.', guardsCodes: ['DUST_OR_DIRT', 'MARKER_OR_STAIN_MARKS', 'PACKAGING_OR_DEBRIS_LEFT'] },
    ],
    goodExampleNotes: [
      'White plastic duct runs straight along the basket tray, covers clipped on over the whole length.',
      'Drops into racks closed with cover pieces down to the rack top.',
    ],
  }),

  checklist('MGMT', {
    category: 'management',
    titleEn: 'Management cable path',
    titleAr: 'مسار كابل المانجمنت',
    purposeEn: 'UTP management cable from the router MGMT port to the management switch.',
    folderAliases: ['Managment', 'management'],
    requiredShots: [
      { id: 'path', descriptionEn: 'Successive shots of the management cable from router to switch.', descriptionAr: 'صور متتالية لكابل المانجمنت من الراوتر للسويتش.' },
    ],
    criteria: [
      { id: 'MGMT-01', textEn: 'Management cable follows the tray/organiser, tied, not draped over fiber.', textAr: 'كابل المانجمنت ماشي في التراي والمنظم ومتربط ومش معدي على الفايبر.', guardsCodes: ['MANAGEMENT_CABLE_UNTIDY'], sidRef: 'Cabling: Are UTP cables bundled well using tie wraps and organized in cable organizer?' },
      { id: 'MGMT-02', textEn: 'Labelled at both ends.', textAr: 'عليه ليبول من الطرفين.', guardsCodes: ['LABEL_MISSING'] },
      { id: 'MGMT-03', ...DUCT_OK },
    ],
    goodExampleNotes: [
      'Single grey/blue UTP cable tied along the side of the tray or inside the duct, separate from the yellow bundles.',
    ],
  }),

  checklist('ODFCC', {
    category: 'odf_cross_connect',
    titleEn: 'ODF cross-connect',
    titleAr: 'الاو دي اف كروس كونكت',
    purposeEn: 'Front of the cross-connect ODF in the passive rack showing ports, cords and ODF name.',
    folderAliases: ['ODF Cross Connect'],
    requiredShots: [
      { id: 'front_open', descriptionEn: 'ODF front with the door/window open, all ports visible.', descriptionAr: 'وش الاو دي اف مفتوح وكل البورتات باينة.' },
      { id: 'front_closed', descriptionEn: 'ODF closed with its name label readable.', descriptionAr: 'الاو دي اف مقفول وليبول اسمه مقروء.' },
    ],
    criteria: [
      { id: 'ODFCC-01', ...ODF_CLEAN },
      { id: 'ODFCC-02', ...CORD_DRESSING, textEn: 'Cords enter the ODF from one side through the organiser, bundled, without crossing.', textAr: 'البشات داخلة الاو دي اف من جنب واحد من المنظم ومتجمعة ومن غير كروس.' },
      { id: 'ODFCC-03', textEn: 'ODF name label present; ODF window clean.', textAr: 'ليبول اسم الاو دي اف موجود والشباك نضيف.', guardsCodes: ['HOSTNAME_LABEL_MISSING', 'MARKER_OR_STAIN_MARKS', 'DUST_OR_DIRT'] },
    ],
    goodExampleNotes: [
      'COMtec 4U ODF with printed name strip (e.g. AQALTA-R02C-LX-EG-ODF1 CC).',
      'Green SC adapters in rows A..L; unused adapters all capped; nothing lying at the bottom of the tray.',
    ],
  }),

  checklist('ODFCCL', {
    category: 'odf_cross_connect_labels',
    titleEn: 'ODF cross-connect labels',
    titleAr: 'ليبولات الاو دي اف كروس كونكت',
    purposeEn: 'Close-ups of patch cord labels at the cross-connect ODF.',
    folderAliases: ['Labels Cross Connect', 'Labels ODF Cross Connect'],
    requiredShots: [
      { id: 'closeups', descriptionEn: 'Readable close-ups of the labels, a few cords per photo (a hand may hold the label flat).', descriptionAr: 'صور قريبة للليبولات مقروءة، كام باتش في كل صورة (ممكن إيد تمسك الليبول).' },
    ],
    criteria: [
      { id: 'ODFCCL-01', ...LABELS_OK('cross-connect patch cord', 'باتش كروس كونكت') },
      { id: 'ODFCCL-02', textEn: 'Adapters visible in the background capped; no spares in ODF.', textAr: 'الكابلرات اللي باينة عليها غطا ومفيش اسبير في الاو دي اف.', guardsCodes: ['DUST_CAP_MISSING', 'SPARE_LEFT_IN_ODF'] },
    ],
    goodExampleNotes: [
      'White printed flag labels, e.g. "R21C-Te0/1/0/36" on one side and "ODF4-MMR G7,8" on the other, text fully readable.',
      'A hand holding the label for readability is acceptable; no face or body in frame.',
    ],
  }),

  checklist('ODFTIE', {
    category: 'odf_tie',
    titleEn: 'ODF tie',
    titleAr: 'الاو دي اف تاي',
    purposeEn: 'Front of the tie ODF that connects to the armoured cable / test room.',
    folderAliases: ['ODF Tie'],
    requiredShots: [
      { id: 'front_open', descriptionEn: 'ODF tie front open with ports and incoming armoured cable visible.', descriptionAr: 'وش الاو دي اف تاي مفتوح والبورتات والارمود الداخل باين.' },
    ],
    criteria: [
      { id: 'ODFTIE-01', ...ODF_CLEAN },
      { id: 'ODFTIE-02', ...CORD_DRESSING },
      { id: 'ODFTIE-03', textEn: 'Armoured cable entry dressed with its spare; ODF name label present.', textAr: 'دخول الارمود متسستم والاسبير بتاعه منظم، وليبول اسم الاو دي اف موجود.', guardsCodes: ['ARMOURED_CABLE_ROUTING_UNTIDY', 'HOSTNAME_LABEL_MISSING'] },
    ],
    goodExampleNotes: ['Same layout as the cross-connect ODF; armoured cable enters from the rear/side, capped unused adapters.'],
  }),

  checklist('ODFTIEL', {
    category: 'odf_tie_labels',
    titleEn: 'ODF tie labels',
    titleAr: 'ليبولات الاو دي اف تاي',
    purposeEn: 'Close-ups of the labels at the tie ODF.',
    folderAliases: ['Labels ODF Tie'],
    requiredShots: [
      { id: 'closeups', descriptionEn: 'Readable label close-ups for the tie cords.', descriptionAr: 'صور قريبة مقروءة لليبولات باتشات التاي.' },
    ],
    criteria: [
      { id: 'ODFTIEL-01', ...LABELS_OK('tie patch cord', 'باتش تاي') },
      { id: 'ODFTIEL-02', textEn: 'Adapters visible in the background capped; no spares in ODF.', textAr: 'الكابلرات اللي باينة عليها غطا ومفيش اسبير في الاو دي اف.', guardsCodes: ['DUST_CAP_MISSING', 'SPARE_LEFT_IN_ODF'] },
    ],
    goodExampleNotes: ['Printed labels like "ODF(1)F(7,8) / ODF(2)A(7,8)" readable in the photo.'],
  }),

  checklist('SHEET', {
    category: 'odf_sheet',
    titleEn: 'ODF utilization sheet',
    titleAr: 'شيت الاو دي اف',
    purposeEn: 'Printed port utilization sheet posted on the rack door.',
    folderAliases: ['Sheet ODF'],
    requiredShots: [
      { id: 'sheet', descriptionEn: 'Each sheet photographed straight-on, fully in frame and readable.', descriptionAr: 'كل شيت متصور من قدام كامل ومقروء.' },
    ],
    criteria: [
      { id: 'SHEET-01', textEn: 'Sheet posted in a plastic sleeve, printed, complete and readable.', textAr: 'الشيت متعلق في جراب، مطبوع وكامل ومقروء.', guardsCodes: ['ODF_SHEET_MISSING_OR_UNREADABLE'], sidRef: 'Labeling: Are port utilization sheets of ODFs available on active and passive racks?' },
    ],
    goodExampleNotes: [
      'Printed table titled with the router hostname and slot, columns FROM R21C / TO ODF CC / TO ODF TIE / UPLINK, inside a clear punched sleeve.',
    ],
  }),

  checklist('UPL', {
    category: 'uplink',
    titleEn: 'Uplink path',
    titleAr: 'مسار الأب لينك',
    purposeEn: 'Route of the uplink fibers from this router to the upstream router(s).',
    folderAliases: ['uplink', 'Up Links'],
    requiredShots: [
      { id: 'path', descriptionEn: 'Successive shots of the uplink route over trays to the far end.', descriptionAr: 'صور متتالية لمسار الأب لينك على التراي لحد الطرف التاني.' },
    ],
    criteria: [
      { id: 'UPL-01', ...CORD_DRESSING },
      { id: 'UPL-02', ...DUCT_OK },
      { id: 'UPL-03', ...TRAY_OK },
      { id: 'UPL-04', textEn: 'Uplink cables marked and recognisable along the path.', textAr: 'كابلات الأب لينك متعلمة وتتعرف على طول المسار.', guardsCodes: ['LABEL_MISSING'], sidRef: 'Cabling: Are the uplink cables marked and easy recognized all over its path?' },
    ],
    goodExampleNotes: ['Uplink cords follow the patch cord bundle in the tray/duct and carry labels at both ends.'],
  }),

  checklist('UPLL', {
    category: 'uplink_labels',
    titleEn: 'Uplink labels',
    titleAr: 'ليبولات الأب لينك',
    purposeEn: 'Close-ups of the uplink cord labels.',
    folderAliases: ['Uplink Lables'],
    requiredShots: [
      { id: 'closeups', descriptionEn: 'Readable label close-ups of every uplink cord.', descriptionAr: 'صور قريبة مقروءة لليبول كل أب لينك.' },
    ],
    criteria: [
      { id: 'UPLL-01', ...LABELS_OK('uplink cord', 'أب لينك'), sidRef: 'Labeling: Labels for Signal Cables different of labels for Power Cables and Uplink cables.' },
    ],
    goodExampleNotes: ['Two-line printed label: local hostname + port and remote hostname + port, e.g. "NASR3-R21C-C-EG Te0/0/0/.. / NASR2-R30C-C-EG Te0/2/0/..".'],
  }),

  checklist('PDU', {
    category: 'pdu',
    titleEn: 'PDU',
    titleAr: 'الـ PDU',
    purposeEn: 'Rack PDU front (with cover) showing breakers, labels and fixing.',
    folderAliases: ['PDU'],
    requiredShots: [
      { id: 'front', descriptionEn: 'PDU front square-on with all breakers, label slots and screws visible.', descriptionAr: 'وش الـ PDU من قدام وكل البريكرات وأماكن الليبولات والمسامير باينة.' },
    ],
    criteria: [
      { id: 'PDU-01', textEn: 'All PDU mounting screws fitted.', textAr: 'كل مسامير تثبيت الـ PDU موجودة.', guardsCodes: ['PDU_SCREW_MISSING'] },
      { id: 'PDU-02', textEn: 'PDU and its breakers labelled.', textAr: 'الـ PDU والبريكرات عليها ليبولات.', guardsCodes: ['LABEL_MISSING', 'LABEL_INFO_INCOMPLETE', 'HOSTNAME_LABEL_MISSING'], sidRef: 'Labeling: Are all Devices / Passive elements (Racks, ODFs, PDUs, ...) labelled' },
      { id: 'PDU-03', textEn: 'No loose plug/cord; input cables dressed on the side.', textAr: 'مفيش فيشة سايبة، وكابلات الدخول متسستمة على الجنب.', guardsCodes: ['POWER_PLUG_EXPOSED', 'POWER_CABLE_ROUTING_UNTIDY'] },
    ],
    goodExampleNotes: [
      'Eaton rack PDU with Section A / Section B feed isolators and load MCBs, load monitors lit.',
      'Blue input cables run down both rack sides tied with white tie-wraps.',
      'Note: approved example shows blank MCB label slots; whether these must be filled is a reviewer decision.',
    ],
  }),

  checklist('PWRP', {
    category: 'power_path',
    titleEn: 'Power cable path',
    titleAr: 'مسار كابلات الباور',
    purposeEn: 'Route of the DC/AC power cables from the power distribution panel to the rack.',
    folderAliases: ['Power Path'],
    requiredShots: [
      { id: 'source', descriptionEn: 'Termination at the distribution panel / fuse bar.', descriptionAr: 'نهاية الكابلات عند لوحة التوزيع أو بارة الفيوزات.' },
      { id: 'path', descriptionEn: 'Successive shots along ladders/under floor to the rack.', descriptionAr: 'صور متتالية على السلم وتحت البلاط لحد الراك.' },
    ],
    criteria: [
      { id: 'PWRP-01', ...POWER_DRESS },
      { id: 'PWRP-02', textEn: 'Busbar/fuse terminations neat; no wrong or extra drilling.', textAr: 'التوصيلات على البارة والفيوزات مظبوطة ومفيش تخريم غلط.', guardsCodes: ['BUSBAR_WRONG_DRILLING'] },
      { id: 'PWRP-03', ...TRAY_OK },
      { id: 'PWRP-04', textEn: 'Wall and floor openings closed/sealed.', textAr: 'فتحات الحيطة والبلاط مقفولة.', guardsCodes: ['WALL_OPENING_NOT_SEALED', 'FLOOR_OPENING_NOT_SEALED'] },
    ],
    goodExampleNotes: [
      'Blue (and black) power cables leave the distribution box together, tied with white tie-wraps to each ladder rung, then drop through a cut tile.',
      'Ladder rungs level and evenly spaced.',
    ],
  }),

  checklist('EARTH', {
    category: 'earth_path',
    titleEn: 'Earth cable path',
    titleAr: 'مسار كابل الأرضي',
    purposeEn: 'Earth (yellow-green) cable route from rack/PDU to the earth bar.',
    folderAliases: ['Earth path', 'Earth Path'],
    requiredShots: [
      { id: 'rack_end', descriptionEn: 'Earth connection on the rack/PDU with its label.', descriptionAr: 'توصيلة الأرضي على الراك أو الـ PDU والليبول بتاعها.' },
      { id: 'path', descriptionEn: 'Route along the ladder to the earth bar and the bar termination.', descriptionAr: 'المسار على السلم لحد بارة الأرضي والتوصيلة عليها.' },
    ],
    criteria: [
      { id: 'EARTH-01', ...POWER_DRESS },
      { id: 'EARTH-02', textEn: 'Earth bar termination neat; no wrong drilling.', textAr: 'التوصيلة على بارة الأرضي مظبوطة ومفيش تخريم غلط.', guardsCodes: ['BUSBAR_WRONG_DRILLING'] },
      { id: 'EARTH-03', textEn: 'Earth cable labelled at the rack end.', textAr: 'كابل الأرضي عليه ليبول عند الراك.', guardsCodes: ['LABEL_MISSING'] },
      { id: 'EARTH-04', ...TRAY_OK },
    ],
    goodExampleNotes: ['Yellow-green earth conductor runs tied alongside the power cables on the under-floor ladder, lug bolted on the rack earth point with a label.'],
  }),

  checklist('PWRL', {
    category: 'power_labels',
    titleEn: 'Power cable labels',
    titleAr: 'ليبولات كابلات الباور',
    purposeEn: 'Close-ups of the labels on power and earth cables at both ends.',
    folderAliases: ['Lables'],
    requiredShots: [
      { id: 'closeups', descriptionEn: 'Readable close-ups of every power/earth cable label.', descriptionAr: 'صور قريبة مقروءة لليبول كل كابل باور وأرضي.' },
    ],
    criteria: [
      { id: 'PWRL-01', ...LABELS_OK('power/earth cable', 'كابل باور أو أرضي'), sidRef: 'Labeling: Ensure Label have sufficient Info (From, TO, Circuit ID, Power Type, Power Level)' },
      { id: 'PWRL-02', textEn: 'Cable insulation undamaged near the label.', textAr: 'عزل الكابل سليم جنب الليبول.', guardsCodes: ['POWER_CABLE_DAMAGED'] },
    ],
    goodExampleNotes: ['Printed wrap-around labels on blue/black power cables stating source feed and destination.'],
  }),

  checklist('PWRS', {
    category: 'power_system',
    titleEn: 'Power cable dressing (system)',
    titleAr: 'سستمة كابلات الباور',
    purposeEn: 'Dressing of power cables at the rack top/sides and into the PDU.',
    folderAliases: ['saystem'],
    requiredShots: [
      { id: 'entry', descriptionEn: 'Power cables dropping from the ladder into the rack top.', descriptionAr: 'كابلات الباور نازلة من السلم لسقف الراك.' },
      { id: 'inside', descriptionEn: 'Power cables along the rack side to the PDU.', descriptionAr: 'كابلات الباور ماشية على جنب الراك لحد الـ PDU.' },
    ],
    criteria: [
      { id: 'PWRS-01', ...POWER_DRESS },
      { id: 'PWRS-02', textEn: 'Rack-top cable entry protected; no loose plugs.', textAr: 'دخول الكابلات من سقف الراك محمي ومفيش فيش سايبة.', guardsCodes: ['RUBBER_GLAND_MISSING', 'POWER_PLUG_EXPOSED'] },
      { id: 'PWRS-03', ...TRAY_OK },
    ],
    goodExampleNotes: ['Blue power cables come down the ladder upright, tied with white tie-wraps, entering the rack top through the cable entry without crossing.'],
  }),

  checklist('TEST', {
    category: 'test_room',
    titleEn: 'ODF tie in test room',
    titleAr: 'الاو دي اف تاي في غرفة التست',
    purposeEn: 'Far end of the tie ODF in the test room.',
    folderAliases: ['Test Room'],
    requiredShots: [
      { id: 'front', descriptionEn: 'Test-room ODF front with ports visible and its name label.', descriptionAr: 'وش الاو دي اف في غرفة التست والبورتات وليبول الاسم باينين.' },
    ],
    criteria: [
      { id: 'TEST-01', ...ODF_CLEAN },
      { id: 'TEST-02', textEn: 'ODF labelled; armoured cable entry dressed.', textAr: 'الاو دي اف عليه ليبول ودخول الارمود متسستم.', guardsCodes: ['HOSTNAME_LABEL_MISSING', 'ARMOURED_CABLE_ROUTING_UNTIDY'] },
      { id: 'TEST-03', textEn: 'Cords at the test-room ODF dressed.', textAr: 'البشات عند الاو دي اف متسستمة.', guardsCodes: ['PATCH_CORD_ROUTING_UNTIDY', 'PATCH_CORD_EXCESS_LENGTH'] },
    ],
    goodExampleNotes: ['Rows of green SC adapters all with dust caps, cable-management rings below, nothing loose in the tray.'],
  }),
];

const byCategory = new Map(CHECKLISTS.map((c) => [c.category, c] as const));

export function getChecklist(category: PhotoCategory): CategoryChecklist {
  const c = byCategory.get(category);
  if (!c) throw new Error(`No checklist for category ${category}`);
  return c;
}
