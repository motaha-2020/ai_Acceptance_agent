/** Dry-run end-to-end: fixture dataset on disk -> CLI run (fake provider, full core) -> jsonl + md -> compare. */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareCommand, main, runCommand, type CliIO } from '../eval/cli.js';
import { EvalRecord } from '../eval/metrics.js';
import { noiseJpeg } from './helpers.js';

async function fixture(): Promise<{ root: string; dataDir: string; rawRoot: string }> {
  const root = mkdtempSync(path.join(tmpdir(), 'ai-eval-'));
  const dataDir = path.join(root, 'data');
  const rawRoot = path.join(root, 'raw');
  mkdirSync(path.join(dataDir, 'snags', 'd'), { recursive: true });
  mkdirSync(path.join(rawRoot, 'site'), { recursive: true });
  const seed = [];
  for (let i = 1; i <= 4; i++) {
    writeFileSync(path.join(dataDir, 'snags', 'd', `0${i}.jpeg`), await noiseJpeg(200, 150, i));
    seed.push({ id: `d-0${i}`, sourceDoc: 'd', order: i, imageNo: i, imagePath: `snags/d/0${i}.jpeg`, remarkAr: i % 2 ? 'نقفل الداكت من النزله' : 'نشيل الكرتونه من جواه الراك' });
  }
  const catalog = [];
  const cats = ['rack', 'duct', 'pdu'];
  for (let i = 0; i < 9; i++) {
    const rel = `site/g${i}.jpeg`;
    writeFileSync(path.join(rawRoot, rel), await noiseJpeg(200, 150, 100 + i));
    catalog.push({ site: 'site', device: 'x', category: cats[i % 3], relPath: rel, bytes: 1, sha256: `sha-good-${i}` });
  }
  writeFileSync(path.join(dataDir, 'snags_seed.jsonl'), seed.map((s) => JSON.stringify(s)).join('\n'));
  writeFileSync(path.join(dataDir, 'photo_catalog.jsonl'), catalog.map((s) => JSON.stringify(s)).join('\n'));
  return { root, dataDir, rawRoot };
}

describe('eval CLI dry-run e2e', () => {
  it('runs, writes jsonl + markdown summary, and compares runs', async () => {
    const fx = await fixture();
    const logs: string[] = [];
    let t = Date.parse('2026-10-03T10:00:00Z');
    const io: CliIO = { log: (m) => logs.push(m), env: {}, cwd: fx.root, now: () => new Date((t += 1000)) };
    const common = ['--dry-run', '--limit', '10', '--concurrency', '3', '--data-dir', fx.dataDir, '--raw-root', fx.rawRoot];

    const a = await runCommand(['--provider', 'gemini', ...common], io);
    const records = readFileSync(a.jsonl, 'utf8').trim().split('\n').map((l) => EvalRecord.parse(JSON.parse(l)));
    expect(records).toHaveLength(10);
    expect(records.filter((r) => r.kind === 'snag')).toHaveLength(4);
    expect(records.every((r) => !r.error && r.provider === 'fake')).toBe(true);
    expect(path.basename(a.jsonl)).toMatch(/dryrun-gemini\.jsonl$/);
    const md = readFileSync(a.summary, 'utf8');
    expect(md).toContain('DRY RUN');
    expect(md).toContain('## Per snag code');

    await main(['run', '--provider', 'cascade', '--cascade', 'gemini,claude:claude-sonnet-5-5', '--few-shot', '1', ...common], io);
    const { markdown, file } = compareCommand(['--last', '2', '--data-dir', fx.dataDir], io);
    expect(markdown).toContain('# Provider bake-off comparison');
    expect(markdown).toMatch(/dryrun-gemini \(dry\)/);
    expect(markdown).toMatch(/dryrun-cascade-gemini-claude \(dry\)/);
    expect(readFileSync(file, 'utf8')).toBe(markdown);
  });

  it('refuses a real run without the API key', async () => {
    const fx = await fixture();
    const io: CliIO = { log: () => {}, env: {}, cwd: fx.root, now: () => new Date() };
    await expect(runCommand(['--provider', 'openai', '--limit', '2', '--data-dir', fx.dataDir, '--raw-root', fx.rawRoot], io)).rejects.toThrow(/OPENAI_API_KEY/);
  });
});
