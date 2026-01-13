/**
 * LLM Provider Definitions
 * 
 * Defines available LLM providers, their types (CLI/Cloud/Mock),
 * and supported models for each provider.
 */

export const AVAILABLE_PROVIDERS = {
    'gemini-cli': {
        name: 'Gemini CLI',
        type: 'cli' as const,
        models: ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-2.5-flash', 'gemini-2.5-pro']
    },
    'gemini': {
        name: 'Gemini Cloud API',
        type: 'cloud' as const,
        models: ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash']
    },
    'openai': {
        name: 'OpenAI',
        type: 'cloud' as const,
        models: ['gpt-5', 'gpt-5-mini', 'gpt-4o']
    },
    'claude': {
        name: 'Claude',
        type: 'cloud' as const,
        models: ['claude-sonnet-4-5-20250929', 'claude-3-5-sonnet-20240620']
    },
    'claude-cli': {
        name: 'Claude CLI',
        type: 'cli' as const,
        models: ['claude-cli']
    },
    'codex': {
        name: 'Codex CLI',
        type: 'cli' as const,
        models: ['codex-cli']
    },
    'mock': {
        name: 'Mock (Testing)',
        type: 'mock' as const,
        models: ['mock']
    }
} as const;

export type ProviderId = keyof typeof AVAILABLE_PROVIDERS;
export type ProviderType = 'cli' | 'cloud' | 'mock';

export const DEFAULT_MODELS: Record<ProviderId, string> = {
    'gemini-cli': 'gemini-3-flash-preview',
    'gemini': 'gemini-3-flash-preview',
    'openai': 'gpt-5-mini',
    'claude': 'claude-sonnet-4-5-20250929',
    'claude-cli': 'claude-cli',
    'codex': 'codex-cli',
    'mock': 'mock'
};

/**
 * Get the default model for a given provider
 */
export function getDefaultModel(provider: string): string {
    return DEFAULT_MODELS[provider as ProviderId] ?? 'default';
}

/**
 * Check if a provider is a CLI-based provider
 */
export function isCLIProvider(provider: string): boolean {
    const providerInfo = AVAILABLE_PROVIDERS[provider as ProviderId];
    return providerInfo?.type === 'cli';
}

/**
 * Check if a provider is a Cloud API provider
 */
export function isCloudProvider(provider: string): boolean {
    const providerInfo = AVAILABLE_PROVIDERS[provider as ProviderId];
    return providerInfo?.type === 'cloud';
}
