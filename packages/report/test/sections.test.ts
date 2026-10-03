import { describe, expect, it } from 'vitest';
import { buildAcceptanceReport, fitBox, SECTIONS } from '../src/index.js';
import { fixture, unpack, type Unpacked } from './fixture.js';

const tableAfter = (u: Unpacked, re: RegExp) => u.content.tables.find((t) => re.test(t.heading ?? ''));

describe('buildAcceptanceReport', async () => {
  const u = await unpack(await buildAcceptanceReport(fixture()));
  const text = u.content.paragraphs.join('\n');

  it('renders the 12 SID sections in order after the cover and contents', () => {
    const headings = SECTIONS.map((s) => u.content.paragraphs.findIndex((p) => p.replace(/[:.]$/, '') === s.heading));
    expect(headings.every((i) => i > 0)).toBe(true);
    expect([...headings].sort((a, b) => a - b)).toEqual(headings);
    expect(u.content.paragraphs[0]).toBe('Site Information Document');
    expect(text).toContain('7. Site BOM (including active and passive).');
  });

  it('site data grid has SID labels and values (Arabic region kept)', () => {
    const t = u.content.tables.find((x) => x.rows[0]?.[0] === 'Basic Information of Site/Device:')!;
    expect(t.rows[1]).toEqual(['Site Name:', 'NASR3…C', 'Sector/City/Region:', 'القاهره']);
    expect(t.rows[3]).toEqual(['Project Name:', 'TE BIG-EDGE', 'Device Brand/Type/SN', 'CISCO/ASR-9906\nCH1']);
    expect(u.xml).toMatch(/<w:rtl\/>[\s\S]{0,200}القاهره|القاهره/);
  });

  it('LLD install and internal links tables use the SID columns', () => {
    expect(tableAfter(u, /^Install:$/)!.rows[0]).toEqual(['Hostname', 'Router Function', 'Node', 'Type', 'Project']);
    const links = tableAfter(u, /^New$/)!;
    expect(links.rows[1]).toEqual(['HOST-1', 'Te0/0/0/30', 'PEER-1', 'Te0/2/0/0', '10']);
  });

  it('BOM: active rows with serials, passive power and telco passive', () => {
    const active = tableAfter(u, /Active & Passive quantities/)!;
    expect(active.rows[0]).toEqual(['S', 'Part Number', 'QTY', 'S/N']);
    expect(active.rows[2]).toEqual(['2', 'A9K-RSP5-X-SE', '2', 'RP1, RP2']);
    expect(tableAfter(u, /^Passive Power:$/)!.rows[1]).toEqual(['Power Cable 16mm', 'PCS', '10']);
    expect(tableAfter(u, /^Telco Passive:$/)!.rows[1]).toEqual(['ProRack 42U', 'PCS', '2']);
  });

  it('ODF grid, port mapping and fiber test (with landscape section)', () => {
    const grid = u.content.tables.find((t) => t.rows[0]?.[0] === 'Fiber' && t.rows[0]?.[1] === 'A')!;
    expect(grid.rows[1]).toEqual(['1', 'Te0/0/0/30', '']);
    expect(tableAfter(u, /^Port mapping$/)!.rows[1]).toEqual(['Te0/0/0/30', 'ODF 1 - A(1,2)', 'ODF 3 - A(1,2)', 'PEER-1 Te0/2/0/0']);
    const fiber = u.content.tables.find((t) => t.rows[0]?.[0] === 'Panel')!;
    expect(fiber.rows[1]).toEqual(['A', '0.4', '8']);
    expect(u.xml).toContain('w:orient="landscape"');
  });

  it('acceptance checklist has 58 item rows plus section rows and a category summary', () => {
    const t = u.content.tables.find((x) => x.rows[0]?.join('|') === '#|Area|Status|Comments')!;
    expect(t.rows.filter((r) => r.length === 4).length - 1).toBe(58);
    expect(t.rows.find((r) => r[0] === 'C5')?.[2]).toBe('NOT OK');
    const summary = tableAfter(u, /Summary per photo category/)!;
    expect(summary.rows.some((r) => r[0]?.startsWith('Rack') && r[7] === 'OK')).toBe(true);
  });

  it('gallery embeds only the given approved photos with bilingual captions', async () => {
    // identical bytes are stored once in word/media, so count the picture references
    expect(u.xml.match(/<a:blip /g)).toHaveLength(3);
    const cells = u.content.tables.flatMap((t) => t.rows.flat()).join('\n');
    expect(cells).toContain('Rack (active & passive) / الراك (الأكتيف والباسيف)');
    expect(cells).toContain('HOST-1 · 2026-01-20 10:32');
  });

  it('report info: version, AI stats, warnings and sign-off', () => {
    expect(text).toContain('Report information and sign-off');
    const info = u.content.tables.find((t) => t.rows[1]?.[0] === 'Report version')!;
    expect(info.rows[1]).toEqual(['Report version', 'v3']);
    expect(info.rows[2]).toEqual(['Status', 'FINAL']);
    expect(text).toContain('AI/human verdict agreement: 88.9%');
    expect(tableAfter(u, /^AI inspection$/)!.rows[1]).toEqual(['claude', 'claude-sonnet-5-5', 'p7', '9']);
    const sign = tableAfter(u, /^Sign-off$/)!;
    expect(sign.rows.map((r) => r[0])).toEqual(['Role', 'Contractor', 'Reviewer (reviewer)', 'Client acceptance – Telecom Egypt']);
  });

  it('header carries the Arabic site name; footer has page numbers', async () => {
    const files = Object.keys(u.zip.files);
    const headers = await Promise.all(files.filter((f) => /word\/header\d+\.xml/.test(f)).map((f) => u.zip.file(f)!.async('string')));
    expect(headers.some((h) => h.includes('نصر3') && h.includes('<w:rtl/>'))).toBe(true);
    const footers = await Promise.all(files.filter((f) => /word\/footer\d+\.xml/.test(f)).map((f) => u.zip.file(f)!.async('string')));
    expect(footers.some((f) => f.includes('NUMPAGES'))).toBe(true);
  });
});

describe('draft and empty data', () => {
  it('marks drafts and degrades gracefully without technical data or photos', async () => {
    const d = fixture({ inventory: null, lld: null, portMap: [], utilization: [], fiberTests: [], gallery: [], photoStats: [], snags: [], survey: {}, bom: { active: [], activeSource: 'none', passivePower: [], telcoPassive: [] } });
    const u = await unpack(await buildAcceptanceReport({ ...d, meta: { ...d.meta, draft: true } }));
    const text = u.content.paragraphs.join('\n');
    expect(text).toContain('DRAFT – not for acceptance');
    expect(text).toContain('No LLD document imported for this site.');
    expect(text).toContain('No fiber test results imported for this site.');
    expect(text).toContain('No approved photos yet.');
    expect(u.xml).not.toContain('<a:blip ');
  });

  it('rejects invalid data', async () => {
    await expect(buildAcceptanceReport({ ...fixture(), meta: { ...fixture().meta, version: 0 } })).rejects.toThrow();
  });
});

describe('fitBox', () => {
  it('scales into the photo box keeping aspect ratio and never upscales', () => {
    expect(fitBox(1200, 1600)).toEqual({ width: 270, height: 360 });
    expect(fitBox(1600, 1200)).toEqual({ width: 330, height: 248 });
    expect(fitBox(100, 50)).toEqual({ width: 100, height: 50 });
  });
});
