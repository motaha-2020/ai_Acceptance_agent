import type { E2eUser } from './config.mjs';

export function api<T = any>(apiUrl: string, token: string | null, method: string, path: string, body?: unknown): Promise<T>;
export function login(apiUrl: string, user: E2eUser): Promise<string>;
export function makePhoto(label: string, seed: number): Promise<Buffer>;
export function uploadPhoto(
  apiUrl: string,
  token: string,
  input: { visitId: string; category: string; label: string; seed: number; capturedAt?: string; fixesPhotoId?: string },
): Promise<{ photo?: { id: string }; id?: string; created?: boolean }>;
export function seedDemoData(opts: { apiUrl: string; log?: (m: string) => void }): Promise<{ visit: { id: string }; visit2: { id: string }; site: { id: string }; site2: { id: string } }>;
