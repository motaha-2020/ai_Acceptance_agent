import type { BodyToken } from '../docx/bodyTokens.js';

export interface SnagGroup {
  groupIndex: number;
  /** image rIds in document order */
  images: string[];
  /** cleaned remarks (numbering stripped, empties dropped) */
  remarks: string[];
}

// Leading list numbering such as "1_", "2-", "٣)", "1.", "-", "1-|" ; digits optional.
const NUMBERING = /^[\s\u200f\u200e]*(?:[0-9\u0660-\u0669]+[\s]*[-_.)\u2013:]*|[-_.)\u2013]+)[\s]*/u;
const TRAILING_JUNK = /[\s\-_]+$/u;

/** Trim and strip leading numbering / stray dashes; collapses inner whitespace. */
export function cleanRemark(raw: string): string {
  return raw
    .replace(NUMBERING, '')
    .replace(TRAILING_JUNK, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Group consecutive images with the following text paragraph(s).
 * A new group starts when an image appears after remarks were already collected,
 * or at the start. Text with no preceding image forms an image-less group.
 */
export function groupTokens(tokens: readonly BodyToken[]): SnagGroup[] {
  const groups: SnagGroup[] = [];
  let cur: SnagGroup | null = null;
  const open = (): SnagGroup => {
    const g: SnagGroup = { groupIndex: groups.length + 1, images: [], remarks: [] };
    groups.push(g);
    return g;
  };

  for (const t of tokens) {
    if (t.kind === 'image') {
      if (!cur || cur.remarks.length > 0) cur = open();
      cur.images.push(t.rId);
    } else {
      const remark = cleanRemark(t.text);
      if (remark.length < 2) continue; // numbering-only ("1", "-") or stray single-character paragraph
      if (!cur) cur = open();
      cur.remarks.push(remark);
    }
  }
  return groups;
}
