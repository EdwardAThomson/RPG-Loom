# Idle RPG Design Doc — Working Title: **RPG Loom**

## High concept

A text-first idle RPG where you run a small adventurers’ guild on the edge of a frontier. You assign your hero (or party later) to activities—quests, hunting, gathering, crafting—while the game simulates outcomes deterministically in “ticks.” Agentic AI provides **quest flavor, NPC dialogue, rumors, and a journal**, but **never decides outcomes**.

## Design pillars

* **Deterministic + testable:** Same inputs → same results. Offline progress is trustworthy.
* **Idle-first, build matters:** Gear + skills + tactics meaningfully change efficiency and survivability.
* **Readable UI:** Cards, icons, and short logs over walls of text.
* **AI for life, not power:** AI narrates and contextualizes; engine resolves success/failure and rewards.

---

## Core loop

1. Choose an **Activity** (quest / hunt / gather / craft / train / trade)
2. Game simulates in **ticks** (e.g., 1–5 seconds online; batch offline)
3. Gain **XP + loot + materials + gold + reputation**
4. Spend resources to **upgrade gear / unlock recipes / raise skills**
5. Unlock **new locations**, tougher enemies, new quest chains

---

## Player progression

### Stats

* **HP** (survivability)
* **ATK** (damage)
* **DEF** (damage reduction)
* **SPD** (turn order / actions per time)
* **CRIT** (chance + multiplier)
* **RES** (status resistance)

### XP & level

* Level increases base stats modestly.
* Skills + equipment provide the real scaling (keeps “build” interesting).

---

## Skills (8)

Each skill has levels and perks at milestones (e.g., 5/10/15/20).

1. **Swordsmanship** – melee damage, parry chance
2. **Archery** – ranged damage, crit chance
3. **Arcana** – magic damage, elemental effects
4. **Defense** – damage reduction, block chance
5. **Survival** – resource yield, encounter avoidance
6. **Gathering** – material yield, rare find chance
7. **Crafting** – recipe unlocks, item quality chance
8. **Diplomacy** – shop prices, reputation gain, de-escalation events

---

## Locations (5 initial)

Each location defines: requirements, activities, encounter table, loot pools, resource outputs.

### 1) **Bramblewick Outpost** (starter hub)

* Activities: Train, Trade, Craft (basic), Accept Quests
* NPCs: Quartermaster, Apothecary, Scout Captain

### 2) **Glimmerwood Edge** (intro wilderness)

* Focus: Gathering + low-risk combat
* Resources: Herbs, Softwood, Pelts
* Enemies: Wolves, Bandit Lookouts

### 3) **Old Road Ruins** (first “dungeon-ish” zone)

* Focus: Relics + undead + crafting mats
* Resources: Scrap Iron, Bone Dust, Relic Fragments
* Enemies: Skeletons, Restless Spirits

### 4) **Ashmarsh Fen** (status effects / alchemy zone)

* Focus: Alchemy materials, poison/bleed threats
* Resources: Bog Lotus, Venom Sacs, Swamp Reed
* Enemies: Mire Slimes, Fen Cultists

### 5) **Redstone Pass** (gear check / midgame gateway)

* Focus: Ore + tougher humanoids + boss encounters
* Resources: Iron Ore, Fire Salt, Hardstone
* Enemies: Brigand Veterans, Rockbiters, Pass Warden (boss)

---

## Enemies (10)

Each has: level band, tags, basic attack pattern, possible status.

1. **Glimmerwolf** (Beast) – fast, crit-prone
2. **Bandit Lookout** (Humanoid) – low HP, evasive
3. **Bandit Cutthroat** (Humanoid) – bleed chance
4. **Skeleton Footman** (Undead) – high DEF, slow
5. **Restless Spirit** (Undead) – arcane damage, RES check
6. **Mire Slime** (Ooze) – poison on hit
7. **Fen Cultist** (Humanoid) – curses (ATK down)
8. **Rockbiter** (Beast) – high HP, stun chance
9. **Brigand Veteran** (Humanoid) – balanced bruiser
10. **Pass Warden** (Boss) – phases at 70% / 30% HP, summons adds (deterministic triggers)

---

## Combat (deterministic)

**Turn-based** (or “rounds”), with auto-resolution and clear logs.

### Player tactics (preset + simple rules)

* **Aggressive:** +ATK, -DEF, higher potion use threshold
* **Balanced:** baseline
* **Defensive:** +DEF, -ATK, earlier healing

Optional rule toggles:

* “Use potion if HP < X%”
* “Prioritize stun/curse skill if available” (later)

### Simple damage model (example)

* Hit chance: `clamp(0.05, 0.95, 0.75 + (SPD_diff * 0.01))`
* Damage: `max(1, ATK * skill_mult - DEF * 0.6)`
* Crit: `if rand(seed) < CRIT then damage *= 1.5`

> Seeded RNG: Use a deterministic seed derived from (player_id, activity_id, tick_index, encounter_index).

---

## Items (30)

Tags: Weapon/Armor/Accessory/Consumable/Material/Quest. Rarity: Common/Uncommon/Rare/Epic (start with first 3).

### Equipment (12)

1. **Rusty Sword** (WPN) +1 ATK
2. **Hunter’s Bow** (WPN) +1 ATK, +1% CRIT
3. **Apprentice Wand** (WPN) +1 Arcana scaling
4. **Leather Jerkin** (ARM) +1 DEF
5. **Iron Cuirass** (ARM) +2 DEF, -1 SPD
6. **Traveler Boots** (ARM) +1 SPD
7. **Wooden Buckler** (ACC) +block chance
8. **Silver Charm** (ACC) +RES
9. **Lucky Coin** (ACC) +loot quality chance (small)
10. **Bandit Dagger** (WPN) +bleed chance
11. **Relic Ring** (ACC) +Arcana, +RES
12. **Redstone Gauntlets** (ACC) +ATK, +DEF (heavy)

