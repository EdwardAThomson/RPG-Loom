import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { spawn, type ChildProcess } from 'node:child_process';
import readline from 'node:readline';

import { NarrativeBlockSchema, NarrativeTaskSchema } from '@rpg-loom/shared';
import type { NarrativeBlockDTO, NarrativeTaskDTO } from '@rpg-loom/shared';

// --- In-memory task store (MVP) ---
type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

interface TaskRecord {
  task: NarrativeTaskDTO;
  status: TaskStatus;
  output?: NarrativeBlockDTO;
  error?: string;
  // active SSE connections for this task
  streams: Set<express.Response>;

  // active subprocess (for cancel)
  proc?: ChildProcess;
}

const tasks = new Map<string, TaskRecord>();

const CreateTaskReqSchema = z.object({
  type: z.enum(['quest_flavor', 'npc_dialogue', 'rumor_feed', 'journal_entry']),
  backendId: z.string().min(1).nullable().optional(),
  references: z.record(z.string(), z.string()).optional().default({}),
  facts: z.record(z.string(), z.any())
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/tasks', (req, res) => {
  const parsed = CreateTaskReqSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const id = uuidv4();
  const task: NarrativeTaskDTO = {
    id,
    type: parsed.data.type,
    createdAtMs: Date.now(),
    backendId: parsed.data.backendId ?? null,
    references: parsed.data.references ?? {},
    facts: parsed.data.facts
  };

  const record: TaskRecord = {
    task,
    status: 'queued',
    streams: new Set()
  };

  // Validate task shape early
  const ok = NarrativeTaskSchema.safeParse(task);
  if (!ok.success) {
    return res.status(400).json({ error: ok.error.flatten() });
  }

  tasks.set(id, record);
  // Start async generation
  void runTask(record).catch((e) => {
    record.status = 'failed';
    record.error = String(e?.message ?? e);
    broadcast(record, { type: 'error', data: { message: record.error } });
    endStreams(record);
  });

  return res.json({ taskId: id });
});

app.get('/api/tasks/:id', (req, res) => {
  const record = tasks.get(req.params.id);
  if (!record) return res.status(404).json({ error: 'not_found' });
  res.json({
    id: record.task.id,
    type: record.task.type,
    status: record.status,
    output: record.output ?? null,
    error: record.error ?? null
  });
});

app.get('/api/tasks/:id/stream', (req, res) => {
  const record = tasks.get(req.params.id);
  if (!record) return res.status(404).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  record.streams.add(res);

  // If already done, immediately send final result
  if (record.status === 'succeeded' && record.output) {
    sse(res, { type: 'done', data: { ok: true, block: record.output } });
    res.end();
    record.streams.delete(res);
    return;
  }

  req.on('close', () => {
    record.streams.delete(res);
  });
});

app.post('/api/tasks/:id/cancel', (req, res) => {
  const record = tasks.get(req.params.id);
  if (!record) return res.status(404).json({ error: 'not_found' });
  if (record.status === 'running' || record.status === 'queued') {
    record.status = 'canceled';
    try {
      record.proc?.kill('SIGTERM');
    } catch { }
    broadcast(record, { type: 'error', data: { message: 'canceled' } });
    endStreams(record);
  }
  res.json({ ok: true, status: record.status });
});

const PORT = Number(process.env.PORT ?? 8787);
app.listen(PORT, () => {
  console.log(`[gateway] listening on http://localhost:${PORT}`);
});

// --- Task runner ---
async function runTask(record: TaskRecord): Promise<void> {
  if (record.status === 'canceled') return;
  record.status = 'running';

  // Dispatch by backendId (or default)
  const backendId = (record.task.backendId ?? process.env.DEFAULT_NARRATIVE_BACKEND ?? 'mock').toLowerCase();

  const output = await (async (): Promise<NarrativeBlockDTO> => {
    if (backendId === 'gemini' || backendId === 'gemini-cli' || backendId === 'gemini_cli') {
      return await geminiCliGenerate(record);
    }
    // default: mock (deterministic-ish)
    return await mockGenerateStreaming(record);
  })();

  // Validate output schema
  const validated = NarrativeBlockSchema.safeParse(output);
  if (!validated.success) {
    record.status = 'failed';
    record.error = validated.error.message;
    broadcast(record, { type: 'error', data: { message: record.error } });
    endStreams(record);
    return;
  }

  record.output = validated.data;
  record.status = 'succeeded';
  broadcast(record, { type: 'done', data: { ok: true, block: record.output } });
  endStreams(record);
}

