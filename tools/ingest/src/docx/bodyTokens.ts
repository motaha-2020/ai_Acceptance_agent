import { XMLParser } from 'fast-xml-parser';

/** A body-order token: a non-empty paragraph's text, or an embedded image reference. */
export type BodyToken =
  | { kind: 'image'; rId: string; paragraph: number }
  | { kind: 'text'; text: string; paragraph: number };

type OrderedNode = Record<string, unknown> & { ':@'?: Record<string, string> };

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: false,
  parseTagValue: false,
});

const keyOf = (n: OrderedNode): string | undefined => Object.keys(n).find((k) => k !== ':@');

/** Collect text pieces and image rIds of one paragraph in document order. */
function walk(nodes: OrderedNode[], out: Array<{ t: 'text'; v: string } | { t: 'image'; id: string }>): void {
  for (const n of nodes) {
    const k = keyOf(n);
    if (!k || k === '#text') continue;
    // mc:Fallback duplicates the mc:Choice content (VML copy of drawing shapes) -> skip.
    if (k === 'mc:Fallback') continue;
    const children = n[k] as OrderedNode[];
    if (k === 'w:t') {
      out.push({ t: 'text', v: children.map((c) => String(c['#text'] ?? '')).join('') });
    } else if (k === 'w:tab' || k === 'w:br') {
      out.push({ t: 'text', v: ' ' });
    } else if (k === 'a:blip') {
      const id = n[':@']?.['@_r:embed'];
      if (id) out.push({ t: 'image', id });
    } else if (k === 'v:imagedata') {
      const id = n[':@']?.['@_r:id'];
      if (id) out.push({ t: 'image', id });
    } else if (Array.isArray(children)) {
      walk(children, out);
    }
  }
}

/**
 * Walk word/document.xml body in order. Paragraph text pieces are concatenated; an image
 * encountered inside a paragraph is emitted at its position relative to the text pieces.
 * Whitespace-only text is dropped.
 */
export function extractBodyTokens(documentXml: string): BodyToken[] {
  const tree = parser.parse(documentXml) as OrderedNode[];
  const doc = tree.find((n) => 'w:document' in n)?.['w:document'] as OrderedNode[] | undefined;
  const body = doc?.find((n) => 'w:body' in n)?.['w:body'] as OrderedNode[] | undefined;
  if (!body) throw new Error('No w:body in document.xml');

  const tokens: BodyToken[] = [];
  let paragraph = 0;
  for (const block of body) {
    if (!('w:p' in block)) continue;
    paragraph += 1;
    const pieces: Array<{ t: 'text'; v: string } | { t: 'image'; id: string }> = [];
    walk(block['w:p'] as OrderedNode[], pieces);

    let buffer = '';
    const flush = (): void => {
      if (buffer.trim()) tokens.push({ kind: 'text', text: buffer, paragraph });
      buffer = '';
    };
    for (const p of pieces) {
      if (p.t === 'text') buffer += p.v;
      else {
        flush();
        tokens.push({ kind: 'image', rId: p.id, paragraph });
      }
    }
    flush();
  }
  return tokens;
}

/** word/_rels/document.xml.rels -> rId => target (e.g. "media/image1.jpeg"). */
export function parseRelationships(relsXml: string): Map<string, string> {
  const tree = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(relsXml) as {
    Relationships?: { Relationship?: unknown };
  };
  const raw = tree.Relationships?.Relationship;
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Array<Record<string, string>>;
  return new Map(list.map((r) => [r['@_Id'] as string, r['@_Target'] as string]));
}