### Consumables (8)

13. **Minor Healing Potion** (heal)
14. **Stamina Draught** (more ticks per session / faster action)
15. **Antidote Vial** (removes poison)
16. **Smoke Pellet** (escape chance / avoid encounter)
17. **Sharpening Stone** (+ATK for N fights)
18. **Ward Chalk** (+RES for N fights)
19. **Ration Pack** (+Survival yield for N minutes)
20. **Torch Bundle** (improves ruins loot table)

### Materials (8)

21. **Softwood**
22. **Hardstone**
23. **Iron Ore**
24. **Scrap Iron**
25. **Herb Bundle**
26. **Bog Lotus**
27. **Venom Sac**
28. **Bone Dust**

### Quest / Special (2)

29. **Outpost Seal** (unlocks faction quests)
30. **Relic Fragment** (collect to unlock “Ancient City” later)

---

## Crafting (MVP-lite)

Crafting uses recipes unlocked by Crafting skill + location.

Example recipes:

* Scrap Iron + Softwood → **Rusty Sword**
* Iron Ore + Hardstone → **Iron Cuirass**
* Herb Bundle → **Minor Healing Potion**
* Bog Lotus + Venom Sac → **Antidote Vial**
* Bone Dust + Relic Fragment → **Relic Ring** (Rare)

Quality chance: small chance to craft Uncommon version (+1 bonus stat).

---

## Quests (20 deterministic templates)

Each quest is generated from a template: objective + target + quantity + location + reward pack.

1. Kill X **Glimmerwolves** in Glimmerwood
2. Gather X **Herb Bundles** in Glimmerwood
3. Deliver **Ration Packs** to Outpost (gold + rep)
4. Clear X **Bandit Lookouts** on Old Road
5. Recover X **Scrap Iron** from Old Road
6. Defeat **Skeleton Footman** squad (elite)
7. Collect X **Bone Dust** (undead)
8. Explore: reach “Deep Ruins” checkpoint (time-based)
9. Gather X **Bog Lotus** in Ashmarsh
10. Collect X **Venom Sacs** from slimes
11. Defeat X **Fen Cultists** (rep + arcana XP)
12. Craft X **Minor Healing Potions**
13. Craft an **Iron Cuirass** (one-off)
14. Escort “Merchant Cart” (ticks + risk)
15. Hunt “Rockbiter” (rare drop chance)
16. Mine X **Iron Ore** in Redstone Pass
17. Eliminate X **Brigand Veterans** (hard combat)
18. Defeat **Pass Warden** (boss)
19. Collect X **Relic Fragments** (meta progression)
20. Reputation milestone quest: “Earn 100 Outpost Rep” (unlocks next faction)

---

## NPCs (initial set)

Deterministic roles + AI persona overlay.

* **Quartermaster Hobb** (shop, upgrades, inventory expansions)
* **Scout Captain Rhea** (quests, location unlock hints)
* **Apothecary Nymm** (consumables, alchemy intro)
* **Relic Scholar Voss** (ruins lore, relic fragment arc)
* **Fen Emissary (mysterious)** (faction hooks, late-game foreshadow)

---

## Factions & reputation (simple at first)

Faction: **Bramblewick Guild**
Reputation increases quest variety, shop stock, and unlocks story arcs.

---

## Agentic AI integration

### What AI can do (safe)

* Generate: quest titles, quest-giver dialogue, rumors, location descriptions, “journal entries”
* NPC banter based on relationship + recent outcomes
* Optional “story arcs” composed from deterministic quest blocks

### What AI must not do

* Decide loot, damage, success/failure, drop rates, stats, prices

### Inputs to AI

* Current location + recent events summary
* Active quest template data
* NPC persona card
* Player build summary (level, gear, skills)
* Reputation and flags (boss defeated, relic fragments count)

### Outputs format (example)

* `title`, `intro_dialogue`, `progress_lines[3]`, `completion_dialogue`, `journal_paragraph`

---

## UI wireframe (text-first, icon-rich)

**Top bar:** Level, XP bar, Gold, Reputation, Current Activity status

**Left panel (Player Card):**

* Equipment slots with icons
* Key stats + tactic preset
* Quick toggles (auto-potion threshold)

**Center panel (Activity Card):**

* Location icon + name
* Progress bar / timer
* Encounter feed (short lines, expandable)

**Right panel (Tabs):**

* Quests (active/completed)
* Inventory (filters: gear/consumables/materials)
* Crafting (recipes, requirements)
* Journal (AI-written “chronicle”)

**Bottom log:**

* Compact event log: loot, XP, combat outcomes, quest updates

---

## Data model (minimum viable schemas)

* `Location {id, name, reqs, encounter_table, resource_table, activities}`
* `Enemy {id, tags, level, stats, attacks, loot_table}`
* `Item {id, type, rarity, tags, stats, stackable, value}`
* `QuestTemplate {id, objective_type, target, qty_range, location_pool, reward_pack}`
* `NPC {id, role, shop_table?, persona_card_id, relationship}`
* `PlayerState {level, xp, stats, skills, inventory, equipment, flags, reputation}`

---

## Balancing knobs

* Tick rate / offline batching
* Encounter rate by location
* Repair/attrition (optional later)
* Drop rates & crafting material sinks
* Soft caps via diminishing returns on skill efficiency multipliers

---

## MVP build order

1. Player state + inventory + equipment bonuses
2. Locations + activities + tick simulation
3. Deterministic encounters + combat + tactics
4. Quests (templates + rewards)
5. Crafting (5–10 recipes)
6. AI layer (quest flavor + NPC dialogue + journal)
