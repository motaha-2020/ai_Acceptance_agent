import type { SiteSeed } from './schemas.js';
import { shortPort } from './ports.js';

type Seed = Omit<SiteSeed, 'warnings'>;

/** Which sources are present; checks comparing two sources only run when both exist. */
export interface CheckPresence {
  inventory: boolean;
  bom: boolean;
  lld: boolean;
  portMap: boolean;
  siteData: boolean;
}

const ALL_PRESENT: CheckPresence = { inventory: true, bom: true, lld: true, portMap: true, siteData: true };

const LOSS_WARN_DB = 3;

function validIpv4(s: string): boolean {
  const p = s.split('.');
  return p.length === 4 && p.every((x) => /^\d{1,3}$/.test(x) && Number(x) <= 255);
}

/** Cross-source consistency checks. Returns human-readable warnings; never throws. */
export function crossCheck(seed: Seed, present: CheckPresence = ALL_PRESENT): string[] {
  const w: string[] = [];

  // 1. inventory serials vs SID BOM serials
  if (present.inventory && present.bom) {
  const invSerials = new Set(seed.device.modules.concat(seed.device.transceivers).map((e) => e.sn));
  const bomSerials = new Set(seed.sidBom.flatMap((b) => b.serials));
  const missingInBom = [...invSerials].filter((s) => !bomSerials.has(s));
  const missingInInv = [...bomSerials].filter((s) => !invSerials.has(s));
  if (missingInBom.length) w.push(`inventory serials not in SID BOM (${missingInBom.length}): ${missingInBom.slice(0, 8).join(', ')}`);
  if (missingInInv.length) w.push(`SID BOM serials not in inventory (${missingInInv.length}): ${missingInInv.slice(0, 8).join(', ')}`);
  for (const b of seed.sidBom) {
    if (b.serials.length && b.serials.length !== b.qty) {
      w.push(`SID BOM ${b.partNumber}: qty=${b.qty} but ${b.serials.length} serials listed`);
    }
  }

  }

  // 2. LLD internal links vs port-mapping uplinks
  if (present.lld && present.portMap) {
  const portRows = new Map(seed.portMap.map((r) => [r.port, r]));
  for (const l of seed.lld.internalLinks.filter((x) => x.parentRouter === seed.device.hostname)) {
    const up = portRows.get(shortPort(l.parentInterface))?.uplink;
    if (!up) w.push(`LLD link ${l.parentInterface} -> ${l.childRouter} ${l.childInterface} has no UPLINK entry in mapping sheet`);
    else if (up.peerDevice !== l.childRouter || up.peerPort !== shortPort(l.childInterface)) {
      w.push(`LLD vs mapping mismatch on ${l.parentInterface}: LLD ${l.childRouter} ${l.childInterface}, mapping ${up.peerDevice} ${up.peerPort}`);
    }
  }
  for (const r of seed.portMap.filter((x) => x.uplink)) {
    const hit = seed.lld.internalLinks.some(
      (l) => l.parentRouter === seed.device.hostname && shortPort(l.parentInterface) === r.port,
    );
    if (!hit) w.push(`mapping uplink on ${r.port} is not in LLD internal links`);
  }

  }

  // 3. port map vs utilization grids
  const util = new Map<string, string | null>();
  for (const u of seed.utilization) for (const e of u.entries) util.set(`${u.kind}:${u.odf}:${e.panel}:${e.fiber}`, e.port);
  for (const r of seed.portMap) {
    for (const [kind, ref] of [['CC', r.cc], ['TIE', r.tie]] as const) {
      if (!ref) continue;
      for (const f of ref.fibers) {
        const key = `${kind}:${ref.odf}:${ref.panel}:${f}`;
        if (!util.has(key)) continue; // utilization sheet for that ODF not provided
        if (util.get(key) !== r.port) {
          w.push(`${kind} ODF${ref.odf} ${ref.panel}${f}: mapping says ${r.port}, utilization sheet says ${util.get(key) ?? 'empty'}`);
        }
      }
    }
  }

  // 4. mapped ports without an installed transceiver
  if (present.inventory && present.portMap) {
  const installed = new Set(seed.device.transceivers.map((t) => shortPort(t.name)));
  const noOptic = seed.portMap.filter((r) => !installed.has(r.port)).map((r) => r.port);
  if (noOptic.length) w.push(`mapped ports with no transceiver in inventory (${noOptic.length}): ${noOptic.join(', ')}`);

  }

  // 5. fiber loss outliers
  for (const t of seed.fiberTests) {
    for (const m of t.measurements.filter((x) => x.lossDb > LOSS_WARN_DB)) {
      w.push(`fiber test ODF${t.odf ?? '?'} panel ${m.panel} fibers ${m.fibers.join(',')} ${m.direction ?? ''}: loss ${m.lossDb} dB (> ${LOSS_WARN_DB} dB)`);
    }
  }

  // 5b. impossible (negative) readings and sheets that are copies of each other
  for (const t of seed.fiberTests) {
    for (const m of t.measurements.filter((x) => x.lossDb < 0)) {
      w.push(`fiber test ODF${t.odf ?? '?'} panel ${m.panel} fibers ${m.fibers.join(',')} ${m.direction ?? ''}: negative loss ${m.lossDb} dB`);
    }
  }
  const seen = new Map<string, number | null>();
  for (const t of seed.fiberTests) {
    const sig = JSON.stringify(t.measurements);
    const prev = seen.get(sig);
    if (prev !== undefined) w.push(`fiber test ODF${t.odf ?? '?'} has measurements identical to ODF${prev ?? '?'} (likely copied sheet)`);
    else seen.set(sig, t.odf);
  }

  // 6. malformed IPv4 literals in SID fields
  for (const [k, v] of Object.entries(seed.siteData.raw)) {
    for (const ip of v.match(/\b\d+\.\d+\.\d+\.\d+\b/g) ?? []) {
      if (!validIpv4(ip)) w.push(`SID field "${k}" contains invalid IPv4 "${ip}"`);
    }
  }

  // 7. SID site data vs inventory / LLD
  if (!present.siteData || !present.inventory) return w;
  const sidSerial = seed.siteData.deviceSerial;
  if (sidSerial && seed.device.chassisSerial && sidSerial !== seed.device.chassisSerial) {
    w.push(`SID device serial ${sidSerial} != inventory chassis serial ${seed.device.chassisSerial}`);
  }
  if (seed.siteData.hostname && seed.siteData.hostname !== seed.device.hostname) {
    w.push(`SID hostname ${seed.siteData.hostname} != inventory hostname ${seed.device.hostname}`);
  }
  return w;
}
