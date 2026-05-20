import { z } from 'zod';

// Runtime zod schemas for the narrative pipeline — the gateway uses these
// to validate (a) inbound /api/tasks request bodies and (b) AI-produced
// narrative blocks before they're persisted or streamed to the client.
//
// This file used to live next to engine-state schemas in `schemas.ts`
// that had drifted out of sync with `types.ts` and were never wired up
// at runtime. Those have been removed; the canonical contract for
// engine state is `types.ts`. This file is intentionally narrow: only
// the schemas that *do* run at the gateway boundary belong here.

export const NarrativeTaskTypeSchema = z.enum([
  'quest_flavor',
  'npc_dialogue',
  'rumor_feed',
  'journal_entry',
  'bestiary_entry'
]);

export const NarrativeTaskSchema = z.object({
  id: z.string().min(1),
  type: NarrativeTaskTypeSchema,
  createdAtMs: z.number().int().nonnegative(),
  backendId: z.string().min(1).nullable(),
  // Optional model selection. Nullable so the client can send undefined
  // explicitly when defaulting to the provider's pick.
  model: z.string().min(1).nullable().optional(),
  references: z.record(z.string(), z.string()).default({}),
  facts: z.record(z.string(), z.any())
});

export const NarrativeBlockSchema = z.object({
  id: z.string().min(1),
  type: NarrativeTaskTypeSchema,
  createdAtMs: z.number().int().nonnegative(),
  references: z.record(z.string(), z.string()).default({}),
  title: z.string().min(1).optional(),
  lines: z.array(z.string().min(1)).default([]),
  tags: z.array(z.string()).default([])
});

export type NarrativeTaskDTO = z.infer<typeof NarrativeTaskSchema>;
export type NarrativeBlockDTO = z.infer<typeof NarrativeBlockSchema>;
