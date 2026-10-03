import type { PassiveItem } from '@acceptance/parsers';
import type { ReportData } from '../data.js';
import { dataTable, note, sectionHeading, subHeading, type Block } from '../docx/primitives.js';
import { headingOf } from './titles.js';

const passiveTable = (items: PassiveItem[]): Block =>
  dataTable(
    [{ header: 'Item Description', weight: 8650 }, { header: 'Unit', weight: 700, align: 'center' }, { header: 'Qty.', weight: 700, align: 'center' }],
    items.map((i) => [i.description, i.unit, i.qty]),
  );

/** Site BOM: active (S, Part Number, QTY, S/N) + passive power + telco passive, as in the SID. */
export function buildBom(data: ReportData): Block[] {
  const { active, activeSource, passivePower, telcoPassive } = data.bom;
  const blocks: Block[] = [sectionHeading(`${headingOf('bom')}:`, { pageBreakBefore: true }), subHeading('Active & Passive quantities:')];
  if (active.length) {
    blocks.push(
      dataTable(
        [{ header: 'S', weight: 460, align: 'center' }, { header: 'Part Number', weight: 2055 }, { header: 'QTY', weight: 625, align: 'center' }, { header: 'S/N', weight: 6000 }],
        active.map((b, i) => [i + 1, b.partNumber, b.qty, b.serials.join(', ')]),
        { size: 16 },
      ),
    );
    if (activeSource === 'inventory') blocks.push(note('Active BOM generated from the device `show inventory` (no delivered BOM imported).'));
  } else {
    blocks.push(note('No active BOM (import the SID BOM or the device inventory).'));
  }
  blocks.push(subHeading('Passive Power:'), passivePower.length ? passiveTable(passivePower) : note('No passive power items recorded.'));
  blocks.push(subHeading('Telco Passive:'), telcoPassive.length ? passiveTable(telcoPassive) : note('No telco passive items recorded.'));
  return blocks;
}
