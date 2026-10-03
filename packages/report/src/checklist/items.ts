import type { PhotoCategory } from '@acceptance/shared';

/**
 * The 58 items of the SID "Acceptance check list" (transcribed in docs/sid-checklist-ocr-plan.md),
 * with how each one is decided:
 * - `photo`: from approved/rejected photos and snags of `categories` (empty = every category),
 *   restricted to `codes` (empty = any snag code of those categories).
 * - `derived`: computed from site technical data (fiber tests, ODF utilization, inventory).
 * - `survey`: needs a manual answer (site survey / measurement); otherwise "N/A – manual".
 */
export type DerivedRule = 'fiber_loss' | 'odf_spare' | 'power_redundancy' | 'control_redundancy' | 'hw_list_match';

export type SidItem =
  | { id: string; section: string; text: string; kind: 'photo'; categories: PhotoCategory[]; codes: string[] }
  | { id: string; section: string; text: string; kind: 'derived'; rule: DerivedRule }
  | { id: string; section: string; text: string; kind: 'survey' };

const photo = (id: string, section: string, text: string, categories: PhotoCategory[], codes: string[] = []): SidItem => ({ id, section, text, kind: 'photo', categories, codes });
const survey = (id: string, section: string, text: string): SidItem => ({ id, section, text, kind: 'survey' });
const derived = (id: string, section: string, text: string, rule: DerivedRule): SidItem => ({ id, section, text, kind: 'derived', rule });

const SEC = 'Security';
const CLN = 'Environmental – Cleaning';
const VEN = 'Environmental – POP Ventilation & Lighting';
const SPC = 'Spacing';
const FAC = 'Physical Installation – Facility';
const RCK = 'Racks / Cabinets Mounting & installation';
const CAB = 'Cabling';
const LAB = 'Labeling';
const HW = 'Hardware';

const ODF_CATS: PhotoCategory[] = ['odf_cross_connect', 'odf_tie'];
const LABEL_CATS: PhotoCategory[] = ['odf_cross_connect_labels', 'odf_tie_labels', 'uplink_labels', 'power_labels'];