async function mockGenerateStreaming(record: TaskRecord): Promise<NarrativeBlockDTO> {
  const output = mockGenerate(record.task);
  const json = JSON.stringify(output);
  for (const chunk of chunkString(json, 24)) {
    if (record.status === 'canceled') throw new Error('canceled');
    broadcast(record, { type: 'token', data: chunk });
    await sleep(12);
  }
  return output;
}

function mockGenerate(task: NarrativeTaskDTO): NarrativeBlockDTO {
  const createdAtMs = Date.now();
  const titleByType: Record<string, string> = {
    quest_flavor: 'A Simple Contract',
    npc_dialogue: 'A Word at the Counter',
    rumor_feed: 'Rumors on the Wind',
    journal_entry: 'Chronicle',
    bestiary_entry: 'Bestiary'
  };

  const lines: string[] = [];
  if (task.type === 'rumor_feed') {
    lines.push('They say the treeline moves when no one is watching.');
    lines.push('A bandit lantern was seen near the old mile marker.');
    lines.push('Someone is paying in silver for fresh herbs.');
  } else if (task.type === 'npc_dialogue') {
    lines.push('“Keep it short and keep it quiet. The road has ears.”');
  } else if (task.type === 'quest_flavor') {
    const loc = String(task.references?.locationId ?? 'the outskirts');
    lines.push(`A job came in—trouble out by ${loc}.`);
    lines.push('“Bring back proof. And try not to bleed on the paperwork.”');
  } else if (task.type === 'journal_entry') {
    lines.push('The day passed in hard steps and small victories. The guild ledger grew heavier by a few coins and a few names.');
  }

  return {
    id: uuidv4(),
    type: task.type,
    createdAtMs,
    references: task.references ?? {},
    title: titleByType[task.type] ?? 'Narrative',
    lines,
    tags: ['mvp', 'mock']
  };
}

// --- Gemini CLI backend (headless mode) ---
// Uses: gemini --output-format stream-json --prompt "..." [-m MODEL]
// Docs: https://geminicli.com/docs/cli/headless/
async function geminiCliGenerate(record: TaskRecord): Promise<NarrativeBlockDTO> {
  const cmd = process.env.GEMINI_CMD ?? 'gemini';
  const model = process.env.GEMINI_MODEL;

  const prompt = buildNarrativePrompt(record.task);
  const args: string[] = ['--output-format', 'stream-json', '--prompt', prompt];
  if (model) args.push('--model', model);

  const proc = spawn(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env
  });

  record.proc = proc;

  const rl = readline.createInterface({ input: proc.stdout });
  const rlErr = readline.createInterface({ input: proc.stderr });

  let assistantText = '';
  let sawResult = false;
  let lastError: string | null = null;

  rl.on('line', (line) => {
    if (record.status === 'canceled') return;
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const evt = JSON.parse(trimmed) as any;
      if (evt?.type === 'message' && evt?.role === 'assistant' && typeof evt?.content === 'string') {
        // In stream-json mode, assistant messages may be emitted as deltas.
        const chunk = evt.content;
        if (evt.delta === true || evt.delta === undefined) {
          assistantText += chunk;
          broadcast(record, { type: 'token', data: chunk });
        }
      }

      if (evt?.type === 'error' && evt?.message) {
        lastError = String(evt.message);
        broadcast(record, { type: 'line', data: `[gemini warning] ${lastError}` });
      }

      if (evt?.type === 'result') {
        sawResult = true;
        if (evt?.status && evt.status !== 'success') {
          lastError = lastError ?? `gemini result status: ${evt.status}`;
        }
      }
    } catch {
      // Not JSON? Treat as plain output
      assistantText += trimmed + '\n';
      broadcast(record, { type: 'line', data: trimmed });
    }
  });

  rlErr.on('line', (line) => {
    if (record.status === 'canceled') return;
    const msg = line.trim();
    if (!msg) return;
    lastError = msg;
    broadcast(record, { type: 'line', data: `[gemini] ${msg}` });
  });

  const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    proc.on('close', (code, signal) => resolve({ code, signal }));
  });

  record.proc = undefined;

  if (record.status === 'canceled') throw new Error('canceled');

  if (exit.code !== 0) {
    throw new Error(lastError ?? `gemini exited with code ${exit.code}${exit.signal ? ` signal ${exit.signal}` : ''}`);
  }

  if (!assistantText.trim()) {
    throw new Error(lastError ?? 'gemini produced no assistant output');
  }

  // Parse assistant output -> NarrativeBlock
  const block = coerceNarrativeBlockFromText(assistantText, record.task);
  return block;
}

