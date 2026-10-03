import ExcelJS from 'exceljs';

export type Cell = string | number | null;

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return v.trim() === '' ? null : v.trim();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result as ExcelJS.CellValue);
    if ('richText' in v) return cellValue(v.richText.map((r) => r.text).join(''));
    if ('text' in v) return cellValue(String(v.text));
  }
  return String(v);
}

/** Read the first worksheet into a dense row-major grid (row 0 = sheet row 1). Merged cells repeat the master value. */
export async function readGrid(file: string): Promise<Cell[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error(`No worksheet in ${file}`);
  const grid: Cell[][] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row: Cell[] = [];
    for (let c = 1; c <= ws.columnCount; c++) row.push(cellValue(ws.getCell(r, c).value));
    grid.push(row);
  }
  return grid;
}

export const str = (c: Cell | undefined): string | null =>
  c === null || c === undefined ? null : String(c).trim() || null;
