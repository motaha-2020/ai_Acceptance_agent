import { describe, expect, it } from 'vitest';
import { formatBytes, isBuilding } from '@/features/reports/reports-api';
import { reportStrings } from '@/features/reports/report-strings';
import { readinessOf } from '@/features/reports/reports-page';

describe('reports feature helpers', () => {
  it('polls only while the newest report is queued or running', () => {
    expect(isBuilding(undefined)).toBe(false);
    expect(isBuilding({ status: 'queued' } as never)).toBe(true);
    expect(isBuilding({ status: 'running' } as never)).toBe(true);
    expect(isBuilding({ status: 'ready' } as never)).toBe(false);
  });
  it('formats file sizes', () => {
    expect(formatBytes(null)).toBe('');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1_958_388)).toBe('1.9 MB');
  });
  it('has the same strings in Arabic and English', () => {
    expect(Object.keys(reportStrings('ar')).sort()).toEqual(Object.keys(reportStrings('en')).sort());
    expect(reportStrings('ar').final).toBe('نهائي');
  });
  it('final report needs approved photos, nothing pending and no open snags', () => {
    expect(readinessOf({ approved: 3, pending: 0, openSnags: 0 })).toBe('ready');
    expect(readinessOf({ approved: 3, pending: 1, openSnags: 0 })).toBe('inProgress');
    expect(readinessOf({ approved: 3, pending: 0, openSnags: 1 })).toBe('blocked');
  });
});
