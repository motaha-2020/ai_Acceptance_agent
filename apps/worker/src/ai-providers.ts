import { createCascade, createProvider, DEFAULT_CASCADE, type ProviderName } from '@acceptance/ai';
import type { ProviderRegistry } from './providers.js';

/**
 * Real vision providers from @acceptance/ai, selectable with AI_PROVIDER. Imported only by the
 * standalone worker (main.ts), not re-exported from index.ts: @acceptance/ai loads sharp 0.35 and the
 * API process loads sharp 0.34, and two libvips builds must not share one process.
 */
export const AI_PROVIDER_NAMES = ['claude', 'gemini', 'openai', 'cascade'] as const;

export interface AiProviderEnv {
  /** Optional model override for a single provider (e.g. claude-sonnet-5-5); ignored for `cascade`. */
  AI_MODEL?: string;
}

/**
 * Register claude / gemini / openai (single vendor, default model of each adapter unless AI_MODEL
 * is set) and `cascade` (DEFAULT_CASCADE: Gemini Flash first, Claude Sonnet 5.5 on escalation).
 * Factories are lazy: a vendor SDK is only constructed (and its API key read) when selected.
 */
export function registerAiProviders(registry: ProviderRegistry, env: AiProviderEnv = {}): void {
  const model = env.AI_MODEL?.trim() || undefined;
  for (const name of ['claude', 'gemini', 'openai'] as const satisfies readonly ProviderName[]) {
    registry.register(name, () => createProvider(name, model ? { model } : {}));
  }
  registry.register('cascade', () => createCascade(DEFAULT_CASCADE));
}
