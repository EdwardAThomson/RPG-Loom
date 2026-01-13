/**
 * Unified LLM Generator
 * 
 * Provides a single interface for generating text with any LLM provider,
 * whether it's a Cloud API or CLI tool.
 */

import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { getAdapter } from './adapters/index.js';
import { generateWithGemini } from './cloud/gemini.js';
import { generateWithOpenAI } from './cloud/openai.js';
import { generateWithClaude } from './cloud/claude.js';
import { isCLIProvider, isCloudProvider, getDefaultModel } from './providers.js';

export interface GenerateParams {
    /** Provider ID (e.g., 'gemini', 'openai', 'claude', 'gemini-cli') */
    provider: string;

    /** Model to use (optional, will use default for provider if not specified) */
    model?: string;

    /** The prompt to send to the LLM */
    prompt: string;

    /** API key for Cloud providers (optional for CLI) */
    apiKey?: string;

    /** Maximum tokens to generate */
    maxTokens?: number;

    /** Temperature for generation (0.0 - 1.0) */
    temperature?: number;

    /** Working directory for CLI tools */
    cwd?: string;
}

/**
 * Generate text using any supported LLM provider
 * 
 * Automatically routes to the appropriate backend (Cloud API or CLI)
 * based on the provider type.
 */
export async function generateUnified(params: GenerateParams): Promise<string> {
    const { provider, model, prompt, apiKey, maxTokens, temperature, cwd } = params;

    // Use default model if not specified
    const effectiveModel = model ?? getDefaultModel(provider);

    // Route to CLI providers
    if (isCLIProvider(provider)) {
        return await generateWithCLI({
            provider,
            model: effectiveModel,
            prompt,
            cwd
        });
    }

    // Route to Cloud providers
    if (isCloudProvider(provider)) {
        if (!apiKey) {
            throw new Error(`API key required for Cloud provider: ${provider}`);
        }

        return await generateWithCloud({
            provider,
            model: effectiveModel,
            prompt,
            apiKey,
            maxTokens,
            temperature
        });
    }

    throw new Error(`Unsupported provider: ${provider}`);
}

/**
 * Generate text using a Cloud API provider
 */
async function generateWithCloud(params: {
    provider: string;
    model: string;
    prompt: string;
    apiKey: string;
    maxTokens?: number;
    temperature?: number;
}): Promise<string> {
    const { provider, model, prompt, apiKey, maxTokens, temperature } = params;

    switch (provider) {
        case 'gemini':
            return await generateWithGemini({ model, prompt, apiKey, maxTokens, temperature });

        case 'openai':
            return await generateWithOpenAI({ model, prompt, apiKey, maxTokens, temperature });

        case 'claude':
            return await generateWithClaude({ model, prompt, apiKey, maxTokens, temperature });

        default:
            throw new Error(`Unknown Cloud provider: ${provider}`);
    }
}

/**
 * Generate text using a CLI tool
 */
async function generateWithCLI(params: {
    provider: string;
    model?: string;
    prompt: string;
    cwd?: string;
}): Promise<string> {
    const { provider, model, prompt, cwd } = params;

    // Normalize provider name (remove -cli suffix)
    const backendName = provider.replace('-cli', '');
    const adapter = getAdapter(backendName);

    if (!adapter) {
        throw new Error(`No CLI adapter found for: ${backendName}`);
    }

    // Build command invocation
    const invocation = adapter.buildCommand({ prompt, model, cwd });

    // Spawn the CLI process
    const proc = spawn(invocation.command, invocation.args, {
        env: { ...process.env, ...invocation.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd
    });

    // Read stdout
    const rl = readline.createInterface({ input: proc.stdout });
    let output = '';
    let lastError: string | null = null;

    for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Handle JSON streaming format
        if (invocation.responseFormat === 'json-stream') {
            try {
                const evt = JSON.parse(trimmed);

                // Extract assistant messages
                if (evt?.type === 'message' && evt?.role === 'assistant' && typeof evt?.content === 'string') {
                    output += evt.content;
                }

                // Track errors
                if (evt?.type === 'error' && evt?.message) {
                    lastError = String(evt.message);
                }
            } catch {
                // Not JSON, skip (likely debug output)
            }
        } else {
            // Plain text format
            output += trimmed + '\n';
        }
    }

    // Wait for process to exit
    const exitCode = await new Promise<number>((resolve) => {
        proc.on('close', (code) => resolve(code ?? 1));
    });

    if (exitCode !== 0) {
        throw new Error(lastError ?? `CLI process exited with code ${exitCode}`);
    }

    if (!output.trim()) {
        throw new Error(lastError ?? 'CLI produced no output');
    }

    return output.trim();
}
