import { existsSync } from 'node:fs';
import path from 'node:path';

export interface RepoPaths {
  repoRoot: string;
  /** Generated data (git-ignored): seed files, eval outputs. Env DATA_DIR overrides. */
  dataDir: string;
  /** Raw customer photos, one level above the repo (read-only). Env RAW_ROOT overrides. */
  rawRoot: string;
}

/** Walks up from `start` to the directory containing pnpm-workspace.yaml. */
export function findRepoRoot(start = process.cwd()): string {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

export function resolvePaths(env: NodeJS.ProcessEnv = process.env, start?: string): RepoPaths {
  const repoRoot = findRepoRoot(start);
  return {
    repoRoot,
    dataDir: env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(repoRoot, 'data'),
    rawRoot: env.RAW_ROOT ? path.resolve(env.RAW_ROOT) : path.resolve(repoRoot, '..'),
  };
}
