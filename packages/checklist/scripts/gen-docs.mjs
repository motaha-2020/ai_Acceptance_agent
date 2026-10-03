// Regenerates docs/snag-taxonomy.md from the built package. Run after `pnpm build`.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderTaxonomyMarkdown } from '../dist/index.js';

const target = fileURLToPath(new URL('../../../docs/snag-taxonomy.md', import.meta.url));
writeFileSync(target, renderTaxonomyMarkdown(), 'utf8');
console.log(`wrote ${target}`);
