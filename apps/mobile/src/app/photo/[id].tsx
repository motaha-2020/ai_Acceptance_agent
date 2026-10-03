import { getSnag } from '@acceptance/checklist';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, RefreshControl, ScrollView, View } from 'react-native';
import { useApp } from '../../app-context';
import { visitsApi } from '../../features/visits/api';
import { currentLang } from '../../lib/i18n';
import { useAsync } from '../../lib/use-async';
import { Badge, Banner, Body, Button, Card, Loading, styles, Title } from '../../ui/components';
import { PENDING_STATUSES, photoTone } from '../../ui/status';

/** AI feedback and reviewer decision for one photo; polls while the result is pending (T5.4). */
export default function PhotoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { services } = useApp();
  const ar = currentLang() === 'ar';
  const load = useCallback(() => visitsApi.photo(services.api, id), [services, id]);
  const [pollMs, setPollMs] = useState<number>();
  const polled = useAsync(load, [load], pollMs);
  const photo = polled.data;
  useEffect(() => {
    setPollMs(photo && PENDING_STATUSES.includes(photo.status) ? 10_000 : undefined);
  }, [photo]);

  if (!photo) return polled.error ? <Banner text={t('common.offline')} tone="warn" /> : <Loading />;
  const analysis = photo.analyses[0];
  const review = photo.reviews[0];
  const snags = photo.snags.filter((s) => !s.dismissedAt);
  const openSnags = snags.filter((s) => s.status === 'open');

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t('photo.title') }} />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={polled.loading} onRefresh={() => void polled.reload()} />}>
        <Image source={{ uri: photo.urls.web }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 10, marginBottom: 12, backgroundColor: '#ddd' }} resizeMode="contain" />
        <Card>
          <Badge label={t(`photo.status.${photo.status}`)} tone={photoTone[photo.status]} />
          <Body muted>{new Date(photo.capturedAt ?? photo.uploadedAt).toLocaleString()}</Body>
        </Card>

        <Title>{t('photo.ai')}</Title>
        <Card>
          {analysis?.verdict ? (
            <>
              <Badge label={t(`photo.verdict.${analysis.verdict}`)} tone={analysis.verdict === 'accept' ? 'ok' : analysis.verdict === 'reject' ? 'danger' : 'warn'} />
              {analysis.confidence != null ? <Body muted>{t('photo.confidence', { pct: Math.round(analysis.confidence * 100) })}</Body> : null}
            </>
          ) : (
            <Body muted>{t('photo.status.uploaded')}</Body>
          )}
        </Card>

        {review || photo.status === 'approved' || photo.status === 'rejected' ? (
          <>
            <Title>{t('photo.reviewer')}</Title>
            <Card>
              <Badge label={t(`photo.status.${photo.status}`)} tone={photoTone[photo.status]} />
              {review?.reviewer ? <Body muted>{review.reviewer.name}</Body> : null}
              {photo.rejectionReason ? <Body>{`${t('photo.rejection')}: ${photo.rejectionReason}`}</Body> : null}
            </Card>
          </>
        ) : null}

        <Title>{t('photo.snags')}</Title>
        {snags.length === 0 ? <Body muted>—</Body> : null}
        {snags.map((s) => {
          const def = getSnag(s.code);
          return (
            <Card key={s.id}>
              <View style={[styles.row, { flexWrap: 'wrap' }]}>
                <Badge label={s.severity} tone={s.severity === 'minor' ? 'warn' : 'danger'} />
                <Badge label={t(`photo.snagStatus.${s.status}`)} tone={s.status === 'open' ? 'danger' : s.status === 'fixed' ? 'warn' : 'ok'} />
                <Badge label={s.source === 'ai' ? 'AI' : '👤'} tone="muted" />
              </View>
              <Body style={{ fontWeight: '600', marginTop: 6 }}>{ar ? s.textAr : s.textEn}</Body>
              {def ? <Body muted>{`${t('photo.fix')}: ${ar ? def.fixInstructionAr : def.fixInstructionEn}`}</Body> : null}
            </Card>
          );
        })}

        {photo.status === 'rejected' && openSnags.length > 0 ? (
          <Button
            title={t('photo.retake')}
            onPress={() =>
              router.push({
                pathname: '/capture',
                params: { visitId: photo.visitId, category: photo.category, fixesPhotoId: photo.id, snagIds: openSnags.map((s) => s.id).join(',') },
              })
            }
          />
        ) : null}
      </ScrollView>
    </View>
  );
}
