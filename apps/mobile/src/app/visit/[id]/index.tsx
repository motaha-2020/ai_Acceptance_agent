import { getSnag } from '@acceptance/checklist';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useApp } from '../../../app-context';
import { visitsApi } from '../../../features/visits/api';
import { useVisitData } from '../../../features/visits/use-visit-data';
import { visitCompletion } from '../../../features/visits/shot-plan';
import type { SnagDto } from '../../../lib/api/schemas';
import { currentLang } from '../../../lib/i18n';
import { Badge, Banner, Body, Button, Card, Loading, Progress, styles, Title } from '../../../ui/components';
import { QueueBadge } from '../../../ui/queue-badge';

export default function VisitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { services } = useApp();
  const { data, plan, error, loading, reload } = useVisitData(id);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const ar = currentLang() === 'ar';

  if (!data) {
    return error ? (
      <View style={[styles.screen, styles.content]}>
        <Banner text={t('common.offline')} tone="warn" action={{ label: t('common.retry'), onPress: () => void reload() }} />
      </View>
    ) : (
      <Loading />
    );
  }
  const { visit, snags, local } = data;
  const completion = visitCompletion(plan);
  const fixingLocally = new Set(local.filter((l) => l.status !== 'done').flatMap((l) => l.fixSnagIds));
  // Snags the reviewer confirmed (photo rejected) and not yet being fixed from this phone.
  const toFix = snags.filter((s) => s.status === 'open' && !s.dismissedAt && s.photo?.status === 'rejected' && !fixingLocally.has(s.id));
  const byPhoto = new Map<string, SnagDto[]>();
  for (const s of toFix) byPhoto.set(s.photoId, [...(byPhoto.get(s.photoId) ?? []), s]);
  const localPending = local.some((l) => l.status !== 'done');

  const setStatus = async (status: 'in_progress' | 'submitted') => {
    setBusy(true);
    setActionError(null);
    try {
      await visitsApi.setStatus(services.api, visit.id, status);
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: visit.site.code, headerRight: () => <QueueBadge /> }} />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void reload()} />}>
        <Card>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Title>{visit.title}</Title>
            <Badge label={t(`visits.status.${visit.status}`)} tone="info" />
          </View>
          <Body muted>{visit.site.name}</Body>
          <Progress value={completion.done} total={completion.total} />
          <Body muted>{t('shots.progress', { done: completion.done, total: completion.total })}</Body>
          {visit.status === 'planned' ? <Button title={t('visits.start')} onPress={() => void setStatus('in_progress')} busy={busy} /> : null}
          {visit.status === 'in_progress' ? (
            <Button title={t('visits.submit')} onPress={() => void setStatus('submitted')} busy={busy} disabled={localPending} kind="secondary" />
          ) : null}
          {visit.status === 'in_progress' && localPending ? <Body muted>{t('visits.submitBlocked')}</Body> : null}
          {actionError ? <Banner text={actionError} tone="danger" /> : null}
        </Card>

        <Title>{t('visits.snagsToFix')}</Title>
        {toFix.length === 0 ? <Body muted>{t('visits.noSnags')}</Body> : null}
        {[...byPhoto.entries()].map(([photoId, list]) => (
          <Card key={photoId} onPress={() => router.push({ pathname: '/photo/[id]', params: { id: photoId } })}>
            {list.map((s) => {
              const def = getSnag(s.code);
              return (
                <View key={s.id} style={{ marginBottom: 8 }}>
                  <View style={styles.row}>
                    <Badge label={s.severity} tone={s.severity === 'minor' ? 'warn' : 'danger'} />
                    <Body style={{ flex: 1, fontWeight: '600' }}>{ar ? s.textAr : s.textEn}</Body>
                  </View>
                  {def ? <Body muted>{`${t('photo.fix')}: ${ar ? def.fixInstructionAr : def.fixInstructionEn}`}</Body> : null}
                </View>
              );
            })}
            <Button
              title={t('photo.retake')}
              onPress={() =>
                router.push({
                  pathname: '/capture',
                  params: { visitId: visit.id, category: list[0]?.photo?.category ?? '', fixesPhotoId: photoId, snagIds: list.map((s) => s.id).join(',') },
                })
              }
            />
          </Card>
        ))}

        <Title>{t('visits.categories')}</Title>
        {plan.map((p) => (
          <Card key={p.category} onPress={() => router.push({ pathname: '/visit/[id]/[category]', params: { id: visit.id, category: p.category } })}>
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <Body style={{ fontWeight: '600', flex: 1 }}>{ar ? p.titleAr : p.titleEn}</Body>
              <Body muted>{t('shots.progress', { done: Math.min(p.captured, p.required), total: p.required })}</Body>
            </View>
            <Progress value={p.captured} total={p.required} />
            <View style={[styles.row, { marginTop: 6, flexWrap: 'wrap' }]}>
              {p.approved ? <Badge label={`${t('photo.status.approved')} ${p.approved}`} tone="ok" /> : null}
              {p.inReview ? <Badge label={`${t('photo.status.pending_review')} ${p.inReview}`} tone="info" /> : null}
              {p.rejected ? <Badge label={`${t('photo.status.rejected')} ${p.rejected}`} tone="danger" /> : null}
              {p.local ? <Badge label={`${t('queue.status.queued')} ${p.local}`} tone="muted" /> : null}
            </View>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}
