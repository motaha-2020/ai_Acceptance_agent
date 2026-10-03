import type { ReportData } from '../data.js';
import { dataTable, labelValueTable, note, para, sectionHeading, subHeading, type Block } from '../docx/primitives.js';
import { lldForSite } from './network.js';
import { headingOf } from './titles.js';

const v = (s: string | null | undefined): string => (s && s.trim() ? s.trim() : '—');
const join = (parts: (string | null)[], sep: string): string => parts.filter((p): p is string => !!p && !!p.trim()).join(sep) || '—';

/** Label/value pairs of the SID "Basic Information of Site/Device" grid, in SID order. */
export function siteDataPairs(data: ReportData): [string, string][] {
  const sd = data.siteData;
  return [
    ['Site Name:', v(sd.siteName ?? data.site.name)],
    ['Sector/City/Region:', v(sd.region)],
    ['Room Name / Floor:', v(sd.room)],
    ['Area/No# Racks:', v(sd.racks)],
    ['Project Name:', v(sd.project ?? data.project.name)],
    ['Device Brand/Type/SN', `${join([sd.deviceBrand, sd.deviceModel], '/')}\n${v(sd.deviceSerial)}`],
    ['Device Hostname/ loop Back IP', `${v(sd.hostname)}\n${v(sd.loopbackIp)}`],
    ['Source of Management:', v(sd.managementSource)],
    ['Type of installation:', v(sd.installationType)],
    ['GPS coordinates', v(sd.gps)],
    ['Contract Number', v(sd.contractNumber)],
    ['Announcement Date:', v(sd.announcementDate)],
    ['Installation date:', v(sd.installationDate)],
    ['Contractor Name:', v(sd.contractor)],
  ];
}

export function buildSiteData(data: ReportData): Block[] {
  return [sectionHeading(`${headingOf('siteData')}:`), labelValueTable('Basic Information of Site/Device:', siteDataPairs(data)), para('')];
}

/** Facility survey: the manual survey answers captured for the site (the SID embeds a survey file here). */
export function buildFacilitySurvey(data: ReportData): Block[] {
  const answers = Object.entries(data.survey).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }));
  const blocks: Block[] = [sectionHeading(`${headingOf('survey')}:`, { pageBreakBefore: true }), subHeading('Survey Report')];
  if (!answers.length) {
    blocks.push(note('No facility survey answers were recorded for this site. Survey items appear as "N/A – manual" in the Acceptance check list.'));
    return blocks;
  }
  blocks.push(dataTable([{ header: 'Item', weight: 1, align: 'center' }, { header: 'Answer', weight: 3 }, { header: 'Comment', weight: 4 }], answers.map(([id, a]) => [id, a.value, a.comment ?? ''])));
  return blocks;
}

/** Layouts: no drawings are managed by the system; rack utilization comes from the LLD/inventory. */
export function buildLayouts(data: ReportData): Block[] {
  const blocks: Block[] = [
    sectionHeading(`${headingOf('layouts')}:`),
    subHeading('Switching room:'),
    note('Room layout drawing is not managed by the system; see the Rack photos in the Photo Gallery.'),
    subHeading('Test room:'),
    note('See the Test room photos in the Photo Gallery.'),
    subHeading('Rack Utilization:'),
  ];
  const install = lldForSite(data)?.install ?? [];
  const rows = install.length
    ? install.map((r) => [r.hostname, r.routerFunction, r.node ?? '', r.type ?? data.siteData.deviceModel ?? ''])
    : data.siteData.hostname
      ? [[data.siteData.hostname, 'PE Router', '', data.siteData.deviceModel ?? '']]
      : [];
  blocks.push(para(`Racks: ${v(data.siteData.racks)}`, { size: 20 }));
  if (rows.length) {
    blocks.push(dataTable([{ header: 'Hostname', weight: 3 }, { header: 'Function', weight: 2 }, { header: 'Node', weight: 2 }, { header: 'Type', weight: 2 }], rows));
  } else {
    blocks.push(note('No installed devices recorded.'));
  }
  return blocks;
}
