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

    let output = '';
    let lastError: string | null = null;
    let stderrOutput = '';

    // Read stdout and stderr concurrently to prevent deadlock
    const [stdoutData, stderrData] = await Promise.all([
        // Read stdout
        (async () => {
            const rl = readline.createInterface({ input: proc.stdout });
            let data = '';

            for await (const line of rl) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                // Handle JSON streaming format
                if (invocation.responseFormat === 'json-stream') {
                    try {
                        const evt = JSON.parse(trimmed);

                        // Extract assistant messages
                        if (evt?.type === 'message' && evt?.role === 'assistant' && typeof evt?.content === 'string') {
                            data += evt.content;
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
                    data += trimmed + '\n';
                }
            }
            return data;
        })(),

        // Read stderr
        (async () => {
            const rl = readline.createInterface({ input: proc.stderr });
            let data = '';
            for await (const line of rl) {
                data += line + '\n';
            }
            return data;
        })()
    ]);

    output = stdoutData;
    stderrOutput = stderrData;

    // Wait for process to exit
    const exitCode = await new Promise<number>((resolve) => {
        proc.on('close', (code) => resolve(code ?? 1));
    });

    if (exitCode !== 0) {
        // Log the full detail (including the prompt embedded in args)
        // for server-side debugging. The thrown error keeps just the
        // bits a caller can safely surface — provider + exit code +
        // any short stderr message. The prompt is end-user content;
        // /api/llm/generate returns error.message to the client, and
        // we don't want it echoed into the UI.
        logCliFailure({
            provider,
            invocation,
            exitCode,
            lastError,
            stderrOutput,
            output
        });
        const summary = summarizeCliStderr(stderrOutput) || lastError;
        const suffix = summary ? `: ${summary}` : '';
        throw new Error(`AI provider "${provider}" failed (exit code ${exitCode})${suffix}`);
    }

    if (!output.trim()) {
        logCliFailure({
            provider,
            invocation,
            exitCode,
            lastError,
            stderrOutput,
            output,
            reason: 'no output'
        });
        const summary = summarizeCliStderr(stderrOutput) || lastError;
        const suffix = summary ? `: ${summary}` : '';
        throw new Error(`AI provider "${provider}" returned no output${suffix}`);
    }

    return output.trim();
}

/**
 * Server-side detailed log of a CLI failure. Includes the full command
 * (prompt and all) so the operator can reproduce. Kept here so callers
 * don't have to remember the discipline of redacting before throwing.
 */
function logCliFailure(opts: {
    provider: string;
    invocation: { command: string; args: string[] };
    exitCode: number;
    lastError: string | null;
    stderrOutput: string;
    output: string;
    reason?: string;
}) {
    const lines = [
        `[CLI] ${opts.reason ?? 'process failed'} — provider=${opts.provider} exit=${opts.exitCode}`,
        `[CLI] command: ${opts.invocation.command} ${opts.invocation.args.join(' ')}`
    ];
    if (opts.lastError) lines.push(`[CLI] lastError: ${opts.lastError}`);
    if (opts.stderrOutput.trim()) lines.push(`[CLI] stderr:\n${opts.stderrOutput.trim()}`);
    if (opts.output.trim()) lines.push(`[CLI] stdout:\n${opts.output.trim()}`);
    console.error(lines.join('\n'));
}

/**
 * Pull the most actionable line out of stderr without echoing
 * arbitrary content. We allow short stderr summaries through —
 * e.g. CLI usage errors like "Error: --output-format=stream-json
 * requires --verbose" — but cap aggressively so a CLI that decided
 * to log the prompt into stderr can't leak it.
 */
function summarizeCliStderr(stderr: string): string | null {
    const trimmed = stderr.trim();
    if (!trimmed) return null;
    // First non-empty line is usually the operative error message.
    const firstLine = trimmed.split('\n').find(l => l.trim().length > 0)?.trim() ?? '';
    // Hard cap to keep accidental prompt-in-stderr leaks bounded.
    return firstLine.length > 200 ? null : firstLine;
}
