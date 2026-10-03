import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Eye, Wrench, XCircle } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import type { PhotoStatusDto, SeverityDto, SnagStatusDto, VerdictDto, VisitStatusDto } from '@/lib/api/types';

const PHOTO_TONE: Record<PhotoStatusDto, BadgeTone> = {
  captured: 'neutral',
  uploaded: 'neutral',
  ai_analyzed: 'info',
  pending_review: 'warning',
  approved: 'success',
  rejected: 'danger',
  fixed: 'violet',
};

const PHOTO_ICON: Partial<Record<PhotoStatusDto, typeof Clock>> = {
  pending_review: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
  fixed: Wrench,
  ai_analyzed: Eye,
};

export function PhotoStatusBadge({ status }: { status: PhotoStatusDto }) {
  const t = useTranslations('status.photo');
  const Icon = PHOTO_ICON[status] ?? CircleDashed;
  return (
    <Badge tone={PHOTO_TONE[status]}>
      <Icon aria-hidden />
      {t(status)}
    </Badge>
  );
}

const SNAG_TONE: Record<SnagStatusDto, BadgeTone> = { open: 'danger', fixed: 'violet', verified: 'success' };

export function SnagStatusBadge({ status }: { status: SnagStatusDto }) {
  const t = useTranslations('status.snag');
  return <Badge tone={SNAG_TONE[status]}>{t(status)}</Badge>;
}

const SEVERITY_TONE: Record<SeverityDto, BadgeTone> = { minor: 'neutral', major: 'warning', critical: 'danger' };

export function SeverityBadge({ severity }: { severity: SeverityDto }) {
  const t = useTranslations('severity');
  return (
    <Badge tone={SEVERITY_TONE[severity]}>
      {severity !== 'minor' ? <AlertTriangle aria-hidden /> : null}
      {t(severity)}
    </Badge>
  );
}

const VERDICT_TONE: Record<VerdictDto, BadgeTone> = { accept: 'success', reject: 'danger', uncertain: 'warning' };

export function VerdictBadge({ verdict }: { verdict: VerdictDto | null | undefined }) {
  const t = useTranslations('verdict');
  if (!verdict) return <Badge tone="neutral">{t('none')}</Badge>;
  return <Badge tone={VERDICT_TONE[verdict]}>{t(verdict)}</Badge>;
}

const VISIT_TONE: Record<VisitStatusDto, BadgeTone> = { planned: 'neutral', in_progress: 'info', submitted: 'violet', closed: 'success', cancelled: 'danger' };

export function VisitStatusBadge({ status }: { status: VisitStatusDto }) {
  const t = useTranslations('status.visit');
  return <Badge tone={VISIT_TONE[status]}>{t(status)}</Badge>;
}

export function ActiveBadge({ active }: { active: boolean }) {
  const t = useTranslations('common');
  return <Badge tone={active ? 'success' : 'neutral'}>{active ? t('active') : t('inactive')}</Badge>;
}
