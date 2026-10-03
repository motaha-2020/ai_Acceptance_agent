import '../features/queue/background';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../app-context';
import { registerBackgroundUpload } from '../features/queue/background';
import { OtaContext, useOtaUpdates, useReleaseGate } from '../features/updates/use-updates';
import { initI18n } from '../lib/i18n';
import { getServices, type Services } from '../services';
import { Body, Button, Loading, styles, Title } from '../ui/components';
import { appConfig } from '../config';

export default function RootLayout() {
  const [services, setServices] = useState<Services | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      await initI18n();
      setServices(await getServices());
      await registerBackgroundUpload();
    })().catch((e: unknown) => setFailure(e instanceof Error ? e.message : String(e)));
  }, []);

  if (failure) {
    return (
      <View style={styles.center}>
        <Text>{failure}</Text>
      </View>
    );
  }
  if (!services) return <Loading />;
  return (
    <SafeAreaProvider>
      <AppProvider services={services}>
        <StatusBar style="dark" />
        <UpdateGate>
          <Stack screenOptions={{ headerTitleAlign: 'center' }} />
        </UpdateGate>
      </AppProvider>
    </SafeAreaProvider>
  );
}

/** Blocks the app when this native build is below the server minimum (T5.8); runs OTA checks (T5.7). */
function UpdateGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { decision } = useReleaseGate();
  const ota = useOtaUpdates();
  if (decision.kind !== 'blocked') return <OtaContext.Provider value={ota}>{children}</OtaContext.Provider>;
  const { release } = decision;
  return (
    <View style={[styles.center, { gap: 16 }]}>
      <Title>{t('gate.blockedTitle')}</Title>
      <Body>{t('gate.blockedBody', { current: `${appConfig.nativeVersion} (${appConfig.nativeVersionCode})`, latest: release.version })}</Body>
      {release.downloadUrl ? <Button title={t('gate.download')} onPress={() => void Linking.openURL(release.downloadUrl ?? '')} /> : null}
    </View>
  );
}
