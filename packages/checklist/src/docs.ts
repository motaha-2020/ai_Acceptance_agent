import { CHECKLISTS } from './checklists.js';
import { SNAG_TAXONOMY, TAXONOMY_VERSION } from './taxonomy.js';
import { renderSiteDecisions } from './decisions.js';

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/**
 * Human-readable taxonomy for reviewer approval (docs/snag-taxonomy.md).
 * Generated from the code so the document can never drift; a test enforces it.
 * Regenerate with `pnpm --filter @acceptance/checklist gen:docs`.
 */
export function renderTaxonomyMarkdown(): string {
  const out: string[] = [];
  out.push('# Snag taxonomy (for reviewer approval)');
  out.push('');
  out.push(`Version: \`${TAXONOMY_VERSION}\` — generated from \`packages/checklist/src/taxonomy.ts\`; do not edit by hand.`);
  out.push('');
  out.push('These codes are what the AI emits and what reviewers pick when labelling. Please check for each row: is the meaning right, is the Arabic how you would say it, is the severity right, and does it apply to the right photo categories.');
  out.push('');
  out.push('Severity: **critical** = safety/service risk; **major** = must be fixed before acceptance (rejects the photo); **minor** = cosmetic, reported as a note to fix but does not reject the photo on its own (decision D9 in `packages/checklist/src/decisions.ts`).');
  out.push('Origin: `snag_docs` = seen in the reviewers\' snag Word files; `sid_checklist` = from the SID acceptance checklist; `photo_quality` = retake reasons; `catch_all` = for issues not yet in the list.');
  out.push('');
  out.push(`Total: ${SNAG_TAXONOMY.length} codes.`);
  out.push('');
  out.push('## Site decisions (defaults pending reviewer confirmation)');
  out.push('');
  out.push('Evidence-based defaults from prompt tuning (T3.5, docs/ai-tuning-log.md). Each is one setting in `packages/checklist/src/decisions.ts`.');
  out.push('');
  renderSiteDecisions().forEach((r, i) => out.push(`- **D${i + 1}** ${r}`));
  out.push('- **D8** Photo-gate codes WRONG_CATEGORY and SUBJECT_NOT_FULLY_VISIBLE route the photo to a human (verdict uncertain) instead of rejecting it, unless a clear major snag is also present.');
  out.push('- **D9** Only major/critical snags reject; photos with only minor snags are accepted with notes.');
  out.push('');
  out.push('| # | Code | العربي | English | Severity | Origin | Categories |');
  out.push('|---|---|---|---|---|---|---|');
  SNAG_TAXONOMY.forEach((s, i) => {
    const cats = s.categories.length === CHECKLISTS.length ? '_all_' : s.categories.join(', ');
    out.push(`| ${i + 1} | \`${s.code}\` | ${esc(s.titleAr)} | ${esc(s.titleEn)} | ${s.defaultSeverity} | ${s.origin} | ${cats} |`);
  });
  out.push('');
  out.push('## Details');
  for (const s of SNAG_TAXONOMY) {
    out.push('');
    out.push(`### \`${s.code}\` — ${s.titleEn}`);
    out.push('');
    out.push(`- **الوصف:** ${s.descriptionAr}`);
    out.push(`- **Description:** ${s.descriptionEn}`);
    out.push(`- **Look for:** ${s.visualCues.join('; ')}`);
    if (s.confusableWith.length) out.push(`- **Not to confuse with:** ${s.confusableWith.map((c) => `\`${c}\``).join(', ')}`);
    if (s.reviewerPhrasesAr.length) out.push(`- **Reviewer wording:** ${s.reviewerPhrasesAr.map((p) => `«${p.trim()}»`).join('، ')}`);
    out.push(`- **الإصلاح:** ${s.fixInstructionAr}`);
    out.push(`- **Fix:** ${s.fixInstructionEn}`);
  }
  out.push('');
  out.push('## Checklists per category');
  for (const c of CHECKLISTS) {
    out.push('');
    out.push(`### ${c.category} — ${c.titleEn} / ${c.titleAr}`);
    out.push('');
    for (const a of c.acceptanceCriteria) {
      out.push(`- **${a.id}** ${a.textAr} — ${a.textEn} → ${a.guardsCodes.map((g) => `\`${g}\``).join(', ')}`);
    }
  }
  out.push('');
  return out.join('\n');
}
