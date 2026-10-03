import { describe, expect, it } from 'vitest';
import { checklistTotals, deriveChecklist, SID_CHECKLIST, summarizeCategories } from '../src/index.js';
import { fixture } from './fixture.js';

const byId = (data = fixture()) => new Map(deriveChecklist(data).map((r) => [r.id, r]));

describe('SID checklist items', () => {
  it('has the 58 SID items with unique ids in 9 sections', () => {
    expect(SID_CHECKLIST).toHaveLength(58);
    expect(new Set(SID_CHECKLIST.map((i) => i.id)).size).toBe(58);
    expect(new Set(SID_CHECKLIST.map((i) => i.section)).size).toBe(9);
  });
});

describe('deriveChecklist', () => {
  const r = byId();
  it('passes photo items with approved photos and reports verified snags', () => {
    expect(r.get('S1')).toMatchObject({ status: 'pass', label: 'OK', comment: '4 approved photos; 1 snag fixed and verified' });
  });
  it('fails photo items with open snags of their codes', () => {
    expect(r.get('C5')).toMatchObject({ status: 'fail', label: 'NOT OK' });
    expect(r.get('C5')!.comment).toContain('PATCH_CORD_NOT_BUNDLED');
    // C16 looks at another code of the same category -> not affected by that snag
    expect(r.get('C16')!.status).toBe('pass');
  });
  it('is pending while the only photos await review', () => {
    expect(r.get('F6')).toMatchObject({ status: 'pending', comment: '2 photos awaiting review' });
  });
  it('marks photo items without photos and survey items without answers N/A – manual', () => {
    expect(r.get('L5')).toMatchObject({ status: 'na', label: 'N/A – manual' });
    expect(r.get('V2')).toMatchObject({ status: 'na', label: 'N/A – manual' });
  });
  it('uses manual survey answers', () => {
    expect(r.get('V1')).toMatchObject({ status: 'manual', label: '3 Good' });
  });
  it('derives fiber loss, ODF spare and redundancy from technical data', () => {
    expect(r.get('C12')).toMatchObject({ status: 'fail' });
    expect(r.get('C12')!.comment).toContain('max 8 dB');
    expect(r.get('C13')).toMatchObject({ status: 'pass', comment: '3 of 4 ODF positions free (75%)' });
    expect(r.get('H1')).toMatchObject({ status: 'fail', comment: '1 power module in inventory' });
    expect(r.get('H2')).toMatchObject({ status: 'pass' });
    expect(r.get('H5')).toMatchObject({ status: 'fail', comment: '0 BOM serials not installed, 1 installed serials not in BOM' });
  });
  it('treats an inventory-derived BOM as no delivered HW list', () => {
    const d = fixture();
    expect(byId({ ...d, bom: { ...d.bom, activeSource: 'inventory' } }).get('H5')!.status).toBe('na');
  });
  it('totals cover every item', () => {
    const t = checklistTotals(deriveChecklist(fixture()));
    expect(Object.values(t).reduce((a, b) => a + b, 0)).toBe(58);
  });
});

describe('summarizeCategories', () => {
  it('summarises only categories with activity', () => {
    const s = summarizeCategories(fixture());
    expect(new Map(s.map((c) => [c.category, c.status]))).toEqual(
      new Map([
        ['rack', 'pass'],
        ['patch_cords', 'fail'],
        ['duct', 'pending'],
      ]),
    );
    expect(s.find((c) => c.category === 'rack')).toMatchObject({ approved: 4, verifiedSnags: 1, titleAr: expect.any(String) });
  });
});
