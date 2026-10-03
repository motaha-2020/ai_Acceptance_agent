import { Redirect, Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useApp } from '../app-context';
import { visitsApi } from '../features/visits/api';
import { useAsync } from '../lib/use-async';
import { Badge, Banner, Body, Card, Loading, styles, Title } from '../ui/components';
import { colors } from '../ui/theme';
import { QueueBadge } from '../ui/queue-badge';

export default function VisitsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { services, user } = useApp();
  const visits = useAsync(() => visitsApi.list(services.api), [user?.id]);

  if (!user) return <Redirect href="/login" />;

  const open = (visits.data?.items ?? []).filter((v) => v.status !== 'closed' && v.status !== 'cancelled');
  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: t('visits.title'),
          headerRight: () => (
            <View style={styles.row}>
              <QueueBadge />
              <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel={t('settings.title')} hitSlop={12}>
                <Text style={{ fontSize: 22, color: colors.primary }}>⚙</Text>
              </Pressable>
            </View>
          ),
        }}
      />
      {visits.loading && !visits.data ? (
        <Loading />
      ) : (
        <FlatList
          contentContainerStyle={styles.content}
          data={open}
          keyExtractor={(v) => v.id}
          refreshControl={<RefreshControl refreshing={visits.loading} onRefresh={() => void visits.reload()} />}
          ListHeaderComponent={visits.error ? <Banner text={t('common.offline')} tone="warn" action={{ label: t('common.retry'), onPress: () => void visits.reload() }} /> : null}
          ListEmptyComponent={!visits.error ? <Body muted>{t('visits.empty')}</Body> : null}
          renderItem={({ item }) => (
            <Card onPress={() => router.push({ pathname: '/visit/[id]', params: { id: item.id } })}>
              <View style={[styles.row, { justifyContent: 'space-between' }]}>
                <Title>{item.site.code}</Title>
                <Badge label={t(`visits.status.${item.status}`)} tone={item.status === 'in_progress' ? 'info' : item.status === 'submitted' ? 'ok' : 'muted'} />
              </View>
              <Body>{item.title}</Body>
              <Body muted>
                {item.site.name}
                {item.scheduledFor ? ` · ${new Date(item.scheduledFor).toLocaleDateString()}` : ''}
                {item._count ? ` · ${t('visits.photos', { count: item._count.photos })}` : ''}
              </Body>
            </Card>
          )}
        />
      )}
    </View>
  );
}
