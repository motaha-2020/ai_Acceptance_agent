import { existsSync } from 'node:fs';
import path from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Build-time configuration (read by `expo prebuild`, `expo export` and `expo config`).
 *
 *   API_BASE_URL       API origin baked into the build            (default http://178.104.221.75)
 *   APP_VERSION        user-visible version = OTA runtimeVersion  (default 1.0.0)
 *   APP_VERSION_CODE   Android versionCode, strictly increasing   (default 1)
 *   UPDATES_CHANNEL    expo-updates channel: production | staging (default production)
 *
 * runtimeVersion = APP_VERSION: bump APP_VERSION for every native change (new SDK/module/permission)
 * so old APKs never receive a JS bundle they cannot run; JS-only changes ship as OTA updates.
 * No EAS: APKs are built on the VPS (infra/scripts/build-apk.sh), OTA is served by our API.
 */
const API_BASE_URL = (process.env.API_BASE_URL ?? 'http://178.104.221.75').replace(/\/+$/, '');
const APP_VERSION = process.env.APP_VERSION ?? '1.0.0';
const APP_VERSION_CODE = Number.parseInt(process.env.APP_VERSION_CODE ?? '1', 10);
const UPDATES_CHANNEL = process.env.UPDATES_CHANNEL ?? 'production';

if (!/^\d+\.\d+\.\d+$/.test(APP_VERSION)) throw new Error(`APP_VERSION must look like 1.2.3, got ${APP_VERSION}`);
if (!Number.isInteger(APP_VERSION_CODE) || APP_VERSION_CODE < 1) throw new Error('APP_VERSION_CODE must be a positive integer');
if (!['production', 'staging'].includes(UPDATES_CHANNEL)) throw new Error('UPDATES_CHANNEL must be production or staging');

// Public half of the OTA code-signing key pair (the private key lives only on the server).
const CERT = './certs/ota-certificate.pem';
const hasCert = existsSync(path.join(__dirname, CERT));

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Acceptance Field',
  slug: 'acceptance-field',
  scheme: 'acceptance',
  version: APP_VERSION,
  runtimeVersion: APP_VERSION,
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  platforms: ['android'],
  android: {
    package: 'com.acceptance.field',
    versionCode: APP_VERSION_CODE,
    permissions: ['android.permission.CAMERA', 'android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION'],
    // Audit integrity: no gallery/storage access, no audio.
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ],
  },
  updates: {
    enabled: true,
    url: `${API_BASE_URL}/api/v1/updates/manifest`,
    // Check on every launch; download in the background, apply on the next start (or now if critical).
    checkAutomatically: 'ON_LOAD',
    fallbackToCacheTimeout: 0,
    requestHeaders: { 'expo-channel-name': UPDATES_CHANNEL },
    ...(hasCert ? { codeSigningCertificate: CERT, codeSigningMetadata: { keyid: 'main', alg: 'rsa-v1_5-sha256' } } : {}),
  },
  plugins: [
    'expo-router',
    [
      'expo-camera',
      { cameraPermission: 'يحتاج التطبيق إلى الكاميرا لتصوير أعمال التركيب', microphonePermission: false, recordAudioAndroid: false, barcodeScannerEnabled: false },
    ],
    [
      'expo-location',
      { locationWhenInUsePermission: 'يسجل التطبيق موقع التصوير لإثبات مكان العمل', isAndroidBackgroundLocationEnabled: false, isAndroidForegroundServiceEnabled: false },
    ],
    'expo-sqlite',
    'expo-secure-store',
    ['expo-localization', { supportsRTL: true }],
    'expo-background-task',
    [
      'expo-build-properties',
      {
        android: {
          // Production is plain HTTP until a domain + TLS exist (see apps/mobile/README.md).
          usesCleartextTraffic: API_BASE_URL.startsWith('http://'),
        },
      },
    ],
    './plugins/with-release-signing.js',
  ],
  experiments: { typedRoutes: false },
  extra: {
    apiBaseUrl: API_BASE_URL,
    updatesChannel: UPDATES_CHANNEL,
    otaSigned: hasCert,
  },
});
