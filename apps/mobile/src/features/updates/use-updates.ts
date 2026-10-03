import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Updates from 'expo-updates';
import { appConfig } from '../../config';
import { AppReleaseDto } from '../../lib/api/schemas';
import { isCaptureBusy, onCaptureBusyChange } from '../capture/busy';
import { decideOtaAction, evaluateGate, pickReleaseInfo, shouldCheckOnResume, type GateDecision, type ReleaseInfo } from './policy';

const RELEASE_CACHE_KEY = 'release.latest.v1';

async function fetchLatestRelease(): Promise<{ ok: true; release: ReleaseInfo | null } | { ok: false }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${appConfig.apiBaseUrl}/api/v1/app/releases/latest?channel=${appConfig.channel}`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (res.status === 404) return { ok: true, release: null };
    if (!res.ok) return { ok: false };
    const parsed = AppReleaseDto.safeParse(await res.json());
    return parsed.success ? { ok: true, release: parsed.data } : { ok: false };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

async function readCache(): Promise<ReleaseInfo | null> {
  try {
    const raw = await SecureStore.getItemAsync(RELEASE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as ReleaseInfo) : null;
  } catch {
    return null;
  }
}

/** Native forced-update gate (T5.8): checked on launch and on every resume. */
export function useReleaseGate(): { decision: GateDecision; recheck: () => Promise<void> } {
  const [decision, setDecision] = useState<GateDecision>({ kind: 'ok' });
  const recheck = useCallback(async () => {
    const [fetched, cached] = await Promise.all([fetchLatestRelease(), readCache()]);
    const info = pickReleaseInfo(fetched, cached);
    if (fetched.ok) {
      await (fetched.release
        ? SecureStore.setItemAsync(RELEASE_CACHE_KEY, JSON.stringify(fetched.release))
        : SecureStore.deleteItemAsync(RELEASE_CACHE_KEY)
      ).catch(() => undefined);
    }
    setDecision(evaluateGate({ versionCode: appConfig.nativeVersionCode, runtimeVersion: appConfig.runtimeVersion }, info));
  }, []);

  useEffect(() => {
    void recheck();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void recheck();
    });
    return () => sub.remove();
  }, [recheck]);

  return { decision, recheck };
}

export type OtaStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'up_to_date' | 'error' | 'disabled';

/**
 * OTA updates (T5.7). expo-updates checks natively on launch (checkAutomatically=ON_LOAD) and
 * stages the download for the next start; here we also check on resume (throttled), apply critical
 * updates right away (after the camera closes) and expose a manual "check now".
 */
export function useOtaUpdates(): { status: OtaStatus; checkNow: () => Promise<void>; restart: () => Promise<void> } {
  const enabled = Updates.isEnabled && !__DEV__;
  const [status, setStatus] = useState<OtaStatus>(enabled ? 'idle' : 'disabled');
  const lastCheck = useRef<number | null>(null);
  const reloadWhenIdle = useRef(false);

  const restart = useCallback(async () => {
    await Updates.reloadAsync();
  }, []);

  const check = useCallback(
    async (manual: boolean) => {
      if (!enabled) return;
      if (!manual && !shouldCheckOnResume(lastCheck.current, Date.now())) return;
      lastCheck.current = Date.now();
      setStatus('checking');
      try {
        const result = await Updates.checkForUpdateAsync();
        const action = decideOtaAction(
          { isAvailable: result.isAvailable, isRollBackToEmbedded: result.isRollBackToEmbedded, extra: result.manifest && 'extra' in result.manifest ? result.manifest.extra : undefined },
          isCaptureBusy(),
        );
        if (action === 'none') {
          setStatus('up_to_date');
          return;
        }
        setStatus('downloading');
        await Updates.fetchUpdateAsync();
        setStatus('ready');
        if (action === 'reload_now') await Updates.reloadAsync();
        if (action === 'reload_when_idle') reloadWhenIdle.current = true;
      } catch {
        setStatus('error');
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) return;
    void check(false);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void check(false);
    });
    const busySub = onCaptureBusyChange((busy) => {
      if (!busy && reloadWhenIdle.current) void Updates.reloadAsync();
    });
    return () => {
      sub.remove();
      busySub();
    };
  }, [enabled, check]);

  return { status, checkNow: () => check(true), restart };
}

export interface OtaState {
  status: OtaStatus;
  checkNow: () => Promise<void>;
  restart: () => Promise<void>;
}

export const OtaContext = createContext<OtaState>({ status: 'disabled', checkNow: async () => undefined, restart: async () => undefined });

export function useOta(): OtaState {
  return useContext(OtaContext);
}
