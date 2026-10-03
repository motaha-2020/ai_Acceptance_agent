import { describe, expect, it } from 'vitest';
import { buildAcceptanceReport, convertDocxToPdf, findSoffice, PdfConversionError } from '../src/index.js';
import { fixture } from './fixture.js';

describe('findSoffice', () => {
  it('honours SOFFICE_PATH and returns null when it does not exist', () => {
    expect(findSoffice({ SOFFICE_PATH: '/definitely/not/here/soffice' })).toBeNull();
  });
  it('convertDocxToPdf fails clearly without LibreOffice', async () => {
    await expect(convertDocxToPdf(new Uint8Array([1]), { sofficePath: undefined, ...(findSoffice() ? { sofficePath: '/nope/soffice' } : {}) })).rejects.toBeInstanceOf(Error);
    if (!findSoffice()) await expect(convertDocxToPdf(new Uint8Array([1]))).rejects.toBeInstanceOf(PdfConversionError);
  });
});

// Runs only where LibreOffice is installed (worker image / CI with soffice); skipped locally.
describe.skipIf(!findSoffice())('convertDocxToPdf (LibreOffice)', () => {
  it('converts the generated report to a PDF', async () => {
    const pdf = await convertDocxToPdf(await buildAcceptanceReport(fixture()));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(10_000);
  }, 180_000);
});
