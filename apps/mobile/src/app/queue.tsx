import { Stack } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, View } from 'react-native';
import { useApp } from '../app-context';
import { fileOps } from '../features/capture/photo-files';
import type { QueueItem } from '../features/queue/queue-store';
import { useAsync } from '../lib/use-async';
import { Badge, Banner, Body, Button, Card, styles } from '../ui/components';
import { queueTone } from '../ui/status';

/** Visible upload queue: what is still on the phone, why it failed, retry or (explicitly) discard. */
export default function QueueScreen() {
  const { t } = useTranslation();
  const { services, queue, user } = useApp();
  const load = useCallback(
    () => services.store.list({ userId: user?.id, statuses: ['queued', 'uploading', 'linking', 'failed'] }),
    [services, user?.id],
  );
  const items = useAsync(load, [load, queue.counts.queued, queue.counts.uploading, queue.counts.linking, queue.counts.failed, queue.sync.phase]);

  const syncNow = async () => {
    if (user) await services.store.wakeAll(user.id);
    services.scheduler.trigger();
  };
  const retry = async (it: QueueItem) => {
    await services.store.retryFailed(it.clientUuid);
    await services.refreshCounts();
    services.scheduler.trigger();
  };
  const discard = (it: QueueItem) =>
    Alert.alert(t('queue.discard'), t('queue.discardConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        style: 'destructive',
        onPress: () =>
          void (async () => {
            const uri = await services.store.discardFailed(it.clientUuid);
            if (uri) fileOps.delete(uri);
            await services.refreshCounts();
          })(),
      },
    ]);

  const sync = queue.sync;
  const tone = sync.phase === 'idle' ? 'ok' : sync.phase === 'error' || sync.phase === 'auth_required' ? 'danger' : sync.phase === 'offline' ? 'warn' : 'info';
  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t('queue.title') }} />
      <FlatList
        contentContainerStyle={styles.content}
        data={items.data ?? []}
        keyExtractor={(i) => i.clientUuid}
        ListHeaderComponent={
          <>
            <Banner text={`${t(`queue.phase.${sync.phase}`)}${sync.phase === 'waiting' ? ` · ${new Date(sync.until).toLocaleTimeString()}` : ''}`} tone={tone} />
            <Button title={t('queue.syncNow')} onPress={() => void syncNow()} busy={sync.phase === 'syncing'} />
          </>
        }
        ListEmptyComponent={<Body muted>{t('queue.empty')}</Body>}
        renderItem={({ item }) => (
          <Card>
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <Body style={{ fontWeight: '600' }}>{item.category}</Body>
              <Badge label={t(`queue.status.${item.status}`)} tone={queueTone[item.status]} />
            </View>
            <Body muted>{new Date(item.capturedAt).toLocaleString()}</Body>
            {item.attempts > 0 ? <Body muted>{t('queue.attempts', { n: item.attempts })}</Body> : null}
            {item.lastError ? <Body muted>{item.lastError}</Body> : null}
            {item.status === 'failed' ? (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Button title={t('common.retry')} onPress={() => void retry(item)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title={t('queue.discard')} onPress={() => discard(item)} kind="danger" />
                </View>
              </View>
            ) : null}
          </Card>
        )}
      />
    </View>
  );
}
