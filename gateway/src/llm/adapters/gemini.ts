/**
 * Gemini CLI Adapter
 * 
 * Adapter for the Gemini CLI tool.
 * Uses --output-format stream-json for structured streaming output.
 */

import type { CLIAdapter, CLIAdapterParams, CLIInvocation } from './base.js';

export class GeminiAdapter implements CLIAdapter {
    buildCommand({ prompt, model }: CLIAdapterParams): CLIInvocation {
        const command = process.env.GEMINI_CMD ?? 'gemini';
        const args: string[] = [
            '--output-format', 'stream-json',
            '--prompt', prompt
        ];

        // Add model if specified
        if (model) {
            args.push('--model', model);
        }

        return {
            command,
            args,
            env: process.env as Record<string, string>,
            responseFormat: 'json-stream'
        };
    }
}
