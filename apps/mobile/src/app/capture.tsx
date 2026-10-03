import { PhotoCategory } from '@acceptance/shared';
import { getChecklist } from '@acceptance/checklist';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../app-context';
import { appConfig } from '../config';
import { setCaptureBusy } from '../features/capture/busy';
import { persistCapture } from '../features/capture/photo-files';
import type { GpsFix } from '../features/queue/queue-store';
import { currentLang } from '../lib/i18n';
import { Body, Button, styles as ui } from '../ui/components';
import { colors } from '../ui/theme';

/** A fix older than this is not attached to a photo (the technician may have moved). */
const MAX_GPS_AGE_MS = 2 * 60_000;

/**
 * Camera-only capture (no gallery import, for audit integrity). Each shot is stamped with capture
 * time, GPS and device info, moved to private app storage and queued for upload before the
 * technician can take the next one.
 */
export default function CaptureScreen() {
  const params = useLocalSearchParams<{ visitId: string; category: string; fixesPhotoId?: string; snagIds?: string; shot?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { services, user } = useApp();
  const category = PhotoCategory.parse(params.category);
  const checklist = getChecklist(category);
  const shot = checklist.requiredShots.find((s) => s.id === params.shot);
  const snagIds = params.snagIds ? params.snagIds.split(',').filter(Boolean) : [];
  const fixMode = Boolean(params.fixesPhotoId);
  const ar = currentLang() === 'ar';

  const camera = useRef<CameraView>(null);
  const [camPerm, requestCam] = useCameraPermissions();
  const [locPerm, requestLoc] = Location.useForegroundPermissions();
  const fix = useRef<{ coords: GpsFix; at: number } | null>(null);
  const [gpsLabel, setGpsLabel] = useState<string>(t('capture.gpsWaiting'));
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCaptureBusy(true);
    return () => setCaptureBusy(false);
  }, []);

  useEffect(() => {
    if (!locPerm?.granted) return;
    let sub: Location.LocationSubscription | null = null;
    void Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 0 }, (pos) => {
      fix.current = {
        coords: { lat: pos.coords.latitude, lng: pos.coords.longitude, ...(pos.coords.accuracy != null ? { accuracy: Math.round(pos.coords.accuracy) } : {}) },
        at: pos.timestamp,
      };
      setGpsLabel(t('capture.gpsOk', { m: Math.round(pos.coords.accuracy ?? 0) }));
    })
      .then((s) => {
        sub = s;
      })
      .catch(() => setGpsLabel(t('capture.gpsNone')));
    return () => sub?.remove();
  }, [locPerm?.granted, t]);

  if (!camPerm) return <View style={ui.screen} />;
  if (!camPerm.granted) {
    return (
      <View style={[ui.center, { gap: 12 }]}>
        <Body>{t('capture.permissionCamera')}</Body>
        <Button title={t('capture.grant')} onPress={() => void requestCam()} />
      </View>
    );
  }

  const take = async () => {
    if (!camera.current || busy || !user) return;
    setBusy(true);
    setError(null);
    try {
      const capturedAt = new Date().toISOString();
      const pic = await camera.current.takePictureAsync({ quality: 0.85, exif: false, shutterSound: true });
      const clientUuid = Crypto.randomUUID();
      const stored = await persistCapture(pic.uri, clientUuid);
      const gps = fix.current && Date.now() - fix.current.at < MAX_GPS_AGE_MS ? fix.current.coords : null;
      await services.store.enqueue({
        clientUuid,
        userId: user.id,
        visitId: params.visitId,
        category,
        fileUri: stored.uri,
        fileSize: stored.size,
        capturedAt,
        gps,
        deviceInfo: {
          brand: (Device.brand ?? 'unknown').slice(0, 60),
          model: (Device.modelName ?? 'unknown').slice(0, 80),
          os: `Android ${Device.osVersion ?? '?'}`,
          appVersion: appConfig.nativeVersion,
          versionCode: appConfig.nativeVersionCode,
          runtimeVersion: appConfig.runtimeVersion,
          updateId: Updates.updateId ?? 'embedded',
          width: pic.width,
          height: pic.height,
          gpsAgeMs: fix.current ? Date.now() - fix.current.at : -1,
          ...(shot ? { shot: shot.id } : {}),
        },
        fixesPhotoId: params.fixesPhotoId ?? null,
        fixSnagIds: snagIds,
      });
      await services.refreshCounts();
      services.scheduler.trigger();
      setCount((c) => c + 1);
      if (fixMode) router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <Stack.Screen options={{ title: ar ? checklist.titleAr : checklist.titleEn }} />
      <CameraView ref={camera} style={s.camera} facing="back" animateShutter mute />
      <View style={s.panel}>
        {fixMode ? <Text style={s.hint}>{t('capture.fixing', { count: snagIds.length })}</Text> : null}
        {shot ? <Text style={s.hint}>{ar ? shot.descriptionAr : shot.descriptionEn}</Text> : null}
        <Text style={s.meta}>{locPerm?.granted ? gpsLabel : t('capture.gpsNone')}</Text>
        {!locPerm?.granted ? (
          <Pressable onPress={() => void requestLoc()} accessibilityRole="button">
            <Text style={[s.meta, { textDecorationLine: 'underline' }]}>{t('capture.permissionLocation')}</Text>
          </Pressable>
        ) : null}
        {count > 0 ? <Text style={s.saved}>{`${t('capture.saved')} (${count})`}</Text> : null}
        {error ? <Text style={[s.meta, { color: colors.danger }]}>{error}</Text> : null}
        <View style={s.controls}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" style={s.side}>
            <Text style={s.sideText}>{t('capture.done')}</Text>
          </Pressable>
          <Pressable onPress={() => void take()} disabled={busy} accessibilityRole="button" accessibilityLabel={t('shots.capture')} style={s.shutter}>
            {busy ? <ActivityIndicator color={colors.primary} /> : <View style={s.shutterInner} />}
          </Pressable>
          <View style={s.side} />
        </View>
        <Text style={s.small}>{t('capture.noGallery')}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  panel: { backgroundColor: '#000', padding: 12, gap: 4 },
  hint: { color: '#fff', fontSize: 15, textAlign: 'center' },
  meta: { color: '#c8ccd2', fontSize: 13, textAlign: 'center' },
  saved: { color: '#7ee08f', fontSize: 14, textAlign: 'center', fontWeight: '600' },
  small: { color: '#8a9099', fontSize: 11, textAlign: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  side: { width: 80, alignItems: 'center' },
  sideText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
});
