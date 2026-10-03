import type { FiberRef } from '@acceptance/parsers';
import type { ReportData } from '../data.js';
import { dataTable, note, para, sectionHeading, subHeading, type Block } from '../docx/primitives.js';
import { headingOf } from './titles.js';

/**
 * An LLD often covers several routers of the exchange; the SID shows only this site's device.
 * Rows are kept when the site hostname is unknown or no row mentions it.
 */
export function lldForSite(data: ReportData): NonNullable<ReportData['lld']> | null {
  const lld = data.lld;
  const host = data.siteData.hostname;
  if (!lld || !host) return lld;
  const links = lld.internalLinks.filter((l) => l.parentRouter === host || l.childRouter === host);
  const install = lld.install.filter((r) => r.hostname === host);
  return { ...lld, internalLinks: links.length ? links : lld.internalLinks, install: install.length ? install : lld.install };
}

export const fiberRefText = (r: FiberRef | null): string => (r ? `ODF ${r.odf} - ${r.panel}(${r.fibers.join(',')})` : '');

/** LLD: header info, Install table and new Internal Links (same columns as the SID). */
export function buildLld(data: ReportData): Block[] {
  const blocks: Block[] = [sectionHeading(`${headingOf('lld')}.`, { pageBreakBefore: true }), subHeading('Low Level Design (LLD):')];
  const lld = lldForSite(data);
  if (!lld) return [...blocks, note('No LLD document imported for this site.')];
  const header = [lld.title, lld.site ? `Site: ${lld.site}` : null, lld.author ? `Author: ${lld.author}` : null, lld.date ? `Date: ${lld.date}` : null].filter(Boolean).join('   ·   ');
  if (header) blocks.push(para(header, { size: 20 }));
  blocks.push(subHeading('Install:'));
  blocks.push(
    lld.install.length
      ? dataTable(
          [{ header: 'Hostname', weight: 3240 }, { header: 'Router Function', weight: 2340 }, { header: 'Node', weight: 2700 }, { header: 'Type', weight: 1080 }, { header: 'Project', weight: 1350 }],
          lld.install.map((r) => [r.hostname, r.routerFunction, r.node, r.type, r.project]),
        )
      : note('No install rows.'),
  );
  blocks.push(subHeading('Internal Links'), para('New', { bold: true, size: 20 }));
  blocks.push(
    lld.internalLinks.length
      ? dataTable(
          [{ header: 'Parent Router', weight: 3240 }, { header: 'Parent Interface', weight: 2340 }, { header: 'Child Router', weight: 2700 }, { header: 'Child Interface', weight: 1710 }, { header: 'Cost', weight: 720, align: 'center' }],
          lld.internalLinks.map((l) => [l.parentRouter, l.parentInterface, l.childRouter, l.childInterface, l.cost]),
        )
      : note('No internal links.'),
  );
  return blocks;
}

/** Fiber connectivity: uplinks from the port mapping (the SID shows a drawing here). */
export function buildFiberConnectivity(data: ReportData): Block[] {
  const blocks: Block[] = [sectionHeading(`${headingOf('fiber')}:`)];
  const uplinks = data.portMap.filter((r) => r.uplink);
  if (!data.portMap.length) return [...blocks, note('No ODF port mapping imported for this site.')];
  blocks.push(para(`${data.portMap.length} router ports mapped to ODFs, ${uplinks.length} uplinks.`, { size: 20 }));
  if (uplinks.length) {
    blocks.push(
      dataTable(
        [{ header: 'Local port', weight: 2 }, { header: 'Peer device', weight: 3 }, { header: 'Peer port', weight: 2 }, { header: 'Cross connect', weight: 3 }, { header: 'Tie', weight: 3 }],
        uplinks.map((r) => [r.port, r.uplink!.peerDevice, r.uplink!.peerPort, fiberRefText(r.cc), fiberRefText(r.tie)]),
      ),
    );
  }
  return blocks;
}

/** Power connectivity: power trays/modules from the inventory (the SID shows a drawing here). */
export function buildPowerConnectivity(data: ReportData): Block[] {
  const blocks: Block[] = [sectionHeading(headingOf('power'))];
  const power = (data.inventory?.entries ?? []).filter((e) => e.kind === 'power_tray' || e.kind === 'power_module');
  if (!power.length) return [...blocks, note('No power modules found (device inventory not imported).')];
  blocks.push(
    dataTable(
      [{ header: 'Slot', weight: 2 }, { header: 'Part Number', weight: 3 }, { header: 'S/N', weight: 3 }, { header: 'Description', weight: 5 }],
      power.map((e) => [e.name, e.pid, e.sn, e.descr]),
    ),
  );
  return blocks;
}

/** Configuration file: device identity; the running configuration itself is not stored by the system. */
export function buildConfig(data: ReportData): Block[] {
  const sd = data.siteData;
  return [
    sectionHeading(`${headingOf('config')}:`),
    subHeading('Configuration for new Box'),
    dataTable(
      [{ header: 'Item', weight: 2 }, { header: 'Value', weight: 5 }],
      [
        ['Hostname', sd.hostname ?? data.inventory?.hostname ?? '—'],
        ['Loopback IP', sd.loopbackIp ?? '—'],
        ['Source of management', sd.managementSource ?? '—'],
        ['Platform', sd.deviceModel ?? '—'],
        ['Inventory captured', data.inventory?.capturedAt ?? '—'],
      ],
    ),
    note('The running configuration file is attached separately; it is not embedded by the system.'),
  ];
}
