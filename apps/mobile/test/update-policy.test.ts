import { describe, expect, it } from 'vitest';
import { decideOtaAction, evaluateGate, isCriticalUpdate, pickReleaseInfo, settleReload, shouldCheckOnResume, type ReleaseInfo } from '../src/features/updates/policy';

const release = (over: Partial<ReleaseInfo> = {}): ReleaseInfo => ({
  version: '1.2.0',
  versionCode: 12,
  runtimeVersion: '1.2.0',
  minSupportedVersionCode: 10,
  minSupportedVersion: '1.0.0',
  downloadUrl: 'http://example/api/v1/app/releases/x/download',
  isCritical: false,
  notes: null,
  ...over,
});

describe('forced update gate (native)', () => {
  it('blocks builds below the minimum supported versionCode', () => {
    expect(evaluateGate({ versionCode: 9, runtimeVersion: '1.0.0' }, release())).toMatchObject({ kind: 'blocked' });
  });
  it('offers (does not force) a newer build when still supported', () => {
    expect(evaluateGate({ versionCode: 10, runtimeVersion: '1.0.0' }, release())).toMatchObject({ kind: 'update_available' });
  });
  it('is ok on the latest build or when no release is known', () => {
    expect(evaluateGate({ versionCode: 12, runtimeVersion: '1.2.0' }, release())).toEqual({ kind: 'ok' });
    expect(evaluateGate({ versionCode: 1, runtimeVersion: '1.0.0' }, null)).toEqual({ kind: 'ok' });
  });
  it('uses the cached answer offline so a blocked build stays blocked', () => {
    const cached = release({ minSupportedVersionCode: 50 });
    expect(pickReleaseInfo({ ok: false }, cached)).toBe(cached);
    expect(pickReleaseInfo({ ok: true, release: null }, cached)).toBeNull();
    expect(evaluateGate({ versionCode: 12, runtimeVersion: '1.2.0' }, pickReleaseInfo({ ok: false }, cached)).kind).toBe('blocked');
  });
});

describe('OTA policy', () => {
  it('applies normal updates on next start, critical ones now (or when idle)', () => {
    expect(decideOtaAction({ isAvailable: false }, false)).toBe('none');
    expect(decideOtaAction({ isAvailable: true, extra: { critical: false } }, false)).toBe('apply_on_next_start');
    expect(decideOtaAction({ isAvailable: true, extra: { critical: true } }, false)).toBe('reload_now');
    expect(decideOtaAction({ isAvailable: true, extra: { critical: true } }, true)).toBe('reload_when_idle');
    expect(decideOtaAction({ isAvailable: false, isRollBackToEmbedded: true }, false)).toBe('reload_now');
  });
  it('defers a critical reload when the camera opened during the download', () => {
    expect(settleReload('reload_now', true)).toBe('reload_when_idle');
    expect(settleReload('reload_now', false)).toBe('reload_now');
    expect(settleReload('reload_when_idle', false)).toBe('reload_when_idle');
    expect(settleReload('apply_on_next_start', true)).toBe('apply_on_next_start');
  });
  it('detects the critical flag defensively', () => {
    expect(isCriticalUpdate(undefined)).toBe(false);
    expect(isCriticalUpdate({ critical: 'yes' })).toBe(false);
    expect(isCriticalUpdate({ critical: true })).toBe(true);
  });
  it('throttles checks on resume', () => {
    expect(shouldCheckOnResume(null, 0)).toBe(true);
    expect(shouldCheckOnResume(0, 10 * 60_000)).toBe(false);
    expect(shouldCheckOnResume(0, 15 * 60_000)).toBe(true);
  });
});
