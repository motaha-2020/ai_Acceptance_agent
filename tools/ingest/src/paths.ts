import path from 'node:path';

/** Repo root of acceptance-system (tools/ingest/src -> ../../..). */
export const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
/** Raw customer data lives one level above the repo (read-only). */
export const RAW_ROOT = process.env.RAW_ROOT
  ? path.resolve(process.env.RAW_ROOT)
  : path.resolve(REPO_ROOT, '..');
/** All generated output (git-ignored). */
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(REPO_ROOT, 'data');

export const toPosix = (p: string): string => p.split(path.sep).join('/');
