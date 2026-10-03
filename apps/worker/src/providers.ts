import type { AnalysisProvider, AnalysisRequest, AnalysisResult } from '@acceptance/shared';

export type ProviderFactory = () => AnalysisProvider;

/**
 * Providers are registered at startup by name; the worker only knows the AnalysisProvider
 * contract from @acceptance/shared. Real adapters (Claude/Gemini/OpenAI from @acceptance/ai)
 * are registered by the composition root once that package is wired in.
 */
export class ProviderRegistry {
  private readonly factories = new Map<string, ProviderFactory>();
  private readonly instances = new Map<string, AnalysisProvider>();

  register(name: string, factory: ProviderFactory): this {
    this.factories.set(name, factory);
    this.instances.delete(name);
    return this;
  }

  has(name: string): boolean {
    return this.factories.has(name);
  }

  names(): string[] {
    return [...this.factories.keys()];
  }

  get(name: string): AnalysisProvider {
    let p = this.instances.get(name);
    if (!p) {
      const factory = this.factories.get(name);
      if (!factory) throw new Error(`AI provider "${name}" is not registered (known: ${this.names().join(', ') || 'none'})`);
      p = factory();
      this.instances.set(name, p);
    }
    return p;
  }
}

/**
 * Deterministic provider for tests and local development without API keys.
 * Default behaviour: accepts every photo with no snags.
 */
export class FakeAnalysisProvider implements AnalysisProvider {
  readonly name = 'fake';
  calls = 0;

  constructor(
    private readonly respond: (req: AnalysisRequest) => AnalysisResult | Promise<AnalysisResult> = () => ({
      categoryMatches: true,
      qualityIssues: [],
      verdict: 'accept',
      confidence: 0.9,
      snags: [],
    }),
  ) {}

  async analyze(req: AnalysisRequest) {
    this.calls++;
    const started = Date.now();
    const result = await this.respond(req);
    return {
      result,
      meta: {
        provider: 'fake',
        model: 'fake-vision-1',
        promptVersion: 'fake-1',
        inputTokens: 1000,
        outputTokens: 200,
        costUsd: 0.001,
        latencyMs: Date.now() - started,
      },
    };
  }
}
