import { fileText, type FileInput } from './input.js';

import type { Inventory, InventoryEntry } from './schemas.js';
import { slotOfInterface } from './ports.js';

type Entry = InventoryEntry;

function classify(name: string, pid: string, descr: string): { kind: Entry['kind']; slot: string | null } {
  const ifSlot = slotOfInterface(name);
  if (ifSlot) return { kind: 'transceiver', slot: ifSlot };
  if (/^Rack\s/i.test(name)) return { kind: 'chassis', slot: null };
  if (/RSP/i.test(pid) || /Route Switch Processor/i.test(descr)) return { kind: 'route_processor', slot: name };
  if (/line card/i.test(descr)) return { kind: 'line_card', slot: name };
  if (/Fabric Card/i.test(descr) || /\/FC\d+$/.test(name)) return { kind: 'fabric_card', slot: name };
  if (/Fan Tray/i.test(descr) || /\/FT\d+$/.test(name)) return { kind: 'fan_tray', slot: name };
  if (/-PM\d+$/.test(name)) return { kind: 'power_module', slot: name };
  if (/\/PT\d+$/.test(name)) return { kind: 'power_tray', slot: name };
  return { kind: 'other', slot: null };
}

/** Parse Cisco IOS-XR `show inventory` text (NAME/DESCR + PID/VID/SN blocks). */
export function parseShowInventory(text: string): Inventory {
  const lines = text.split(/\r?\n/);
  const promptLine = lines.find((l) => /#\s*show inventory/i.test(l)) ?? '';
  const hostname = /(?::|^)([A-Za-z0-9._-]+)#\s*show inventory/i.exec(promptLine)?.[1] ?? '';
  const capturedAt = lines.find((l) => /^[A-Z][a-z]{2} [A-Z][a-z]{2} +\d+ \d\d:\d\d:\d\d/.test(l))?.trim() ?? null;

  const entries: Entry[] = [];
  let pending: { name: string; descr: string } | null = null;
  for (const line of lines) {
    const head = /^NAME:\s*"([^"]*)"\s*,\s*DESCR:\s*"([^"]*)"/.exec(line);
    if (head) {
      pending = { name: head[1]!, descr: head[2]! };
      continue;
    }
    const detail = /^PID:\s*(\S*)\s*,\s*VID:\s*(\S*)\s*,\s*SN:\s*(\S*)/.exec(line);
    if (detail && pending) {
      const { kind, slot } = classify(pending.name, detail[1]!, pending.descr);
      entries.push({
        name: pending.name,
        descr: pending.descr,
        pid: detail[1]!,
        vid: detail[2] || null,
        sn: detail[3]!,
        kind,
        slot,
      });
      pending = null;
    }
  }
  return { hostname, capturedAt, entries };
}

export async function parseShowInventoryFile(file: FileInput): Promise<Inventory> {
  return parseShowInventory(await fileText(file));
}
