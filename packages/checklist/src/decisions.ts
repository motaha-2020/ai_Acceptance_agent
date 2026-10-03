import type { PhotoCategory } from '@acceptance/shared';
type Severity = 'minor' | 'major' | 'critical';

/**
 * Site decisions: answers to the open taxonomy questions, applied as explicit settings (T3.5).
 *
 * These are EVIDENCE-BASED DEFAULTS chosen during prompt tuning (docs/ai-tuning-log.md), confirmed by
 * the project owner on 2026-10-03 (D1-D9 as written). Each one is a single value here so a reviewer decision can be applied
 * by editing one line. Every value is rendered into the cached prompt prefix (see `renderSiteDecisions`)
 * and into docs/snag-taxonomy.md, and the taxonomy reads its severities / evidence thresholds from here.
 * Bump TAXONOMY_VERSION (taxonomy.ts) after changing anything in this file.
 */
export const SITE_DECISIONS = {
  /**
   * D1 Rack doors. Approved rack photos show doors open (inside shots). RACK_DOOR_NOT_CLOSED applies only
   * when the shot is meant to show closed doors (closed-rack / final front-back overview) or a door is
   * visibly ajar / not latched. 'always' would flag every open door.
   */
  rackDoorRule: 'closed_shots_only' as 'closed_shots_only' | 'always',
  rackDoorSeverity: 'minor' as Severity,

  /**
   * D2 People. A hand or fingers holding a label or cord flat for a close-up is acceptable (approved label
   * photos are taken like that). Any other body part, a face or a person in the background is
   * PERSON_IN_FRAME. A faint reflection of the photographer in a glossy surface is NOT flagged unless the
   * person is clearly recognisable (approved ODF photos show such reflections).
   */
  handHoldingLabelAllowed: true,
  faintReflectionAllowed: true,

  /**
   * D3 SID-derived codes with no reviewer evidence in the snag files. They stay in the taxonomy but are
   * minor (never reject on their own) and need high-confidence, specific visual evidence.
   */
  sidDerivedCodes: ['LABEL_INFO_INCOMPLETE', 'RACK_BASE_NOT_LEVEL', 'RACK_MISALIGNED', 'POWER_CABLE_ROUTING_UNTIDY', 'ODF_SHEET_MISSING_OR_UNREADABLE'] as const,
  sidDerivedSeverity: 'minor' as Severity,
  /** Minimum per-snag confidence for the SID-derived codes to be reported at all. */
  sidDerivedMinConfidence: 0.85,

  /** D4 Blank (unused) PDU breaker label slots are not a snag; only a used breaker/cable without a label is. */
  blankPduBreakerSlotsAreSnag: false,

  /** D5 POWER_CABLE_DAMAGED is the only critical code. */
  criticalCodes: ['POWER_CABLE_DAMAGED'] as const,

  /**
   * D6 Related categories. Sites upload close-ups of labels, cords or the item next to it under the parent
   * category (e.g. ODF label close-ups in the ODF folder, rack name label in the test-room folder). A photo
   * whose main subject belongs to a related category of the declared one is NOT WRONG_CATEGORY; it is
   * inspected with the declared checklist plus the related category's checklist items that are visible.
   */
  relatedCategoriesAreSameSubject: true,

  /**
   * D7 Housekeeping scope. Pre-existing building dirt (old exchange floors, the void under the raised floor,
   * walls, ceilings) is not the contractor's snag. DUST_OR_DIRT is dust on the installed equipment / rack
   * interior / ODF; a few cable-tie off-cuts are DUST_OR_DIRT (minor). PACKAGING_OR_DEBRIS_LEFT (major) is
   * reserved for clear installer leftovers: cartons, bags, wrapping, spare material, tools.
   */
  preExistingBuildingDirtIsSnag: false,

  /**
   * D8 Photo-gate codes that route the photo to a human / retake instead of rejecting it: the model is
   * often unsure whether the subject is the right one or complete, and approved sites photograph
   * close-ups. A clear major snag in the same photo still rejects.
   */
  routeToHumanCodes: ['WRONG_CATEGORY', 'SUBJECT_NOT_FULLY_VISIBLE'] as const,

  /**
   * D9 Verdict by severity. Only major/critical snags reject. Photos whose only findings are minor go to a
   * human as "uncertain" with the minor notes listed. "accept" (accept with notes) was the requested default
   * but on TUNE it produced strict false accepts (reviewers rejected those photos for the minor remark) and
   * no gain on good photos (docs/ai-tuning-log.md, it2-it6 replays), so it is off until reviewers confirm
   * that minor remarks alone should not block acceptance. reject restores "any snag rejects".
   */
  minorOnlyVerdict: 'uncertain' as 'accept' | 'uncertain' | 'reject',
};

