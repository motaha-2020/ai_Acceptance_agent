import { Stack, useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useApp } from '../app-context';
import { appConfig } from '../config';
import { useOta } from '../features/updates/use-updates';
import { currentLang, setLanguage } from '../lib/i18n';
import { Banner, Body, Button, Card, styles, Title } from '../ui/components';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { services, user } = useApp();
  const ota = useOta();
  const [blocked, setBlocked] = useState(false);
  const lang = currentLang();

  const logout = async () => {
    const c = await services.store.counts(user?.id);
    // Queued photos belong to this user's session: never strand them by logging out.
    if (c.queued + c.uploading + c.linking + c.failed > 0) {
      setBlocked(true);
      return;
    }
    await services.session.logout();
    router.replace('/login');
  };

  const otaText =
    ota.status === 'ready' ? t('settings.updateReady') : ota.status === 'up_to_date' ? t('settings.upToDate') : ota.status === 'error' ? t('common.error') : null;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t('settings.title') }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Title>{t('settings.user')}</Title>
        <Card>
          <Body>{user?.name ?? ''}</Body>
          <Body muted>{`${user?.email ?? ''} · ${user?.role ?? ''}`}</Body>
        </Card>

        <Title>{t('settings.language')}</Title>
        <Card>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Button title={t('settings.arabic')} kind={lang === 'ar' ? 'primary' : 'secondary'} onPress={() => void setLanguage('ar')} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title={t('settings.english')} kind={lang === 'en' ? 'primary' : 'secondary'} onPress={() => void setLanguage('en')} />
            </View>
          </View>
        </Card>

        <Title>{t('settings.update')}</Title>
        <Card>
          <Body>{`${t('settings.version')}: ${appConfig.nativeVersion} (${appConfig.nativeVersionCode})`}</Body>
          <Body muted>{`runtime ${appConfig.runtimeVersion} · ${t('settings.channel')} ${appConfig.channel}`}</Body>
          <Body muted>{`update ${Updates.updateId ?? 'embedded'}${Updates.createdAt ? ` · ${Updates.createdAt.toLocaleString()}` : ''}`}</Body>
          {otaText ? <Banner text={otaText} tone={ota.status === 'error' ? 'danger' : 'info'} /> : null}
          {ota.status !== 'disabled' ? (
            <Button title={t('settings.checkUpdates')} onPress={() => void ota.checkNow()} busy={ota.status === 'checking' || ota.status === 'downloading'} kind="secondary" />
          ) : null}
          {ota.status === 'ready' ? <Button title={t('settings.restartNow')} onPress={() => void ota.restart()} /> : null}
        </Card>

        {blocked ? <Banner text={t('settings.logoutBlocked')} tone="warn" /> : null}
        <Button title={t('settings.logout')} kind="danger" onPress={() => void logout()} />
      </ScrollView>
    </View>
  );
}
