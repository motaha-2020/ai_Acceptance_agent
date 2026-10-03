/** The 12 SID sections in document order: heading text and the "Content:" list wording. */
export const SECTIONS = [
  { key: 'siteData', heading: 'Site Data', contents: 'Site Data.' },
  { key: 'survey', heading: 'Facility Survey Report', contents: 'Facility Survey Report.' },
  { key: 'layouts', heading: 'Layouts', contents: 'Layouts.' },
  { key: 'lld', heading: 'LLD', contents: 'LLD.' },
  { key: 'fiber', heading: 'Fiber Connectivity', contents: 'Fiber Connectivity.' },
  { key: 'power', heading: 'Power Connectivity', contents: 'Power Connectivity.' },
  { key: 'bom', heading: 'Site BOM', contents: 'Site BOM (including active and passive).' },
  { key: 'odf', heading: 'ODF utilization and port mapping', contents: 'ODF utilization and port mapping.' },
  { key: 'tests', heading: 'Fiber connectivity and splicing test results', contents: 'Fiber connectivity.' },
  { key: 'config', heading: 'Configuration file', contents: 'Configuration file.' },
  { key: 'checklist', heading: 'Acceptance check list', contents: 'Acceptance check list.' },
  { key: 'gallery', heading: 'Photo Gallery', contents: 'Photo Gallery.' },
] as const;

export type SectionKey = (typeof SECTIONS)[number]['key'];

export function headingOf(key: SectionKey): string {
  return SECTIONS.find((s) => s.key === key)!.heading;
}