/**
 * D6 groups: categories that photograph the same physical installation from different distances.
 * A category is related to every other category of any group it belongs to.
 */
export const RELATED_CATEGORY_GROUPS: readonly (readonly PhotoCategory[])[] = [
  ['rack', 'router', 'test_room', 'rack_base', 'odf_sheet'],
  ['odf_cross_connect', 'odf_cross_connect_labels', 'patch_cords', 'router', 'test_room', 'rack'],
  ['odf_tie', 'odf_tie_labels', 'test_room', 'armoured_cables', 'rack'],
  ['router', 'patch_cords', 'management', 'uplink', 'uplink_labels', 'odf_cross_connect_labels'],
  ['uplink', 'uplink_labels', 'patch_cords', 'duct'],
  ['duct', 'patch_cords', 'armoured_cables', 'management'],
  ['pdu', 'power_system', 'power_path', 'earth_path', 'power_labels', 'rack'],
];

export function relatedCategories(category: PhotoCategory): PhotoCategory[] {
  const out = new Set<PhotoCategory>();
  for (const g of RELATED_CATEGORY_GROUPS) if (g.includes(category)) for (const c of g) if (c !== category) out.add(c);
  return [...out].sort();
}

export function isRelatedCategory(a: PhotoCategory, b: PhotoCategory): boolean {
  return a === b || relatedCategories(a).includes(b);
}

const SID = new Set<string>(SITE_DECISIONS.sidDerivedCodes);

/** Minimum per-snag confidence for a code to be reported (undefined = the policy default). */
export function codeMinConfidence(code: string): number | undefined {
  return SID.has(code) ? SITE_DECISIONS.sidDerivedMinConfidence : undefined;
}

/** The decisions as prompt/doc text, one numbered line each. Deterministic (part of the cached prefix). */
export function renderSiteDecisions(): string[] {
  const d = SITE_DECISIONS;
  return [
    d.rackDoorRule === 'closed_shots_only'
      ? 'Rack doors: open doors are normal in shots of the rack interior. Emit RACK_DOOR_NOT_CLOSED only when the shot is meant to show the closed rack (closed-rack overview, final front/back shot) and a door is open, or when a door is visibly ajar / not latched.'
      : 'Rack doors: every open or unlatched rack door is RACK_DOOR_NOT_CLOSED.',
    `People: ${d.handHoldingLabelAllowed ? 'a hand or fingers holding a label or cord flat for a close-up is normal and NOT a snag; ' : ''}any other body part, a face or a person in the background is PERSON_IN_FRAME${d.faintReflectionAllowed ? '; a faint reflection of the photographer in a glossy door or ODF window is NOT a snag unless the person is clearly recognisable' : ''}.`,
    `SID-derived codes (${d.sidDerivedCodes.join(', ')}) have no reviewer evidence yet: report them only with specific, clearly visible evidence and confidence >= ${d.sidDerivedMinConfidence}; they are ${d.sidDerivedSeverity}.`,
    d.blankPduBreakerSlotsAreSnag
      ? 'PDU breakers: blank label slots on PDU breakers are LABEL_MISSING.'
      : 'PDU breakers: blank label slots on unused PDU breakers are NOT a snag; only a used breaker or cable without its label is LABEL_MISSING.',
    `Critical severity is reserved for ${d.criticalCodes.join(', ')}.`,
    d.relatedCategoriesAreSameSubject
      ? 'Related categories: a close-up of the labels, cords or an item belonging to a related category of the declared one (listed in the category block) is the SAME subject, not WRONG_CATEGORY.'
      : 'Related categories: a photo of any other category is WRONG_CATEGORY.',
    d.preExistingBuildingDirtIsSnag
      ? 'Housekeeping: any dirt or debris in the frame is a snag.'
      : 'Housekeeping: pre-existing building dirt (old exchange floor, the void under the raised floor, walls, ceiling) is NOT a snag. DUST_OR_DIRT = dust on the installed equipment, rack interior or ODF, or a few cable-tie off-cuts. PACKAGING_OR_DEBRIS_LEFT = clear installer leftovers only (cartons, bags, wrapping, spare material, tools) in or at the installation.',
  ];
}
