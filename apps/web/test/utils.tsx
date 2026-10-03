import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { render, type RenderOptions } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SessionProvider } from '@/components/session-provider';
import type { Me, QueueItem, RoleDto, SnagDto } from '@/lib/api/types';
import ar from '../messages/ar.json';
import en from '../messages/en.json';

const MESSAGES = { ar, en } as const;

export function makeMe(role: RoleDto = 'reviewer'): Me {
  return {
    id: 'u-me',
    email: 'me@example.test',
    name: 'Test User',
    phone: null,
    isActive: true,
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    companyId: null,
    role,
  };
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 }, mutations: { retry: false } } });
}

export function renderApp(ui: ReactElement, opts: { locale?: 'ar' | 'en'; role?: RoleDto; client?: QueryClient } & Omit<RenderOptions, 'wrapper'> = {}) {
  const { locale = 'en', role = 'reviewer', client = makeQueryClient(), ...rest } = opts;
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Africa/Cairo">
        <QueryClientProvider client={client}>
          <SessionProvider me={makeMe(role)}>
            <TooltipProvider>{children}</TooltipProvider>
          </SessionProvider>
        </QueryClientProvider>
      </NextIntlClientProvider>
    );
  }
  return { client, ...render(ui, { wrapper: Wrapper, ...rest }) };
}

let n = 0;
export function makeSnag(over: Partial<SnagDto> = {}): SnagDto {
  n++;
  return {
    id: `s${n}`,
    photoId: 'p1',
    analysisId: 'a1',
    code: 'PATCH_CORD_CROSSING',
    severity: 'major',
    bbox: { x: 0.2, y: 0.2, w: 0.3, h: 0.2 },
    textAr: 'تقاطع',
    textEn: 'Crossing',
    status: 'open',
    source: 'ai',
    createdById: null,
    dismissedAt: null,
    fixPhotoId: null,
    fixedAt: null,
    verifiedAt: null,
    createdAt: '2026-10-03T07:00:00.000Z',
    updatedAt: '2026-10-03T07:00:00.000Z',
    ...over,
  };
}

export function makeItem(id: string, over: Partial<QueueItem> = {}): QueueItem {
  return {
    id,
    clientUuid: `uuid-${id}`,
    visitId: 'v1',
    siteId: 'site1',
    category: 'patch_cords',
    status: 'pending_review',
    mimeType: 'image/jpeg',
    sizeBytes: 120_000,
    width: 1600,
    height: 1200,
    capturedAt: '2026-10-03T05:00:00.000Z',
    duplicateOfId: null,
    fixesPhotoId: null,
    aiSkipReason: null,
    uploadedById: 'tech1',
    uploadedAt: '2026-10-03T06:00:00.000Z',
    decidedById: null,
    decidedAt: null,
    rejectionReason: null,
    captureSource: 'camera',
    uploadBatchId: null,
    fileName: null,
    categoryState: 'confirmed',
    proposedCategory: null,
    proposedAlternative: null,
    categoryConfidence: null,
    updatedAt: '2026-10-03T06:00:00.000Z',
    gps: { lat: 30.04, lng: 31.23, accuracy: 5 },
    urls: { thumb: `/t/${id}.jpg`, web: `/w/${id}.jpg`, original: `/o/${id}.jpg`, expiresAt: '2026-10-03T08:00:00.000Z' },
    site: { id: 'site1', code: 'cairo-1', name: 'Cairo One', projectId: 'proj1' },
    visit: { id: 'v1', title: 'Round 1' },
    analysis: {
      id: `a-${id}`,
      photoId: id,
      status: 'succeeded',
      provider: 'fake',
      model: 'fake-1',
      promptVersion: 'x',
      verdict: 'accept',
      confidence: 0.93,
      categoryMatches: true,
      detectedCategory: null,
      qualityIssues: [],
      latencyMs: 10,
      error: null,
      createdAt: '2026-10-03T06:01:00.000Z',
    },
    snags: [],
    ...over,
  };
}

export interface FetchCall {
  method: string;
  path: string;
  body: unknown;
}

type Handler = (call: FetchCall) => { status?: number; json?: unknown } | undefined;

/** Minimal fetch router for the BFF proxy (`/api/proxy/...`). Unknown GETs return an empty page. */
export function installFetch(handlers: Handler[]): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input).replace(/^https?:\/\/[^/]+/, '');
    const call: FetchCall = {
      method: (init?.method ?? 'GET').toUpperCase(),
      path: url.replace('/api/proxy', '').split('?')[0] ?? '',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    for (const h of handlers) {
      const r = h(call);
      if (r) return new Response(r.json === undefined ? null : JSON.stringify(r.json), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
    }
    if (call.method === 'GET') return new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 25, devices: [], deviceInfo: null }), { status: 200 });
    return new Response(JSON.stringify({}), { status: 200 });
  };
  globalThis.fetch = impl as typeof fetch;
  return { calls };
}
