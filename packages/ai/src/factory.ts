import type { AnalysisProvider } from '@acceptance/shared';
import { CascadeProvider, type CascadePolicy } from './cascade.js';
import { VisionProvider, type CoreOptions, type VendorClient } from './core.js';
import { fewShotFromEnv } from './fewshot.js';
import { FEW_SHOT_MANIFEST } from './fewshot-manifest.js';
import { ClaudeVendor, type ClaudeOptions } from './providers/claude.js';
import { FakeVendor, type FakeOptions } from './providers/fake.js';
import { GeminiVendor, type GeminiOptions } from './providers/gemini.js';
import { OpenAIVendor, type OpenAIOptions } from './providers/openai.js';

export const PROVIDER_NAMES = ['claude', 'gemini', 'openai', 'fake'] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export type ProviderOptions = CoreOptions & {
  claude?: ClaudeOptions;
  gemini?: GeminiOptions;
  openai?: OpenAIOptions;
  fake?: FakeOptions;
  /** Shortcut that overrides the vendor-specific model option. */
  model?: string;
  /**
   * When no `fewShot` source is given, use the bundled curated manifest with images from
   * AI_FEWSHOT_DIR / AI_FEWSHOT_BASE_URL (if set). Default true; the eval CLI passes false.
   */
  defaultFewShot?: boolean;
  env?: NodeJS.ProcessEnv;
};

export function isProviderName(v: string): v is ProviderName {
  return (PROVIDER_NAMES as readonly string[]).includes(v);
}

export function createVendor(name: ProviderName, options: ProviderOptions = {}): VendorClient {
  const model = options.model;
  switch (name) {
    case 'claude':
      return new ClaudeVendor({ ...options.claude, ...(model ? { model } : {}) });
    case 'gemini':
      return new GeminiVendor({ ...options.gemini, ...(model ? { model } : {}) });
    case 'openai':
      return new OpenAIVendor({ ...options.openai, ...(model ? { model } : {}) });
    case 'fake':
      return new FakeVendor({ ...options.fake, ...(model ? { model } : {}) });
  }
}

/** One provider by name. API keys come from options or ANTHROPIC_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY. */
export function createProvider(name: ProviderName, options: ProviderOptions = {}): VisionProvider {
  const fewShot = options.fewShot ?? (options.defaultFewShot === false || name === 'fake' ? undefined : fewShotFromEnv(FEW_SHOT_MANIFEST, options.env));
  return new VisionProvider(createVendor(name, options), { ...options, ...(fewShot ? { fewShot, fewShotMaxSide: options.fewShotMaxSide ?? FEW_SHOT_MANIFEST.maxSide } : {}) });
}

export interface CascadeSpec {
  first: { name: ProviderName; options?: ProviderOptions };
  second: { name: ProviderName; options?: ProviderOptions };
  policy?: Partial<CascadePolicy>;
}

/** Recommended production default (pending T3.6 numbers): Gemini Flash first, Claude Sonnet 5.5 for escalations. */
export const DEFAULT_CASCADE: CascadeSpec = {
  first: { name: 'gemini' },
  second: { name: 'claude', options: { model: 'claude-sonnet-5-5' } },
  policy: { minConfidence: 0.7 },
};

export function createCascade(spec: CascadeSpec = DEFAULT_CASCADE, shared: CoreOptions = {}): AnalysisProvider {
  return new CascadeProvider(
    createProvider(spec.first.name, { ...shared, ...spec.first.options }),
    createProvider(spec.second.name, { ...shared, ...spec.second.options }),
    spec.policy,
  );
}
