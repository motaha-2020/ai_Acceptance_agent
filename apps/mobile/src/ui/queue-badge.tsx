import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useApp } from '../app-context';
import { colors } from './theme';

/** Header badge: photos still on the phone + sync state; opens the upload queue. */
export function QueueBadge() {
  const { t } = useTranslation();
  const router = useRouter();
  const { queue } = useApp();
  const pending = queue.counts.queued + queue.counts.uploading + queue.counts.linking;
  const failed = queue.counts.failed;
  const offline = queue.sync.phase === 'offline';
  const bg = failed > 0 ? colors.danger : offline ? colors.warn : pending > 0 ? colors.primary : colors.ok;
  return (
    <Pressable
      onPress={() => router.push('/queue')}
      accessibilityRole="button"
      accessibilityLabel={`${t('queue.title')}: ${t('queue.pending', { count: pending })}`}
      style={[s.badge, { backgroundColor: bg }]}
      hitSlop={8}
    >
      <Text style={s.text}>⇪ {pending + failed}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  badge: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, marginHorizontal: 8 },
  text: { color: '#fff', fontWeight: '700' },
});
