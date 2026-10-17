/**
 * POST /api/llm/generate on the configured backend (local gateway or the
 * Cloudflare Worker). Adds the signed-in player's bearer token, which the
 * Worker requires for AI (the local gateway ignores it), and allows a long
 * timeout because generation can take tens of seconds.
 */

import { gatewayFetch } from './gateway';
import { getToken } from './auth';

const LLM_TIMEOUT_MS = 60_000;

export function llmGenerateFetch(init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return gatewayFetch('/api/llm/generate', { ...init, headers }, { timeoutMs: LLM_TIMEOUT_MS });
}
