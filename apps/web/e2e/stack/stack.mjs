// Local backend for development and Playwright: embedded PostgreSQL 16 + the real API in-process
// (local disk storage, in-process queue, scripted fake AI provider). No Docker, no Redis.
import { createRequire } from 'node:module';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { API_PORT, API_URL, PG_PORT, SECRETS, USERS, WEB_URL } from './config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const webDir = path.resolve(here, '..', '..');
export const repoRoot = path.resolve(webDir, '..', '..');
export const dataRoot = path.join(webDir, '.e2e-data');
const apiDir = path.join(repoRoot, 'apps', 'api');
const apiRequire = createRequire(path.join(apiDir, 'package.json'));
const webRequire = createRequire(path.join(webDir, 'package.json'));

const importFrom = (req, spec) => import(pathToFileURL(req.resolve(spec)).href);

/** Categories → scripted AI behaviour so the review UI always has varied material. */
export const SCRIPTED = {
  patch_cords: {
    verdict: 'reject',
    confidence: 0.82,
    snags: [
      { code: 'PATCH_CORD_CROSSING', severity: 'major', bbox: { x: 0.18, y: 0.3, w: 0.35, h: 0.25 }, reasonAr: 'الباتش كورد متقاطعة', reasonEn: 'Patch cords cross each other' },
      { code: 'PATCH_CORD_NOT_BUNDLED', severity: 'minor', bbox: { x: 0.55, y: 0.5, w: 0.3, h: 0.3 }, reasonAr: 'مفيش اسكوتش', reasonEn: 'No velcro bundling' },
    ],
  },
  odf_tie_labels: {
    verdict: 'reject',
    confidence: 0.67,
    snags: [{ code: 'LABEL_MISSING', severity: 'major', bbox: { x: 0.4, y: 0.4, w: 0.2, h: 0.12 }, reasonAr: 'الليبل ناقص', reasonEn: 'Label missing' }],
  },
  pdu: { verdict: 'uncertain', confidence: 0.41, snags: [] },
};

export async function startStack({ persist = false, log = console.log } = {}) {
  const db = await importFrom(apiRequire, '@acceptance/db');
  const workerPkg = await importFrom(apiRequire, '@acceptance/worker');
  const apiApp = await import(pathToFileURL(path.join(apiDir, 'dist', 'app.js')).href);
  const apiCfg = await import(pathToFileURL(path.join(apiDir, 'dist', 'config', 'config.js')).href);

  const root = persist ? path.join(dataRoot, 'dev') : path.join(dataRoot, `run-${process.pid}`);
  if (!persist) await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });

  const pg = await db.startEmbeddedPostgres({
    dataDir: path.join(root, 'pg'),
    port: PG_PORT,
    user: 'acceptance',
    password: 'acceptance',
    persistent: persist,
  });
  await pg.createDatabase('acceptance');
  const databaseUrl = pg.urlFor('acceptance');
  await db.runMigrations(databaseUrl);
  const prisma = db.createPrismaClient(databaseUrl);
  await db.seedDatabase(prisma, {
    adminEmail: USERS.admin.email,
    adminPassword: USERS.admin.password,
    nasr3SeedPath: path.join(repoRoot, 'data', 'sites', 'nasr3-r21c.json'),
    log: () => undefined,
  });

  const providers = new workerPkg.ProviderRegistry().register(
    'fake',
    () =>
      new workerPkg.FakeAnalysisProvider((req) => {
        const s = SCRIPTED[req.category];
        return s
          ? { categoryMatches: true, qualityIssues: [], ...s }
          : { categoryMatches: true, qualityIssues: [], verdict: 'accept', confidence: 0.93, snags: [] };
      }),
  );

  const config = apiCfg.loadConfig({
    NODE_ENV: 'development',
    PORT: String(API_PORT),
    HOST: '127.0.0.1',
    LOG_LEVEL: 'warn',
    DATABASE_URL: databaseUrl,
    JWT_ACCESS_SECRET: SECRETS.JWT_ACCESS_SECRET,
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_DIR: path.join(root, 'storage'),
    STORAGE_SIGNING_SECRET: SECRETS.STORAGE_SIGNING_SECRET,
    PUBLIC_BASE_URL: API_URL,
    CORS_ORIGINS: WEB_URL,
    AI_PROVIDER: 'fake',
    AI_CONCURRENCY: '2',
    LOGIN_RATE_LIMIT_MAX: '1000',
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: '1', // the per-IP login cap (20/window) would trip on rapid test logins
    SWAGGER_ENABLED: 'true',
  });
  const app = await apiApp.createApp(config, { overrides: { prisma, providers } });
  await app.listen({ port: API_PORT, host: '127.0.0.1' });
  log(`[stack] API ${API_URL} (docs ${API_URL}/docs), PostgreSQL :${PG_PORT}`);

  return {
    prisma,
    async stop() {
      await app.close().catch(() => undefined);
      await prisma.$disconnect().catch(() => undefined);
      await pg.stop().catch(() => undefined);
      if (!persist) await rm(root, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}

export { webRequire, apiRequire };
