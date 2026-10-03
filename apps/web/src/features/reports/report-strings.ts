import type { AppLocale } from '@/i18n/config';

/**
 * Strings of the report actions (P6). Local to the feature so the shared message catalogues are not
 * edited concurrently; move into messages/{en,ar}.json under `reports.gen` when convenient.
 */
const EN = {
  colLatest: 'Latest report',
  final: 'Final',
  draft: 'Draft',
  finalHint: 'Generate the final acceptance report',
  finalBlocked: 'Resolve open snags and pending reviews first, or generate a draft',
  draftHint: 'Generate a draft (allowed with open items)',
  none: 'No report yet',
  queued: 'Queued',
  running: 'Generating…',
  ready: 'Ready',
  failed: 'Failed',
  draftTag: 'draft',
  docx: 'DOCX',
  pdf: 'PDF',
  warnings: (n: number) => `${n} warning${n === 1 ? '' : 's'}`,
  queuedToast: (v: number) => `Report v${v} queued`,
  checklist: (ok: number, fail: number, na: number) => `Checklist: ${ok} OK · ${fail} not OK · ${na} manual`,
  intro: 'Reports follow the SID layout. A final report needs every photo reviewed and every snag verified; drafts can be generated at any time.',
};

const AR: typeof EN = {
  colLatest: 'آخر تقرير',
  final: 'نهائي',
  draft: 'مسودة',
  finalHint: 'إنشاء تقرير الاستلام النهائي',
  finalBlocked: 'لازم تتقفل الملاحظات المفتوحة وتتراجع كل الصور الأول، أو اعمل مسودة',
  draftHint: 'إنشاء مسودة (مسموح مع وجود ملاحظات مفتوحة)',
  none: 'لا يوجد تقرير',
  queued: 'في الانتظار',
  running: 'جاري الإنشاء…',
  ready: 'جاهز',
  failed: 'فشل',
  draftTag: 'مسودة',
  docx: 'DOCX',
  pdf: 'PDF',
  warnings: (n: number) => `${n} تنبيه`,
  queuedToast: (v: number) => `تم إرسال التقرير v${v} للإنشاء`,
  checklist: (ok: number, fail: number, na: number) => `قائمة الاستلام: ${ok} سليم · ${fail} غير سليم · ${na} يدوي`,
  intro: 'التقرير بنفس شكل الـ SID. التقرير النهائي يحتاج مراجعة كل الصور والتحقق من كل الملاحظات؛ المسودة ممكنة في أي وقت.',
};

export type ReportStrings = typeof EN;
export const reportStrings = (locale: AppLocale): ReportStrings => (locale === 'ar' ? AR : EN);
