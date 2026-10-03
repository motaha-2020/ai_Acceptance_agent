import type { PhotoCategory } from '@acceptance/shared';

export interface CategoryMatch {
  category: PhotoCategory;
  /** true when the folder name alone does not determine the category (documented guess) */
  assumed: boolean;
}

/** lowercase, no spaces/punctuation: "Uplink Lables" -> "uplinklables", "ODF(1)CC" -> "odf1cc" */
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** "Labels ODF Tie", "Lables", "Uplink Lables" ... (source folders misspell it) */
const isLabelsFolder = (n: string): boolean => /^lab/.test(n) || /lab(el|le)s?$/.test(n);

/** What a "labels" folder labels, decided from the folder's own name and its ancestors. */
function labelsFor(segments: string[]): PhotoCategory | null {
  const ctx = segments.join('/');
  if (/crossconnect|odf\d?cc/.test(ctx)) return 'odf_cross_connect_labels';
  if (/tie|mmr/.test(ctx)) return 'odf_tie_labels';
  if (/uplink/.test(ctx)) return 'uplink_labels';
  if (/power/.test(ctx)) return 'power_labels';
  return null;
}

/**
 * Map a photo's folder path (segments below the device root, e.g. ["Power","Lables"]) to a
 * PhotoCategory. Handles the typos present in the source folders
 * (Aromourd, Managment, Lables, saystem, ARMOUD PATH, ...). Returns null when unmapped.
 */
export function categorize(folderSegments: readonly string[]): CategoryMatch | null {
  const segs = folderSegments.map(norm).filter(Boolean);
  if (!segs.length) return null;
  const last = segs.at(-1)!;

  if (isLabelsFolder(last)) {
    const c = labelsFor(segs);
    return c ? { category: c, assumed: false } : null;
  }

  const rules: Array<[RegExp, PhotoCategory]> = [
    [/earth/, 'earth_path'],
    [/pdu/, 'pdu'],
    [/powerpath/, 'power_path'],
    [/sa?ystem$/, 'power_system'], // "saystem" (sic) and "system"
    [/odfsheet|sheetodf/, 'odf_sheet'],
    [/crossconnect|odf\d?cc$/, 'odf_cross_connect'],
    [/odftie|odf\d?mmr$|(^|\/)tie/, 'odf_tie'],
    [/uplink/, 'uplink'],
    [/testroom/, 'test_room'],
    [/patchcord/, 'patch_cords'],
    [/arm[ou]|arom/, 'armoured_cables'],
    [/duct/, 'duct'],
    [/manag/, 'management'],
    [/rackbase|(^|\/)base$/, 'rack_base'],
    [/router/, 'router'],
    [/racks?$/, 'rack'],
  ];
  for (const [re, category] of rules) if (re.test(last)) return { category, assumed: false };

  // NASR3 keeps loose power photos directly under "POWER" (no sub-folders): treat as power path.
  if (last === 'power') return { category: 'power_path', assumed: true };
  return null;
}
