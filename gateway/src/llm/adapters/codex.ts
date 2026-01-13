/**
 * Codex CLI Adapter
 * 
 * Adapter for the Codex CLI tool.
 * Uses exec --full-auto --skip-git-repo-check for automated execution.
 */

import type { CLIAdapter, CLIAdapterParams, CLIInvocation } from './base.js';

export class CodexAdapter implements CLIAdapter {
    buildCommand({ prompt, cwd }: CLIAdapterParams): CLIInvocation {
        const command = process.env.CODEX_CMD ?? 'codex';
        const args: string[] = ['exec', '--full-auto', '--skip-git-repo-check'];

        // Add working directory if specified
        if (cwd) {
            args.push('-C', cwd);
        }

        // Prompt is the last argument
        args.push(prompt);

        return {
            command,
            args,
            env: process.env as Record<string, string>,
            responseFormat: 'text' // Codex outputs plain text
        };
    }
}
