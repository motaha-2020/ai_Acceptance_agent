import { describe, expect, it } from 'vitest';
import { registerAiProviders } from '../src/ai-providers.js';
import { buildProviderRegistry } from '../src/runtime.js';

describe('registerAiProviders', () => {
  it('registers the real vendors and the cascade next to fake, lazily', () => {
    const registry = buildProviderRegistry((r) => registerAiProviders(r, { AI_MODEL: 'claude-sonnet-5-5' }));
    expect(registry.names().sort()).toEqual(['cascade', 'claude', 'fake', 'gemini', 'openai']);
  });

  it('builds a provider only when selected (API key read at construction)', () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
    try {
      const registry = buildProviderRegistry((r) => registerAiProviders(r, { AI_MODEL: 'claude-sonnet-5-5' }));
      const provider = registry.get('claude');
      expect(typeof provider.analyze).toBe('function');
    } finally {
      if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prev;
    }
  });
});
