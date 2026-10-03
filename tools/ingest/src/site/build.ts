import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { SiteSeed } from '../schemas.js';
import { crossCheck } from './checks.js';
import { parseFiberTestSheet } from './fiberTest.js';
import { parseShowInventoryFile } from './inventory.js';
import { parseLldFile } from './lld.js';
import { parsePortMappingSheet, parseUtilizationSheet } from './mapping.js';
import { parseSidFile } from './sid.js';

async function files(dir: string, re: RegExp): Promise<string[]> {
  const names = await readdir(dir).catch(() => [] as string[]);
  return names.filter((n) => re.test(n)).sort().map((n) => path.join(dir, n));
}

export interface BuildSiteOptions {
  /** folder containing the inventory txt, LLD/, Mapping Sheet/, Fiber Test/ and the SID docx */
  siteDir: string;
  siteId: string;
  /** reported as `sourceFolder` (relative to the raw root) */
  sourceFolder: string;
}

/** Assemble and validate the full site seed from the site's source files. */
export async function buildSiteSeed(opts: BuildSiteOptions): Promise<SiteSeed> {
  const { siteDir } = opts;
  const [invFile] = await files(siteDir, /show inventory.*\.txt$/i);
  const [lldFile] = await files(path.join(siteDir, 'LLD'), /\.docx$/i);
  const [sidFile] = await files(siteDir, /SID.*\.docx$/i);
  if (!invFile || !lldFile || !sidFile) throw new Error(`Missing inventory/LLD/SID file in ${siteDir}`);

  const mappingDir = path.join(siteDir, 'Mapping Sheet');
  const portMapFiles = await files(mappingDir, /odf mapping\.xlsx$/i);
  const utilFiles = await files(mappingDir, /utilization sheet\s*\.xlsx$/i);
  const fiberFiles = await files(path.join(siteDir, 'Fiber Test'), /\.xlsx$/i);

  const inventory = await parseShowInventoryFile(invFile);
  const sid = await parseSidFile(sidFile);
  const lld = await parseLldFile(lldFile);
  const portMap = (await Promise.all(portMapFiles.map(parsePortMappingSheet))).flat();
  const utilization = await Promise.all(utilFiles.map(parseUtilizationSheet));
  const fiberTests = await Promise.all(fiberFiles.map(parseFiberTestSheet));

  const chassis = inventory.entries.find((e) => e.kind === 'chassis') ?? null;
  const summary: Record<string, number> = {};
  for (const e of inventory.entries) summary[e.kind] = (summary[e.kind] ?? 0) + 1;

  const seed = {
    siteId: opts.siteId,
    sourceFolder: opts.sourceFolder,
    siteData: sid.siteData,
    device: {
      hostname: inventory.hostname,
      platform: chassis?.pid ?? null,
      chassisSerial: chassis?.sn ?? null,
      modules: inventory.entries.filter((e) => e.kind !== 'transceiver'),
      transceivers: inventory.entries.filter((e) => e.kind === 'transceiver'),
    },
    inventorySummary: summary,
    lld,
    portMap,
    utilization,
    fiberTests,
    sidBom: sid.bom,
    passivePower: sid.passivePower,
    telcoPassive: sid.telcoPassive,
  };
  return SiteSeed.parse({ ...seed, warnings: crossCheck(seed) });
}
