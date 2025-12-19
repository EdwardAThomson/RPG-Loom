import type { NarrativeBlock, NarrativeTask, NarrativeTaskType, TaskId } from '@rpg-loom/shared';

export interface CreateTaskRequest {
  type: NarrativeTaskType;
  backendId?: string | null;
  references?: Record<string, string>;
  facts: Record<string, unknown>;
}

export interface CreateTaskResponse {
  taskId: TaskId;
}

export type TaskStreamEvent =
  | { type: 'token'; data: string }
  | { type: 'line'; data: string }
  | { type: 'json'; data: unknown }
  | { type: 'done'; data: { ok: true; block?: NarrativeBlock } }
  | { type: 'error'; data: { message: string } };

export class GuildboundClient {
  constructor(public readonly baseUrl: string) {}

  async createNarrativeTask(req: CreateTaskRequest): Promise<CreateTaskResponse> {
    const res = await fetch(`${this.baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req)
    });
    if (!res.ok) throw new Error(`createNarrativeTask failed: ${res.status}`);
    return (await res.json()) as CreateTaskResponse;
  }

  async getTask(taskId: TaskId): Promise<NarrativeTask> {
    const res = await fetch(`${this.baseUrl}/api/tasks/${taskId}`);
    if (!res.ok) throw new Error(`getTask failed: ${res.status}`);
    return (await res.json()) as NarrativeTask;
  }

  streamTask(taskId: TaskId, onEvent: (evt: TaskStreamEvent) => void): AbortController {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(`${this.baseUrl}/api/tasks/${taskId}/stream`, { signal: controller.signal });
        if (!res.ok || !res.body) {
          onEvent({ type: 'error', data: { message: `stream failed: ${res.status}` } });
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Basic SSE parsing: events are separated by \n\n
          let idx: number;
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const chunk = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const evt = parseSseChunk(chunk);
            if (evt) onEvent(evt);
          }
        }
      } catch (err: any) {
        if (controller.signal.aborted) return;
        onEvent({ type: 'error', data: { message: err?.message ?? String(err) } });
      }
    })();

    return controller;
  }
}

function parseSseChunk(chunk: string): TaskStreamEvent | null {
  // We expect lines like:
  // event: token
  // data: ...
  const lines = chunk.split('\n').map((l) => l.trimEnd());
  let eventType = 'token';
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event:')) eventType = line.slice('event:'.length).trim();
    if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trim());
  }
  const data = dataLines.join('\n');

  // Gateway encodes SSE data as JSON (even for strings).
  // Try to decode it so consumers don't have to deal with quotes/escapes.
  const decoded = (() => {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  })();

  if (eventType === 'done') {
    return { type: 'done', data: (decoded as any) ?? { ok: true } };
  }

  if (eventType === 'json') {
    return { type: 'json', data: decoded };
  }

  if (eventType === 'line') return { type: 'line', data: String(decoded) };
  if (eventType === 'error') {
    if (decoded && typeof decoded === 'object' && 'message' in (decoded as any)) {
      return { type: 'error', data: { message: String((decoded as any).message) } };
    }
    return { type: 'error', data: { message: String(decoded) } };
  }
  return { type: 'token', data: String(decoded) };
}
