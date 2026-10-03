import type { AppReleaseDto } from '@acceptance/shared';

/**
 * Update policy (pure, unit-tested):
 *  - native gate: an installed build below the server's `minSupportedVersionCode` is blocked and
 *    must install the new APK (native changes cannot ship over the air);
 *  - OTA: JS updates download in the background and apply on the next start, or immediately when
 *    the update is flagged critical (but never in the middle of a capture).
 */
export type ReleaseInfo = Pick<
  AppReleaseDto,
  'version' | 'versionCode' | 'runtimeVersion' | 'minSupportedVersionCode' | 'minSupportedVersion' | 'downloadUrl' | 'isCritical' | 'notes'
>;

export type GateDecision =
  | { kind: 'ok' }
  | { kind: 'update_available'; release: ReleaseInfo }
  | { kind: 'blocked'; release: ReleaseInfo };

export interface InstalledBuild {
  versionCode: number;
  runtimeVersion: string;
}

export function evaluateGate(installed: InstalledBuild, release: ReleaseInfo | null): GateDecision {
  if (!release) return { kind: 'ok' };
  if (installed.versionCode < release.minSupportedVersionCode) return { kind: 'blocked', release };
  if (release.versionCode > installed.versionCode) return { kind: 'update_available', release };
  return { kind: 'ok' };
}

/**
 * Which release info to trust: a fresh server answer wins; offline we fall back to the last one
 * we saw so a blocked build stays blocked without network. Unknown (never online) = allowed, so
 * field work is never stopped by a missing connection.
 */
export function pickReleaseInfo(
  fetched: { ok: true; release: ReleaseInfo | null } | { ok: false },
  cached: ReleaseInfo | null,
): ReleaseInfo | null {
  return fetched.ok ? fetched.release : cached;
}

export type OtaAction = 'none' | 'apply_on_next_start' | 'reload_now' | 'reload_when_idle';

export interface OtaCheck {
  isAvailable: boolean;
  isRollBackToEmbedded?: boolean;
  /** `manifest.extra` of the new update (from our update server). */
  extra?: unknown;
}

export function isCriticalUpdate(extra: unknown): boolean {
  return typeof extra === 'object' && extra !== null && (extra as { critical?: unknown }).critical === true;
}

export function decideOtaAction(check: OtaCheck, busy: boolean): OtaAction {
  if (check.isRollBackToEmbedded) return busy ? 'reload_when_idle' : 'reload_now';
  if (!check.isAvailable) return 'none';
  if (!isCriticalUpdate(check.extra)) return 'apply_on_next_start';
  return busy ? 'reload_when_idle' : 'reload_now';
}

/** Re-evaluate a reload decision after the download finished: never reload under an open camera. */
export function settleReload(action: OtaAction, busyNow: boolean): OtaAction {
  return action === 'reload_now' && busyNow ? 'reload_when_idle' : action;
}

/** Throttle OTA checks on resume (launch always checks natively via checkAutomatically=ON_LOAD). */
export function shouldCheckOnResume(lastCheckAt: number | null, now: number, minIntervalMs = 15 * 60_000): boolean {
  return lastCheckAt === null || now - lastCheckAt >= minIntervalMs;
}
