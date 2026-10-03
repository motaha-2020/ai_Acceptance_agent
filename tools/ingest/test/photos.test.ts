import { describe, expect, it } from 'vitest';
import { PhotoCategory } from '@acceptance/shared';
import { categorize } from '../src/photos/category.js';
import { findDuplicates } from '../src/photos/scan.js';

const cat = (p: string): string | undefined => categorize(p.split('/'))?.category;

describe('categorize', () => {
  it.each([
    ['Aromourd Cables', 'armoured_cables'],
    ['Duct', 'duct'],
    ['Managment', 'management'],
    ['ODF Cross Connect', 'odf_cross_connect'],
    ['ODF Cross Connect/Labels Cross Connect', 'odf_cross_connect_labels'],
    ['ODF Cross Connect/Labels ODF Cross Connect', 'odf_cross_connect_labels'],
    ['ODF Tie', 'odf_tie'],
    ['ODF Tie/Labels ODF Tie', 'odf_tie_labels'],
    ['Patch Cords', 'patch_cords'],
    ['Power/Earth path', 'earth_path'],
    ['Power/Power Earth', 'earth_path'],
    ['Power/Lables', 'power_labels'],
    ['Power/PDU', 'pdu'],
    ['Power/Power Path', 'power_path'],
    ['Power/saystem', 'power_system'],
    ['Rack', 'rack'],
    ['Rack Base', 'rack_base'],
    ['Router', 'router'],
    ['Sheet ODF', 'odf_sheet'],
    ['Test Room', 'test_room'],
    ['uplink', 'uplink'],
    ['uplink/Uplink Lables', 'uplink_labels'],
    // NASR3 naming
    ['ARMOUD PATH', 'armoured_cables'],
    ['BASE', 'rack_base'],
    ['Earth Path', 'earth_path'],
    ['management', 'management'],
    ['SW ROOM/DUCT', 'duct'],
    ['SW ROOM/ODF SHEET', 'odf_sheet'],
    ['SW ROOM/ODFS/ODF(1)CC', 'odf_cross_connect'],
    ['SW ROOM/ODFS/ODF(2)CC', 'odf_cross_connect'],
    ['SW ROOM/ODFS/ODF(3)MMR', 'odf_tie'],
    ['SW ROOM/ODFS/ODF(4)MMR', 'odf_tie'],
    ['SW ROOM/PATCH CORDS', 'patch_cords'],
    ['SW ROOM/RACKS', 'rack'],
    ['SW ROOM/Router', 'router'],
    ['Up Links', 'uplink'],
  ])('%s -> %s', (folder, expected) => {
    expect(cat(folder)).toBe(expected);
  });

  it('flags the loose POWER folder as an assumption', () => {
    expect(categorize(['POWER'])).toEqual({ category: 'power_path', assumed: true });
  });

  it('returns null for unknown folders', () => {
    expect(categorize(['Misc stuff'])).toBeNull();
    expect(categorize([])).toBeNull();
  });

  it('only produces valid PhotoCategory values', () => {
    for (const f of ['Rack', 'Power/saystem', 'uplink/Uplink Lables']) {
      expect(PhotoCategory.safeParse(cat(f)).success).toBe(true);
    }
  });
});

describe('findDuplicates', () => {
  const rec = (relPath: string, sha256: string) => ({ site: 's', device: 'd', category: 'rack' as const, relPath, bytes: 1, sha256 });
  it('groups identical hashes', () => {
    const d = findDuplicates([rec('a', 'x'.repeat(64)), rec('b', 'y'.repeat(64)), rec('c', 'x'.repeat(64))]);
    expect(d).toEqual([{ sha256: 'x'.repeat(64), files: ['a', 'c'] }]);
  });
});
