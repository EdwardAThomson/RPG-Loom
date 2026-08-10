/**
 * Gateway connection service
 *
 * Centralises the gateway URL and tracks whether the gateway is reachable.
 * Components can check `isGatewayAvailable()` before making calls and
 * subscribe to connectivity changes via `onGatewayStatusChange`.
 */

// Fall back to the local dev gateway only in dev builds. In production,
// no VITE_GATEWAY_URL means no gateway: an empty URL makes gatewayFetch
// short-circuit instead of hitting localhost from a public origin (which
// triggers the browser's local-network-access permission prompt).
const GATEWAY_URL =
    import.meta.env.VITE_GATEWAY_URL?.replace(/\/+$/, '') ||
    (import.meta.env.DEV ? 'http://localhost:8787' : '');

let gatewayAvailable: boolean | null = null; // null = unknown
type StatusListener = (available: boolean) => void;
const listeners: StatusListener[] = [];

export function getGatewayUrl(): string {
    return GATEWAY_URL;
}

export function isGatewayAvailable(): boolean | null {
    return gatewayAvailable;
}

export function onGatewayStatusChange(fn: StatusListener): () => void {
    listeners.push(fn);
    return () => {
        const idx = listeners.indexOf(fn);
        if (idx >= 0) listeners.splice(idx, 1);
    };
}

function setAvailable(value: boolean) {
    if (gatewayAvailable !== value) {
        gatewayAvailable = value;
        listeners.forEach(fn => fn(value));
    }
}

/**
 * Fetch wrapper that marks the gateway as unavailable on network errors
 * and available on successful responses.
 */
export async function gatewayFetch(
    path: string,
    init?: RequestInit
): Promise<Response> {
    if (!GATEWAY_URL) {
        setAvailable(false);
        throw new Error('No gateway configured (VITE_GATEWAY_URL unset)');
    }
    const url = `${GATEWAY_URL}${path}`;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(url, { ...init, signal: controller.signal });
        clearTimeout(timeout);
        setAvailable(true);
        return res;
    } catch (err) {
        setAvailable(false);
        throw err;
    }
}

/** Quick connectivity probe — fire-and-forget on startup. */
export async function probeGateway(): Promise<boolean> {
    try {
        await gatewayFetch('/api/llm/providers');
        return true;
    } catch {
        return false;
    }
}
