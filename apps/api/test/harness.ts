import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { pino } from 'pino';
import sharp from 'sharp';
import { inject } from 'vitest';
import { createPrismaClient, seedDatabase, type PrismaClient } from '@acceptance/db';
import { InMemoryJobQueue } from '@acceptance/queue';
import type { AnalysisRequest, AnalysisResult, Role, TokenResponse } from '@acceptance/shared';
import { FakeAnalysisProvider, ProviderRegistry } from '@acceptance/worker';
import { createApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config/config.js';

export const ADMIN = { email: 'admin@acceptance.test', password: 'admin-password-123' };
export const PASSWORD = 'user-password-123';

export interface Harness {
  app: NestFastifyApplication;
  prisma: PrismaClient;
  queue: InMemoryJobQueue;
  config: AppConfig;
  /** Change what the fake AI returns. */
  setAiResult(fn: (req: AnalysisRequest) => AnalysisResult): void;
  request(opts: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; url: string; token?: string; body?: unknown; headers?: Record<string, string> }): Promise<{
    status: number;
    body: unknown;
    json<T = Record<string, unknown>>(): T;
  }>;
  login(email: string, password: string): Promise<TokenResponse>;
  createUser(token: string, role: Role, email?: string): Promise<{ id: string; email: string; token: string }>;
  upload(token: string, metadata: Record<string, unknown>, image?: Buffer): Promise<{ status: number; json<T = Record<string, unknown>>(): T }>;
  close(): Promise<void>;
}

export const CLEAN: AnalysisResult = { categoryMatches: true, qualityIssues: [], verdict: 'accept', confidence: 0.93, snags: [] };

export async function jpeg(seed = Math.floor(Math.random() * 1e9), size = 256): Promise<Buffer> {
  // Unique pixels per seed so every upload has a distinct sha256.
  const raw = Buffer.alloc(size * size * 3);
  let x = seed >>> 0;
  for (let i = 0; i < raw.length; i++) {
    x = (x * 1664525 + 1013904223) >>> 0;
    raw[i] = x >>> 24;
  }
  return sharp(raw, { raw: { width: size, height: size, channels: 3 } })
    .jpeg({ quality: 80 })
    .withExif({ IFD0: { Make: 'TestPhone', Model: 'Model X' } })
    .toBuffer();
}

export async function startHarness(env: Record<string, string> = {}): Promise<Harness> {
  const storageDir = await mkdtemp(path.join(os.tmpdir(), 'api-storage-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: inject('databaseUrl'),
    JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough',
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_DIR: storageDir,
    STORAGE_SIGNING_SECRET: 'test-storage-secret-that-is-long-enough',
    PUBLIC_BASE_URL: 'http://api.test',
    AI_PROVIDER: 'fake',
    AI_DAILY_BUDGET_USD: '0',
    SWAGGER_ENABLED: 'false',
    LOGIN_RATE_LIMIT_MAX: '50',
    ...env,
  });
  const prisma = createPrismaClient(config.DATABASE_URL);
  await seedDatabase(prisma, { adminEmail: ADMIN.email, adminPassword: ADMIN.password });
  const queue = new InMemoryJobQueue({ backoffScale: 0.001 });
  let respond: (req: AnalysisRequest) => AnalysisResult = () => CLEAN;
  const provider = new FakeAnalysisProvider((req) => respond(req));
  const providers = new ProviderRegistry().register('fake', () => provider);
  const app = await createApp(config, { logger: pino({ level: 'silent' }), overrides: { prisma, queue, providers } });
  const server = app.getHttpAdapter().getInstance();

  const h: Harness = {
    app,
    prisma,
    queue,
    config,
    setAiResult(fn) {
      respond = fn;
    },
    async request({ method, url, token, body, headers }) {
      const res = await server.inject({
        method,
        url,
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(headers ?? {}) },
        ...(body !== undefined ? { payload: body as Record<string, unknown> } : {}),
      });
      const parsed = res.body ? safeJson(res.body) : null;
      return { status: res.statusCode, body: parsed, json: <T>() => parsed as T };
    },
    async login(email, password) {
      const res = await h.request({ method: 'POST', url: '/api/v1/auth/login', body: { email, password } });
      if (res.status !== 200) throw new Error(`login failed ${res.status}: ${JSON.stringify(res.body)}`);
      return res.json<TokenResponse>();
    },
    async createUser(token, role, email = `${role}-${randomUUID().slice(0, 8)}@acceptance.test`) {
      const res = await h.request({ method: 'POST', url: '/api/v1/users', token, body: { email, name: `${role} user`, password: PASSWORD, role } });
      if (res.status !== 201) throw new Error(`createUser failed ${res.status}: ${JSON.stringify(res.body)}`);
      const { id } = res.json<{ id: string }>();
      const tokens = await h.login(email, PASSWORD);
      return { id, email, token: tokens.accessToken };
    },
    async upload(token, metadata, image) {
      const form = new FormData();
      form.append('metadata', JSON.stringify(metadata));
      form.append('file', new Blob([new Uint8Array(image ?? (await jpeg()))], { type: 'image/jpeg' }), 'photo.jpg');
      const res = await server.inject({ method: 'POST', url: '/api/v1/photos', headers: { authorization: `Bearer ${token}` }, payload: form });
      const parsed = safeJson(res.body);
      return { status: res.statusCode, json: <T>() => parsed as T };
    },
    async close() {
      await app.close();
      await rm(storageDir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
  return h;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Create a project + site + visit assigned to the technician; returns ids. */
export async function siteWithVisit(h: Harness, adminToken: string, technicianId: string) {
  const suffix = randomUUID().slice(0, 8);
  const project = (await h.request({ method: 'POST', url: '/api/v1/projects', token: adminToken, body: { code: `P-${suffix}`, name: `Project ${suffix}` } })).json<{ id: string }>();
  const site = (
    await h.request({ method: 'POST', url: '/api/v1/sites', token: adminToken, body: { projectId: project.id, code: `site-${suffix}`, name: `Site ${suffix}`, exchange: 'TEST' } })
  ).json<{ id: string }>();
  await h.request({ method: 'POST', url: '/api/v1/devices', token: adminToken, body: { siteId: site.id, model: 'ASR-9906', hostname: `HOST-${suffix}` } });
  const visit = (
    await h.request({ method: 'POST', url: '/api/v1/visits', token: adminToken, body: { siteId: site.id, title: 'Install', technicianIds: [technicianId] } })
  ).json<{ id: string }>();
  return { projectId: project.id, siteId: site.id, visitId: visit.id };
}
