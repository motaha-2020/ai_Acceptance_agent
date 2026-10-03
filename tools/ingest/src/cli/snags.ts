import path from 'node:path';
import { DATA_DIR, RAW_ROOT } from '../paths.js';
import { writeJsonl } from '../io.js';
import { parseSnagDoc, type SnagDocSpec, type SnagSeed } from '../snags/ingestSnags.js';

const DOCS: SnagDocSpec[] = [
  { slug: 'po17', file: path.join(RAW_ROOT, 'po17 sangs.docx') },
  { slug: 'po18', file: path.join(RAW_ROOT, 'po18 sangs.docx') },
  { slug: 'afro-tt', file: path.join(RAW_ROOT, 'sangs afro & T.t.docx') },
];

const all: SnagSeed[] = [];
for (const spec of DOCS) {
  const r = await parseSnagDoc(spec, DATA_DIR);
  all.push(...r.records);
  console.log(
    `${r.slug.padEnd(8)} images=${r.imageCount} groups=${r.groupCount} records=${r.records.length} ` +
      `imagesWithoutRemark=${r.imagesWithoutRemark} textOnlyGroups=${r.textOnlyGroups}`,
  );
}
await writeJsonl(path.join(DATA_DIR, 'snags_seed.jsonl'), all);
console.log(`total records=${all.length} -> ${path.join(DATA_DIR, 'snags_seed.jsonl')}`);
