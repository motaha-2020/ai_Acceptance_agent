import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  LevelFormat,
  Packer,
  PageBorderDisplay,
  PageBorderOffsetFrom,
  PageNumber,
  PageOrientation,
  Paragraph,
  TabStopType,
  TextRun,
  type ISectionOptions,
} from 'docx';
import { ReportData, type ReportDataInput } from './data.js';
import { hasArabic, NUMBERING_REF, run, THEME, type Block } from './docx/primitives.js';
import { buildBom } from './sections/bom.js';
import { buildChecklist } from './sections/checklist.js';
import { buildContents, buildCover } from './sections/front.js';
import { buildGallery } from './sections/gallery.js';
import { buildConfig, buildFiberConnectivity, buildLld, buildPowerConnectivity } from './sections/network.js';
import { buildFiberTests, buildOdf } from './sections/odf.js';
import { buildReportInfo } from './sections/reportInfo.js';
import { buildFacilitySurvey, buildLayouts, buildSiteData } from './sections/site.js';

const MARGIN = 720; // 0.5" like the SID
const DOUBLE = { style: BorderStyle.DOUBLE, size: 4, color: 'auto', space: 24 };

function header(data: ReportData): Header {
  const label = data.site.nameAr ?? data.siteData.siteName ?? data.site.name;
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        bidirectional: hasArabic(label) && !/[A-Za-z]/.test(label) ? true : undefined,
        children: [run(label, { size: 28, color: THEME.accent })],
      }),
      ...(data.meta.draft ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [run('DRAFT', { bold: true, size: 20, color: THEME.fail })] })] : []),
    ],
  });
}

function footer(data: ReportData): Footer {
  return new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: 11906 - 2 * MARGIN }],
        children: [
          run(`${data.siteData.hostname ?? data.site.code} · Acceptance report v${data.meta.version}${data.meta.draft ? ' (DRAFT)' : ''}`, { size: 16, color: THEME.muted }),
          new TextRun({ children: ['\tPage ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], size: 16, color: THEME.muted }),
        ],
      }),
    ],
  });
}

function section(data: ReportData, children: Block[], opts: { landscape?: boolean; titlePage?: boolean } = {}): ISectionOptions {
  return {
    properties: {
      titlePage: opts.titlePage,
      page: {
        size: { width: 11906, height: 16838, orientation: opts.landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
        margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN, header: 400, footer: 300 },
        borders: {
          pageBorders: { display: PageBorderDisplay.ALL_PAGES, offsetFrom: PageBorderOffsetFrom.PAGE },
          pageBorderTop: DOUBLE,
          pageBorderBottom: DOUBLE,
          pageBorderLeft: DOUBLE,
          pageBorderRight: DOUBLE,
        },
      },
    },
    headers: { default: header(data), first: new Header({ children: [new Paragraph('')] }) },
    footers: { default: footer(data), first: new Footer({ children: [new Paragraph('')] }) },
    children,
  };
}

/** The document model (exposed for tests); `buildAcceptanceReport` packs it. */
export function buildDocument(input: ReportDataInput): Document {
  const data = ReportData.parse(input);
  return new Document({
    creator: data.meta.generatedBy.name,
    title: `Site Information Document – ${data.siteData.siteName ?? data.site.name}`,
    description: `Acceptance report v${data.meta.version} for ${data.site.code}`,
    styles: {
      default: {
        document: { run: { font: { ascii: THEME.font, hAnsi: THEME.font, cs: THEME.arabicFont }, size: 22 }, paragraph: { spacing: { after: 120, line: 259 } } },
        heading1: { run: { font: THEME.headingFont, bold: true, underline: {}, size: 28, color: '000000' }, paragraph: { spacing: { before: 240, after: 160 } } },
        heading2: { run: { font: THEME.headingFont, bold: true, size: 24, color: THEME.accent }, paragraph: { spacing: { before: 200, after: 100 } } },
      },
    },
    numbering: {
      config: [
        {
          reference: NUMBERING_REF,
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 450, hanging: 360 } }, run: { font: THEME.headingFont, bold: true, size: 28 } } }],
        },
      ],
    },
    sections: [
      section(data, [...buildCover(data), ...buildContents(), ...buildSiteData(data), ...buildFacilitySurvey(data), ...buildLayouts(data), ...buildLld(data), ...buildFiberConnectivity(data), ...buildPowerConnectivity(data), ...buildBom(data)], { titlePage: true }),
      section(data, [...buildOdf(data), ...buildFiberTests(data)], { landscape: true }),
      section(data, [...buildConfig(data), ...buildChecklist(data), ...buildGallery(data), ...buildReportInfo(data)]),
    ],
  });
}

/** Build the SID-style acceptance report (.docx) from validated report data. Pure: no I/O. */
export async function buildAcceptanceReport(input: ReportDataInput): Promise<Buffer> {
  return Packer.toBuffer(buildDocument(input));
}
