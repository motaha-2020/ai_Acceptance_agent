import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { openDocx, readZipText } from '../docx/openDocx.js';
import { extractBodyTokens, parseRelationships } from '../docx/bodyTokens.js';
import { SnagSeedRecord } from '../schemas.js';
import { groupTokens } from './group.js';
import type { z } from 'zod';

export type SnagSeed = z.infer<typeof SnagSeedRecord>;

export interface SnagDocSpec {
  file: string;
  slug: string;
}

export interface SnagDocResult {
  slug: string;
  records: SnagSeed[];
  imageCount: number;
  groupCount: number;
  imagesWithoutRemark: number;
  textOnlyGroups: number;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Parse one snag docx. Images are written to `<outDir>/snags/<slug>/<nn>.<ext>`;
 * `imagePath` in records is relative to outDir (posix separators).
 */
export async function parseSnagDoc(spec: SnagDocSpec, outDir: string): Promise<SnagDocResult> {
  const zip = await openDocx(spec.file);
  const tokens = extractBodyTokens(await readZipText(zip, 'word/document.xml'));
  const rels = parseRelationships(await readZipText(zip, 'word/_rels/document.xml.rels'));
  const groups = groupTokens(tokens);

  const records: SnagSeed[] = [];
  let order = 0;
  let imageNo = 0;
  let imagesWithoutRemark = 0;
  let textOnlyGroups = 0;
  await mkdir(path.join(outDir, 'snags', spec.slug), { recursive: true });

  for (const g of groups) {
    const groupId = `${spec.slug}-g${pad(g.groupIndex)}`;
    const remarks: Array<string | null> = g.remarks.length ? g.remarks : [null];

    if (g.images.length === 0) {
      textOnlyGroups += 1;
      for (const [ri, remark] of remarks.entries()) {
        order += 1;
        records.push({
          id: `${groupId}-t${ri + 1}`, sourceDoc: spec.slug, order, imageNo: null, imagePath: null,
          remarkAr: remark, remarkIndex: ri + 1, remarksInGroup: remarks.length,
          groupId, imagesInGroup: 0,
        });
      }
      continue;
    }

    for (const rId of g.images) {
      const target = rels.get(rId);
      if (!target) throw new Error(`${spec.slug}: unresolved image relationship ${rId}`);
      imageNo += 1;
      const ext = path.extname(target).toLowerCase().replace('.', '') || 'bin';
      const rel = `snags/${spec.slug}/${pad(imageNo)}.${ext}`;
      const bytes = await zip.file(`word/${target.replace(/^\//, '').replace(/^word\//, '')}`)?.async('nodebuffer');
      if (!bytes) throw new Error(`${spec.slug}: media ${target} missing from archive`);
      await writeFile(path.join(outDir, rel), bytes);
      if (g.remarks.length === 0) imagesWithoutRemark += 1;

      for (const [ri, remark] of remarks.entries()) {
        order += 1;
        records.push({
          id: `${spec.slug}-${pad(imageNo)}${remarks.length > 1 ? `-r${ri + 1}` : ''}`,
          sourceDoc: spec.slug, order, imageNo, imagePath: rel,
          remarkAr: remark, remarkIndex: ri + 1, remarksInGroup: remarks.length,
          groupId, imagesInGroup: g.images.length,
        });
      }
    }
  }

  return {
    slug: spec.slug,
    records: records.map((r) => SnagSeedRecord.parse(r)),
    imageCount: imageNo,
    groupCount: groups.length,
    imagesWithoutRemark,
    textOnlyGroups,
  };
}