export const SID_CHECKLIST: readonly SidItem[] = [
  photo('S1', SEC, 'Is the Hall / Racks well secured? The door of the room locked well?', ['rack'], ['RACK_DOOR_NOT_CLOSED']),
  survey('S2', SEC, 'Does we have any Fire / Smoke / Water Leak Detection systems and fire extinguishers? If found, specify the number and status'),

  photo('E1', CLN, 'Specify cleaning status of the room; ensure that routine maintenance occurred on the room after installation', [], ['DUST_OR_DIRT', 'MARKER_OR_STAIN_MARKS']),
  photo('E2', CLN, 'Is there any extra material remaining on the site?', [], ['SPARE_LEFT_IN_RACK', 'SPARE_LEFT_IN_ODF', 'PACKAGING_OR_DEBRIS_LEFT']),

  survey('V1', VEN, 'Is there A/C found? specify No# and status'),
  survey('V2', VEN, 'Type of A/Cs (Free stand – Split – Closed control)'),
  survey('V3', VEN, 'The installed A/Cs equivalent to the thermal loads and heat dissipation?'),
  survey('V4', VEN, 'The temperature degree at the installation area?'),
  survey('V5', VEN, 'Is the temperature degree of the device accepted? Less than 45 degree for Routing Engines while the fans running in its normal speed'),
  survey('V6', VEN, 'Specify the lighting condition at the hall?'),
  photo('V7', VEN, 'Are all access holes from / to current room are cleared and filled by foam after finalizing installation?', ['armoured_cables', 'power_path'], ['WALL_OPENING_NOT_SEALED', 'FLOOR_OPENING_NOT_SEALED']),

  survey('P1', SPC, 'Is the selected space suitable with No# of Racks?'),
  survey('P2', SPC, 'Is there adequate clearance for O&M actions in front and behind of racks? (60 cm minimum)'),

  survey('F1', FAC, 'Type of the Floor (Raised Floor / Concrete)'),
  photo('F2', FAC, 'Are the used racks full perforated?', ['rack']),
  survey('F3', FAC, 'Are perforated tiles placed in front of each rack?'),
  photo('F4', FAC, 'Are there installed paths for all cables (Power, Data)?', ['duct', 'power_path', 'armoured_cables'], ['DUCT_SECTION_MISSING', 'CABLE_TRAY_SUPPORT_MISSING']),
  photo('F5', FAC, 'Cable ladders or trays under raised floor to organize cables and isolate it away from the ground', ['power_path', 'armoured_cables'], ['CABLE_TRAY_MISALIGNED', 'CABLE_TRAY_SUPPORT_MISSING', 'RUBBER_GLAND_MISSING']),
  photo('F6', FAC, 'Basket Tray above racks with closed duct for organizing patch cords', ['duct'], ['DUCT_COVER_OPEN', 'DUCT_SECTION_MISSING', 'DUCT_TILTED', 'DUCT_BROKEN']),
  photo('F7', FAC, 'Racks fixed well on a suitable stable metal base fixed by Akmons (10 cm height maximum in Concrete floor or in the same level of raised floor)', ['rack_base'], ['RACK_BASE_BOLTS_MISSING', 'RACK_BASE_NOT_LEVEL', 'RACK_FLOOR_GAP']),

  survey('R1', RCK, 'Plan layout (Single Cabinet / Row of Cabinets / Back to Back Cabinets)'),
  photo('R2', RCK, 'Racks or Cabinets installed according to Installation Standards', ['rack', 'rack_base']),
  survey('R3', RCK, 'Total No. of Rack / POP, does it match POP capacity?'),
  survey('R4', RCK, 'Racks or Cabinets arranged in alternating pattern?'),
  photo('R5', RCK, 'Cabins are aligned with one edge along with the edge of the floor tile?', ['rack'], ['RACK_MISALIGNED']),
  survey('R6', RCK, '42U Rack (60*100) for Core or Big Edge Devices or (60*80) for Edge devices with a suitable cable organizer'),
  survey('R7', RCK, 'Is there adequate clearance for O&M actions inside racks? (to leave 3 U between door of the rack and front of device)'),
  photo('R8', RCK, 'Are all Devices/ODFs are Rack mounted?', ['rack'], ['SPARE_LEFT_IN_RACK']),
  photo('R9', RCK, 'Devices/Equipment are mounted in rack from the front side', ['rack', 'router']),
  survey('R10', RCK, 'Total No. of Devices / Rack, does it match rack capacity? (The agreed design of rack utilization)'),

  photo('C1', CAB, 'Route the cables with different types separately, consider future maintenance and expansion in cables', ['power_path', 'management'], ['POWER_CABLE_ROUTING_UNTIDY', 'MANAGEMENT_CABLE_UNTIDY']),
  photo('C2', CAB, 'Are the uplink cables marked and easy recognized all over its path?', ['uplink', 'uplink_labels'], ['LABEL_MISSING']),
  photo('C3', CAB, 'Are Power cables bundled well using tie wraps and organized in the cable organizer from the left side of the device and separated in a side of the tray/ladder? (30 cm at least between power and UTP cables)', ['power_path', 'pdu'], ['POWER_CABLE_ROUTING_UNTIDY']),
  photo('C4', CAB, 'Are UTP cables bundled well using tie wraps and organized in cable organizer?', ['management'], ['MANAGEMENT_CABLE_UNTIDY']),
  photo('C5', CAB, 'Are Fiber Patch Cords bundled by scotch from right / left side of the Device / ODF and organized well on the rack organizer and above the basket trays?', ['patch_cords'], ['PATCH_CORD_NOT_BUNDLED', 'PATCH_CORD_MULTIPLE_PATHS']),
  photo('C6', CAB, 'Are Fiber Patch Cords of every PIC are bundled by scotch with equal space between ties (15 cm)?', ['patch_cords'], ['PATCH_CORD_NOT_BUNDLED']),
  photo('C7', CAB, 'Are Fiber Patch Cords of every MIC are bundled by scotch with equal space between ties (25 cm)?', ['patch_cords'], ['PATCH_CORD_NOT_BUNDLED']),
  photo('C8', CAB, 'Are Fiber patch cords of every Router are bundled into one duct between active and passive racks above the ladder?', ['patch_cords', 'duct'], ['DUCT_COVER_OPEN', 'DUCT_SECTION_MISSING']),
  photo('C9', CAB, 'Ensure that data cables arrange and bind with proper strength and not be bended excessively or pushed/pulled with the rotatable components such as a door is opened or closed', ['patch_cords'], ['PATCH_CORD_UNDER_TENSION', 'FIBER_BEND_RADIUS_TOO_TIGHT']),
  survey('C10', CAB, 'Are connectors of patch cords and ODFs matched?'),
  photo('C11', CAB, 'Are Patch cords installed away of the intake, exhaust, fan tray and power supplies to facilitate O&M actions and clear the path of air flow, using cable entrance holes of the rack', ['patch_cords']),
  derived('C12', CAB, 'Is the power loss of the HW loop within the accepted range? (-0.5 dB for every coupling, reading -10 dBm maximum)', 'fiber_loss'),
  derived('C13', CAB, '10 % spare either in patch cords or ODF ports for O&M actions', 'odf_spare'),
  photo('C14', CAB, '2 m spare at least of armored cables at every ODF', ['armoured_cables'], ['ARMOURED_CABLE_ROUTING_UNTIDY']),
  photo('C15', CAB, 'Are unused ports of ODFs / Patch cords covered using protective caps to protect it from damage?', ODF_CATS, ['DUST_CAP_MISSING']),
  photo('C16', CAB, 'Any extra length of cables should be organized well on ladder/tray or using cable organizers', ['patch_cords'], ['PATCH_CORD_EXCESS_LENGTH']),

  survey('L1', LAB, 'Labels Material must meet the standard of CSA'),
  photo('L2', LAB, 'Labels for Signal Cables different of labels for Power Cables and Uplink cables', ['uplink_labels', 'power_labels']),
  photo('L3', LAB, 'Ensure Label have sufficient Info (From, TO, Circuit ID, Power Type, Power Level) (as the agreed formats)', LABEL_CATS, ['LABEL_INFO_INCOMPLETE']),
  photo('L4', LAB, 'Are all Devices / Passive elements (Racks, ODFs, PDUs, …) labelled with the agreed format?', ['rack', 'router', 'pdu', ...LABEL_CATS], ['HOSTNAME_LABEL_MISSING', 'LABEL_MISSING']),
  photo('L5', LAB, 'Are port utilization sheets of ODFs available on active and passive racks?', ['odf_sheet'], ['ODF_SHEET_MISSING_OR_UNREADABLE']),

  derived('H1', HW, 'Redundancy in Power units', 'power_redundancy'),
  derived('H2', HW, 'Redundancy in Control boards', 'control_redundancy'),
  survey('H3', HW, 'All Items are from the approved vendor only'),
  photo('H4', HW, 'Both routing engines LEDs are in its normal status', ['router']),
  derived('H5', HW, 'The sent HW list match the actual installed', 'hw_list_match'),
  survey('H6', HW, 'Is the fan module working in the normal speed without noise?'),
  survey('H7', HW, 'Is the filter new and clean?'),
];
