/**
 * CLI Adapter Registry
 * 
 * Central registry for all CLI adapters.
 * Provides a factory function to get the appropriate adapter for a given backend.
 */

import type { CLIAdapter } from './base.js';
import { GeminiAdapter } from './gemini.js';
import { ClaudeAdapter } from './claude.js';
import { CodexAdapter } from './codex.js';

/**
 * Get the appropriate CLI adapter for the given backend name
 * 
 * @param backend - Backend name (e.g., 'gemini', 'claude', 'codex')
 * @returns CLIAdapter instance or null if backend is unknown
 */
export function getAdapter(backend: string): CLIAdapter | null {
    const normalized = backend.toLowerCase().replace('-cli', '');

    switch (normalized) {
        case 'gemini':
            return new GeminiAdapter();

        case 'claude':
            return new ClaudeAdapter();

        case 'codex':
            return new CodexAdapter();

        default:
            return null;
    }
}

/**
 * Check if an adapter exists for the given backend
 */
export function hasAdapter(backend: string): boolean {
    return getAdapter(backend) !== null;
}
