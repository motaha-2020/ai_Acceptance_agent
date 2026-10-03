import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

interface Extra {
  apiBaseUrl?: string;
  updatesChannel?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/** Runtime configuration baked in at build time (app.config.ts) or delivered with an OTA update. */
export const appConfig = {
  apiBaseUrl: (extra.apiBaseUrl ?? 'http://178.104.221.75').replace(/\/+$/, ''),
  channel: (Updates.channel || extra.updatesChannel || 'production') as 'production' | 'staging',
  /** Native build (only changes with a new APK). */
  nativeVersion: Application.nativeApplicationVersion ?? '0.0.0',
  nativeVersionCode: Number.parseInt(Application.nativeBuildVersion ?? '0', 10) || 0,
  runtimeVersion: Updates.runtimeVersion ?? Constants.expoConfig?.version ?? '0.0.0',
};

export { ALLOWED_ROLES } from './lib/roles';
