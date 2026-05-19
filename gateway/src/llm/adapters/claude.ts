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

        // Request JSON streaming format. The Claude CLI requires
        // --verbose alongside --output-format=stream-json when invoked
        // non-interactively (`-p / --print`); without it the CLI exits
        // with "Error: When using --print, --output-format=stream-json
        // requires --verbose". --verbose adds extra event types to the
        // stream which the generator's parser already ignores (it picks
        // out assistant messages and discards the rest).
        args.push('--output-format', 'stream-json', '--verbose');

        return {
            command,
            args,
            env: process.env as Record<string, string>,
            responseFormat: 'json-stream'
        };
    }
}
