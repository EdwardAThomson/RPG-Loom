import type { Env } from '../types';

// Two AI pools, as in DungeonGPT's cf-worker:
//   - free:    Workers AI (`AI` binding), open-weights models, no API key.
//   - members: OpenRouter, paid per token, needs OPENROUTER_API_KEY and an
//              Octonion membership (enforced in routes/llm.ts).
// Both walk a short fallback chain (default first, then registry order) so one
// bad model never kills a generation. Model lists are curated copies of
// DungeonGPT's registries; re-verify ids when touching them.

export interface ModelDefinition {
  id: string;
  displayName: string;
  maxTokens: number;
  /** OpenRouter only: pin routing to these hosts (provider.only). */
  providerOnly?: readonly string[];
}

export const FREE_MODELS: readonly ModelDefinition[] = [
  { id: '@cf/openai/gpt-oss-120b', displayName: 'GPT-OSS 120B', maxTokens: 4096 },
  { id: '@cf/openai/gpt-oss-20b', displayName: 'GPT-OSS 20B', maxTokens: 4096 },
  { id: '@cf/meta/llama-4-scout-17b-16e-instruct', displayName: 'Llama 4 Scout 17B', maxTokens: 4096 },
  { id: '@cf/meta/llama-3.1-8b-instruct-fast', displayName: 'Llama 3.1 8B Fast', maxTokens: 2048 }
];
export const DEFAULT_FREE_MODEL = '@cf/openai/gpt-oss-120b';

export const MEMBER_MODELS: readonly ModelDefinition[] = [
  {
    id: 'deepseek/deepseek-v3.2',
    displayName: 'DeepSeek V3.2',
    maxTokens: 1500,
    providerOnly: ['deepinfra', 'digitalocean', 'venice']
  },
  { id: 'anthropic/claude-haiku-4.5', displayName: 'Claude Haiku 4.5', maxTokens: 1500 },
  { id: 'openai/gpt-5-mini', displayName: 'GPT-5 Mini', maxTokens: 1500 },
  { id: 'google/gemini-3.5-flash', displayName: 'Gemini 3.5 Flash', maxTokens: 1500 }
];
export const DEFAULT_MEMBER_MODEL = 'deepseek/deepseek-v3.2';

const DEFAULT_MAX_TOKENS = 800;
const DEFAULT_TEMPERATURE = 0.7;

export class AiServiceError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'AiServiceError';
  }
}

/** Workers AI refuses everything once the daily neuron allocation is spent (resets 00:00 UTC). */
export const AI_QUOTA_CODE = 'ai_quota';
function isQuotaExhausted(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /\b4006\b|daily free allocation|neurons/i.test(msg);
}

export function isMemberPoolConfigured(env: Env): boolean {
  return typeof env.OPENROUTER_API_KEY === 'string' && env.OPENROUTER_API_KEY.length > 0;
}

export interface GenerateOptions {
  prompt: string;
  modelId?: string;
  maxTokens?: number;
  temperature?: number;
}

type Caller = (env: Env, model: ModelDefinition, opts: Required<Omit<GenerateOptions, 'modelId'>>) => Promise<string>;

async function callWorkersAi(env: Env, model: ModelDefinition, opts: Required<Omit<GenerateOptions, 'modelId'>>): Promise<string> {
  let response: unknown;
  try {
    response = await env.AI.run(model.id as Parameters<Env['AI']['run']>[0], {
      messages: [{ role: 'user', content: opts.prompt }],
      max_tokens: opts.maxTokens,
      temperature: opts.temperature
    });
  } catch (error) {
    if (isQuotaExhausted(error)) {
      throw new AiServiceError('Workers AI daily allocation used up', 503, AI_QUOTA_CODE);
    }
    throw new AiServiceError(`Workers AI error: ${error instanceof Error ? error.message : String(error)}`, 502);
  }

  // Legacy `{ response }` or OpenAI-style `{ choices: [{ message: { content } }] }`.
  const r = response as any;
  if (typeof r?.response === 'string' && r.response.length > 0) return r.response;
  const content = r?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.length > 0) return content;
  // Reasoning models that run out of tokens mid-thought return content null.
  throw new AiServiceError('Unexpected or empty Workers AI response', 502);
}

async function callOpenRouter(env: Env, model: ModelDefinition, opts: Required<Omit<GenerateOptions, 'modelId'>>): Promise<string> {
  let response: Response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://rpg-loom.octonion.io',
        'X-Title': 'RPG Loom'
      },
      body: JSON.stringify({
        model: model.id,
        messages: [{ role: 'user', content: opts.prompt }],
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        ...(model.providerOnly ? { provider: { only: [...model.providerOnly], allow_fallbacks: false } } : {})
      })
    });
  } catch (error) {
    throw new AiServiceError(`OpenRouter network error: ${error instanceof Error ? error.message : String(error)}`, 502);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(`OpenRouter HTTP ${response.status} for ${model.id}: ${body.slice(0, 300)}`);
    throw new AiServiceError(`OpenRouter error: HTTP ${response.status}`, 502);
  }
  const data = (await response.json().catch(() => null)) as any;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.length > 0) return content;
  throw new AiServiceError('Unexpected OpenRouter response format', 502);
}

async function generateWithChain(
  env: Env,
  registry: readonly ModelDefinition[],
  defaultId: string,
  call: Caller,
  opts: GenerateOptions
): Promise<{ text: string; modelId: string }> {
  // Unknown or absent model ids (e.g. a stale client setting) use the default.
  const primary = registry.find((m) => m.id === opts.modelId) ?? registry.find((m) => m.id === defaultId)!;
  const chain = [primary, ...registry.filter((m) => m.id !== primary.id)].slice(0, 3);
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const temperature = opts.temperature ?? DEFAULT_TEMPERATURE;

  let firstError: unknown;
  for (const model of chain) {
    try {
      const text = await call(env, model, {
        prompt: opts.prompt,
        maxTokens: Math.min(maxTokens, model.maxTokens),
        temperature
      });
      return { text: text.trim(), modelId: model.id };
    } catch (error) {
      console.error(`[ai] model ${model.id} failed:`, error instanceof Error ? error.message : error);
      // Every free model draws on the same allocation; a fallback can't help.
      if (error instanceof AiServiceError && error.code === AI_QUOTA_CODE) throw error;
      firstError ??= error;
    }
  }
  throw new AiServiceError(
    `AI generation failed (all fallbacks exhausted): ${firstError instanceof Error ? firstError.message : String(firstError)}`,
    502
  );
}

export function generateFree(env: Env, opts: GenerateOptions) {
  return generateWithChain(env, FREE_MODELS, DEFAULT_FREE_MODEL, callWorkersAi, opts);
}

export function generateMember(env: Env, opts: GenerateOptions) {
  if (!isMemberPoolConfigured(env)) {
    return Promise.reject(new AiServiceError('OPENROUTER_API_KEY is not set', 503));
  }
  return generateWithChain(env, MEMBER_MODELS, DEFAULT_MEMBER_MODEL, callOpenRouter, opts);
}
