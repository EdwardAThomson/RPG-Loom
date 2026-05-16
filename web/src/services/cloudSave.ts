/**
 * Client wrapper around the gateway's /api/saves endpoints.
 *
 * Phase 4d keeps the surface tight: a single slot, no listing UI. The
 * server-side schema supports multi-slot already; expanding here is a
 * UI change only.
 */

import type { EngineState } from '@rpg-loom/shared';
import { gatewayFetch } from './gateway';
import { getToken } from './auth';

export interface CloudSave {
  id: string;
  userId: string;
  slot: number;
  engineVersion: number;
  contentVersion: string;
  state: EngineState;
  generation: number;
  updatedAt: string; // ISO
}

export type PushResult =
  | { kind: 'ok'; save: CloudSave }
  | { kind: 'conflict'; current: CloudSave }
  | { kind: 'unauthenticated' }
  | { kind: 'unavailable' }; // gateway / DB / auth not configured (503)

export type FetchResult =
  | { kind: 'ok'; save: CloudSave }
  | { kind: 'empty' } // 404 — no save in that slot
  | { kind: 'unauthenticated' }
  | { kind: 'unavailable' };

function authHeader(): Record<string, string> | null {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : null;
}

export async function fetchSave(slot: number): Promise<FetchResult> {
  const auth = authHeader();
  if (!auth) return { kind: 'unauthenticated' };

  const res = await gatewayFetch(`/api/saves/${slot}`, { headers: auth });
  if (res.status === 401) return { kind: 'unauthenticated' };
  if (res.status === 503) return { kind: 'unavailable' };
  if (res.status === 404) return { kind: 'empty' };
  if (!res.ok) throw new Error(`fetchSave: ${res.status} ${await res.text()}`);

  const body = (await res.json()) as { save: CloudSave };
  return { kind: 'ok', save: body.save };
}

export async function pushSave(
  slot: number,
  state: EngineState,
  expectedGeneration?: number
): Promise<PushResult> {
  const auth = authHeader();
  if (!auth) return { kind: 'unauthenticated' };

  const res = await gatewayFetch(`/api/saves/${slot}`, {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      engineVersion: state.engineVersion,
      contentVersion: state.contentVersion,
      state,
      expectedGeneration
    })
  });

  if (res.status === 401) return { kind: 'unauthenticated' };
  if (res.status === 503) return { kind: 'unavailable' };
  if (res.status === 409) {
    const body = (await res.json()) as { current: CloudSave };
    return { kind: 'conflict', current: body.current };
  }
  if (!res.ok) throw new Error(`pushSave: ${res.status} ${await res.text()}`);

  const body = (await res.json()) as { save: CloudSave };
  return { kind: 'ok', save: body.save };
}

export async function deleteCloudSave(slot: number): Promise<boolean> {
  const auth = authHeader();
  if (!auth) return false;

  const res = await gatewayFetch(`/api/saves/${slot}`, {
    method: 'DELETE',
    headers: auth
  });
  return res.ok;
}