function buildNarrativePrompt(task: NarrativeTaskDTO): string {
  // Keep this short; facts are already structured.
  // IMPORTANT: AI must not change game outcomes.
  const schemaHint = {
    id: 'string (any unique id)',
    type: task.type,
    createdAtMs: 'number (ms since epoch)',
    references: 'object<string,string> (use exactly provided ids)',
    title: 'string (optional)',
    lines: 'string[] (1-6 lines; short)',
    tags: 'string[]'
  };

  const rules = [
    'Return ONLY a single JSON object, no markdown, no code fences.',
    'Do NOT invent new IDs (items, enemies, locations, NPCs). Only reference IDs found in references/facts.',
    'Do NOT decide outcomes (no damage numbers, loot rolls, success rates). The engine already decided those.',
    'Keep it short and punchy.'
  ];

  return [
    'You are the narrative layer of an idle RPG.',
    `Task type: ${task.type}`,
    `Schema (high-level): ${JSON.stringify(schemaHint)}`,
    `Rules: ${rules.join(' ')}`,
    `references: ${JSON.stringify(task.references ?? {})}`,
    `facts: ${JSON.stringify(task.facts ?? {})}`
  ].join('\n');
}

function coerceNarrativeBlockFromText(text: string, task: NarrativeTaskDTO): NarrativeBlockDTO {
  // Try parse as JSON directly
  const direct = safeJsonParse(text.trim());
  if (direct && typeof direct === 'object') return finalizeBlock(direct as any, task);

  // Try extract first {...} region
  const extracted = extractFirstJsonObject(text);
  if (extracted) {
    const parsed = safeJsonParse(extracted);
    if (parsed && typeof parsed === 'object') return finalizeBlock(parsed as any, task);
  }

  // Fallback: wrap into a minimal block
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 6);
  return {
    id: uuidv4(),
    type: task.type,
    createdAtMs: Date.now(),
    references: task.references ?? {},
    title: task.type,
    lines: lines.length ? lines : ['(no narrative)'],
    tags: ['gemini', 'fallback']
  };
}

function finalizeBlock(obj: any, task: NarrativeTaskDTO): NarrativeBlockDTO {
  return {
    id: typeof obj.id === 'string' ? obj.id : uuidv4(),
    type: task.type,
    createdAtMs: typeof obj.createdAtMs === 'number' ? obj.createdAtMs : Date.now(),
    references: task.references ?? {},
    title: typeof obj.title === 'string' ? obj.title : undefined,
    lines: Array.isArray(obj.lines) ? obj.lines.map(String).slice(0, 6) : [String(obj.lines ?? '')].filter(Boolean).slice(0, 6),
    tags: Array.isArray(obj.tags) ? obj.tags.map(String).slice(0, 8) : ['gemini']
  };
}

function safeJsonParse(s: string): any | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function extractFirstJsonObject(s: string): string | null {
  const start = s.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

function broadcast(record: TaskRecord, event: any) {
  for (const res of record.streams) {
    sse(res, event);
  }
}

function endStreams(record: TaskRecord) {
  for (const res of record.streams) {
    try {
      res.end();
    } catch { }
  }
  record.streams.clear();
}

function sse(res: express.Response, evt: any) {
  // Expect evt like { type: 'token'|'line'|'json'|'done'|'error', data: ... }
  const type = typeof evt?.type === 'string' ? evt.type : 'token';
  res.write(`event: ${type}\n`);
  res.write(`data: ${JSON.stringify(evt.data ?? null)}\n\n`);
}

function chunkString(s: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
