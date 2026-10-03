import { describe, expect, it } from 'vitest';
import { extractBodyTokens, parseRelationships } from '../src/docx/bodyTokens.js';
import { cleanRemark, groupTokens } from '../src/snags/group.js';

const W = 'xmlns:w="w" xmlns:a="a" xmlns:r="r" xmlns:mc="mc" xmlns:v="v"';
const img = (id: string): string => `<w:r><w:drawing><a:graphic><a:blip r:embed="${id}"/></a:graphic></w:drawing></w:r>`;
const para = (inner: string): string => `<w:p>${inner}</w:p>`;
const run = (t: string): string => `<w:r><w:t>${t}</w:t></w:r>`;
const doc = (...ps: string[]): string => `<w:document ${W}><w:body>${ps.join('')}</w:body></w:document>`;

describe('extractBodyTokens', () => {
  it('keeps body order, joins split runs, drops empty paragraphs', () => {
    const xml = doc(
      para(img('rId1')),
      para(''),
      para(run('1_') + run('نقفل ') + run('الداكت')),
      para(img('rId2') + run('2-text')),
    );
    expect(extractBodyTokens(xml).map((t) => (t.kind === 'image' ? `img:${t.rId}` : `txt:${t.text}`))).toEqual([
      'img:rId1',
      'txt:1_نقفل الداكت',
      'img:rId2',
      'txt:2-text',
    ]);
  });

  it('ignores mc:Fallback copies and shapes without blips', () => {
    const shape = `<w:r><mc:AlternateContent><mc:Choice><w:drawing><a:prstGeom/></w:drawing></mc:Choice>` +
      `<mc:Fallback><w:pict><v:imagedata r:id="rId99"/></w:pict></mc:Fallback></mc:AlternateContent></w:r>`;
    const tokens = extractBodyTokens(doc(para(img('rId5') + shape)));
    expect(tokens).toEqual([{ kind: 'image', rId: 'rId5', paragraph: 1 }]);
  });

  it('does not coerce numeric-looking text', () => {
    const t = extractBodyTokens(doc(para(run('10.35.23') + run('5') + run('.2'))));
    expect(t[0]).toMatchObject({ kind: 'text', text: '10.35.235.2' });
  });
});

describe('parseRelationships', () => {
  it('maps rId to target', () => {
    const xml = `<Relationships><Relationship Id="rId7" Type="t" Target="media/image1.jpeg"/><Relationship Id="rId8" Type="t" Target="media/image2.png"/></Relationships>`;
    expect(parseRelationships(xml).get('rId8')).toBe('media/image2.png');
  });
});

describe('cleanRemark', () => {
  it.each([
    ['1_نقفل الداكت  ', 'نقفل الداكت'],
    ['2-السستمه تتعدل', 'السستمه تتعدل'],
    ['-نمسح الباغه-', 'نمسح الباغه'],
    ['٣) نغطي الكابلر', 'نغطي الكابلر'],
    ['نحط 8 مسامير', 'نحط 8 مسامير'],
    ['1', ''],
    [' - ', ''],
  ])('%j -> %j', (raw, expected) => {
    expect(cleanRemark(raw)).toBe(expected);
  });
});

describe('groupTokens', () => {
  const T = (kind: 'image' | 'text', v: string) =>
    kind === 'image' ? ({ kind, rId: v, paragraph: 0 } as const) : ({ kind, text: v, paragraph: 0 } as const);

  it('shares one remark across consecutive images', () => {
    const g = groupTokens([T('image', 'a'), T('image', 'b'), T('text', '1_shared')]);
    expect(g).toEqual([{ groupIndex: 1, images: ['a', 'b'], remarks: ['shared'] }]);
  });

  it('collects several remark paragraphs for one image and starts a new group at the next image', () => {
    const g = groupTokens([T('image', 'a'), T('text', '1-x1'), T('text', '2-x2'), T('image', 'b'), T('text', 'yy')]);
    expect(g.map((x) => [x.images, x.remarks])).toEqual([
      [['a'], ['x1', 'x2']],
      [['b'], ['yy']],
    ]);
  });

  it('keeps images without remark and text without image', () => {
    const g = groupTokens([T('text', 'orphan'), T('image', 'a'), T('image', 'b')]);
    expect(g.map((x) => [x.images, x.remarks])).toEqual([
      [[], ['orphan']],
      [['a', 'b'], []],
    ]);
  });

  it('drops numbering-only paragraphs', () => {
    expect(groupTokens([T('image', 'a'), T('text', '1'), T('text', 'real')])[0]!.remarks).toEqual(['real']);
  });
});
