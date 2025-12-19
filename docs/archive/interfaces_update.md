Here are the “online-ready” refinements you can bake into the interfaces now so Phase 1 (async multiplayer) doesn’t require a painful retrofit.

## Type primitives

```ts
export type SaveId = string & { __brand: 'SaveId' };
export type PlayerId = string & { __brand: 'PlayerId' };   // "local" in SP
export type ClientId = string & { __brand: 'ClientId' };   // device/browser install id
export type CommandId = string & { __brand: 'CommandId' };
export type EventId = string & { __brand: 'EventId' };
export type ContentVersion = string & { __brand: 'ContentVersion' };
export type EngineVersion = 1;

export type LocationId = string & { __brand: 'LocationId' };
export type ItemId = string & { __brand: 'ItemId' };
export type EnemyId = string & { __brand: 'EnemyId' };
export type NpcId = string & { __brand: 'NpcId' };
export type SkillId = string & { __brand: 'SkillId' };
export type RecipeId = string & { __brand: 'RecipeId' };
export type QuestTemplateId = string & { __brand: 'QuestTemplateId' };
export type QuestInstanceId = string & { __brand: 'QuestInstanceId' };
```

---

## EngineState (adds identity + versions + time authority)

```ts
export interface EngineState {
  engineVersion: EngineVersion;
  contentVersion: ContentVersion;

  saveId: SaveId;
  playerId: PlayerId;       // "local" for offline SP
  clientId: ClientId;       // stable per installation

  createdAtMs: number;
  updatedAtMs: number;

  // Time authority fields:
  lastTickAtMs: number;     // authoritative in online mode (server-supplied)
  tickIndex: number;

  currentLocationId: LocationId;

  player: PlayerState;
  inventory: InventoryStack[];
  equipment: EquipmentState;
  quests: QuestInstanceState[];

  activity: ActivityPlan;

  // Optional: helps server reconciliation / debug
  cursors?: {
    lastAppliedCommandId?: CommandId;
    lastEmittedEventId?: EventId;
  };
}
```

**Rule:** In online mode, `lastTickAtMs` and tick advancement come from the server; in offline mode, the client supplies `nowMs`.

---

## Commands (idempotent, attributable, versioned)

```ts
export interface CommandEnvelope<T extends PlayerCommand = PlayerCommand> {
  commandId: CommandId;
  playerId: PlayerId;
  clientId: ClientId;

  issuedAtMs: number;         // client time (informational)
  receivedAtMs?: number;      // server time (set by server)

  engineVersion: EngineVersion;
  contentVersion: ContentVersion;

  command: T;

  // Optional anti-replay / dedupe helper for HTTP retries:
  idempotencyKey?: string;

  // Optional signature later (Phase 1+):
  signature?: string;
}
```

Your existing `PlayerCommand` union can stay mostly as-is; the key is the **envelope**.

---

## Events (correlation + authority)

```ts
export interface BaseEvent<TType extends string, TPayload> {
  eventId: EventId;

  // Authoritative time (server time in online mode)
  atMs: number;

  type: TType;
  payload: TPayload;

  // Traceability:
  playerId: PlayerId;
  correlation?: {
    commandId?: CommandId;
    activityId?: string;
    instanceId?: string;    // future: co-op dungeon instance
  };

  engineVersion: EngineVersion;
  contentVersion: ContentVersion;
}
```

Keep your `GameEvent` union the same shape, just swap in this base type and include correlation.

---

## Simulation inputs/outputs (explicit time)

```ts
export interface StepInput {
  nowMs: number;                 // supplied by caller (client or server)
  maxTicks?: number;             // safety cap for offline batching
}

export interface StepResult {
  state: EngineState;
  events: GameEvent[];
  ticksProcessed: number;
}
```

And for offline catch-up:

```ts
export interface OfflineSimInput {
  fromMs: number;
  toMs: number;
  maxTicks?: number;
}

export interface OfflineSimResult extends StepResult {
  summary: {
    durationMs: number;
    encounters: number;
    xpGained: number;
    itemsGained: number;
  };
}
```

---

## Narrative “facts bundle” (strong contract, AI can’t invent)

This is the big guardrail: the narrative backend only receives a **FactsBundle** derived from engine events.

```ts
export interface NarrativeFactsBundle {
  bundleId: string;               // uuid
  saveId: SaveId;
  playerId: PlayerId;

  createdAtMs: number;
  engineVersion: EngineVersion;
  contentVersion: ContentVersion;

  // Minimal, structured truth:
  recentEvents: GameEvent[];

  // Optional compact state summary (numbers OK because they’re factual):
  stateSummary?: {
    level: number;
    locationId: LocationId;
    activeQuestIds: QuestInstanceId[];
  };

  // Integrity fields (useful later for server auth):
  hash?: string;                  // hash of canonical JSON
  signedByServer?: boolean;
}
```

---

## NarrativeTask / NarrativeBlock (ties back to facts bundle)

```ts
export type NarrativeTaskType =
  | 'quest_flavor'
  | 'npc_dialogue'
  | 'rumor_feed'
  | 'journal_entry'
  | 'bestiary_entry';

export interface NarrativeConstraints {
  maxLines?: number;
  maxCharsPerLine?: number;
  tone?: 'grim' | 'hopeful' | 'wry' | 'mysterious';
  forbidNewIds?: boolean;         // default true
  jsonOnly?: boolean;             // default true
}

export interface NarrativeTask {
  taskId: string;
  type: NarrativeTaskType;
  createdAtMs: number;

  backendId: string | null;       // "gemini-cli" etc
  model?: string;

  references: Record<string, string>;   // npcId, questId, locationId, etc.

  factsBundle: NarrativeFactsBundle;

  constraints: NarrativeConstraints;
}

export interface NarrativeBlock {
  blockId: string;
  type: NarrativeTaskType;
  createdAtMs: number;

  references: Record<string, string>;

  title?: string;
  lines: string[];
  tags: string[];

  // Traceability:
  taskId: string;
  factsBundleId: string;

  // Validation metadata
  validation: {
    ok: boolean;
    errors?: string[];
  };
}
```

---

## Why these changes help later (Phase 1/2)

* **playerId/clientId**: clean separation between “who” and “which device”
* **contentVersion/engineVersion everywhere**: painless patching + migrations
* **CommandEnvelope**: idempotency + dedupe (essential for HTTP retries)
* **Event correlation**: debugging + co-op instances later
* **FactsBundle**: prevents AI from becoming a hidden game system
