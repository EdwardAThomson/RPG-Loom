/**
 * Claude CLI Adapter
 * 
 * Adapter for the Claude CLI tool.
 * Uses -p for prompt and --output-format stream-json for structured output.
 */

import type { CLIAdapter, CLIAdapterParams, CLIInvocation } from './base.js';

export class ClaudeAdapter implements CLIAdapter {
    buildCommand({ prompt, model }: CLIAdapterParams): CLIInvocation {
        const command = process.env.CLAUDE_CMD ?? 'claude';
        const args: string[] = ['-p', prompt];

        // Add model if specified
        if (model) {
            args.push('--model', model);
        }

        // Request JSON streaming format
        args.push('--output-format', 'stream-json');

        return {
            command,
            args,
            env: process.env as Record<string, string>,
            responseFormat: 'json-stream'
        };
    }
}
