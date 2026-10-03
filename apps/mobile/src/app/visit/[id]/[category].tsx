import { getChecklist } from '@acceptance/checklist';
import { PhotoCategory } from '@acceptance/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useVisitData } from '../../../features/visits/use-visit-data';
import { currentLang } from '../../../lib/i18n';
import { Badge, Banner, Body, Button, Card, Loading, styles, Title } from '../../../ui/components';
import { photoTone, queueTone } from '../../../ui/status';

/** Guided shot list for one category: what each photo must show, criteria, good example, photos taken. */
export default function CategoryScreen() {
  const params = useLocalSearchParams<{ id: string; category: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const category = PhotoCategory.parse(params.category);
  const checklist = getChecklist(category);
  const { data, loading, reload, error } = useVisitData(params.id);
  const ar = currentLang() === 'ar';

  if (!data) return error ? <Banner text={t('common.offline')} tone="warn" /> : <Loading />;
  const photos = data.photos.filter((p) => p.category === category);
  const onServer = new Set(photos.map((p) => p.clientUuid));
  const local = data.local.filter((l) => l.category === category && l.status !== 'done' && !onServer.has(l.clientUuid));
  const canCapture = data.visit.status === 'planned' || data.visit.status === 'in_progress';
  const capture = (shotId?: string) =>
    router.push({ pathname: '/capture', params: { visitId: params.id, category, ...(shotId ? { shot: shotId } : {}) } });

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: ar ? checklist.titleAr : checklist.titleEn }} />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void reload()} />}>
        <Title>{t('shots.required')}</Title>
        {checklist.requiredShots.map((shot, i) => (
          <Card key={shot.id}>
            <Body style={{ fontWeight: '600' }}>{`${i + 1}. ${ar ? shot.descriptionAr : shot.descriptionEn}`}</Body>
            {canCapture ? <Button title={t('shots.capture')} onPress={() => capture(shot.id)} /> : null}
          </Card>
        ))}

        <Title>{t('shots.criteria')}</Title>
        <Card>
          {checklist.acceptanceCriteria.map((c) => (
            <Body key={c.id}>{`• ${ar ? c.textAr : c.textEn}`}</Body>
          ))}
        </Card>

        <Title>{t('shots.goodExample')}</Title>
        <Card>
          {checklist.goodExampleNotes.map((n) => (
            <Body key={n} muted>{`• ${n}`}</Body>
          ))}
        </Card>

        <Title>{t('shots.taken')}</Title>
        {local.map((l) => (
          <Card key={l.clientUuid}>
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <Body>{new Date(l.capturedAt).toLocaleTimeString()}</Body>
              <Badge label={t(`queue.status.${l.status}`)} tone={queueTone[l.status]} />
            </View>
            {l.lastError ? <Body muted>{l.lastError}</Body> : null}
          </Card>
        ))}
        {photos.map((p) => (
          <Pressable key={p.id} onPress={() => router.push({ pathname: '/photo/[id]', params: { id: p.id } })} accessibilityRole="button">
            <Card style={[styles.row, { gap: 12 }]}>
              <Image source={{ uri: p.urls.thumb }} style={{ width: 64, height: 64, borderRadius: 6 }} accessibilityIgnoresInvertColors />
              <View style={{ flex: 1 }}>
                <Badge label={t(`photo.status.${p.status}`)} tone={photoTone[p.status]} />
                <Body muted>{new Date(p.capturedAt ?? p.uploadedAt).toLocaleString()}</Body>
              </View>
            </Card>
          </Pressable>
        ))}
        {canCapture ? <Button title={t('shots.capture')} onPress={() => capture()} kind="secondary" /> : null}
      </ScrollView>
    </View>
  );
}
