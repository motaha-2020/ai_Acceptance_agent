import { describe, expect, it } from 'vitest';
import { chunk, guessCategoryFromPath, isImage, mapLimit } from '@/features/bulk-upload/plan';

describe('bulk upload helpers', () => {
  it('guesses the category from the deepest known site folder', () => {
    expect(guessCategoryFromPath('9906/9906/ODF Tie/Labels ODF Tie/ODF Tie Lables (3).jpeg')).toBe('odf_tie_labels');
    expect(guessCategoryFromPath('9906/9906/ODF Tie/ODF Tie (2).jpeg')).toBe('odf_tie');
    expect(guessCategoryFromPath('9902/9902/Power/Lables/Power Cables Labels ASR9902 (1).jpeg')).toBe('power_labels');
    expect(guessCategoryFromPath('NCS-57C3/NCS-57C3/Aromourd Cables/a.jpeg')).toBe('armoured_cables');
    expect(guessCategoryFromPath('x/Up Links/a.jpeg')).toBe('uplink');
    expect(guessCategoryFromPath('IMG_0001.jpg')).toBeUndefined();
    expect(guessCategoryFromPath('random/folder/IMG_0001.jpg')).toBeUndefined();
  });

  it('accepts only photos', () => {
    expect(isImage({ name: 'a.JPG', type: '' })).toBe(true);
    expect(isImage({ name: 'a.webp', type: 'image/webp' })).toBe(true);
    expect(isImage({ name: 'notes.docx', type: 'application/vnd.openxmlformats' })).toBe(false);
  });

  it('chunks and runs with bounded concurrency, keeping order', async () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    let inFlight = 0;
    let peak = 0;
    const out = await mapLimit([5, 1, 4, 2, 3], 2, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, n));
      inFlight--;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30]);
    expect(peak).toBe(2);
  });
});
