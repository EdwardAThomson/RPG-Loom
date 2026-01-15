# Idle RPG Milestone System Design

## Problem Statement
Need a quest/milestone system for an Idle RPG that:
- Has no text input (unlike DungeonGPT)
- Tracks milestone completion deterministically
- Works with idle/automated gameplay

---

## Approach Options

### Option 1: Event-Based Milestones (Recommended)
**How it works:** Milestones complete when specific game events occur

**Examples:**
```javascript
milestones: [
  {
    id: 1,
    text: "Defeat 10 Goblins",
    type: "KILL_COUNT",
    target: { enemy: "goblin", count: 10 },
    completed: false
  },
  {
    id: 2,
    text: "Reach Level 5",
    type: "PLAYER_LEVEL",
    target: { level: 5 },
    completed: false
  },
  {
    id: 3,
    text: "Collect 1000 Gold",
    type: "CURRENCY",
    target: { currency: "gold", amount: 1000 },
    completed: false
  }
]
```

**Detection Logic:**
```javascript
// After each game tick/action
function checkMilestones(gameState, milestones) {
  milestones.forEach(milestone => {
    if (milestone.completed) return;
    
    switch(milestone.type) {
      case 'KILL_COUNT':
        if (gameState.kills[milestone.target.enemy] >= milestone.target.count) {
          completeMilestone(milestone);
        }
        break;
      case 'PLAYER_LEVEL':
        if (gameState.player.level >= milestone.target.level) {
          completeMilestone(milestone);
        }
        break;
      case 'CURRENCY':
        if (gameState.currency[milestone.target.currency] >= milestone.target.amount) {
          completeMilestone(milestone);
        }
        break;
    }
  });
}
```

**Pros:**
- Fully deterministic
- Easy to implement
- No AI needed
- Clear completion criteria

**Cons:**
- Less flexible than AI-driven
- Requires predefined milestone types

---

### Option 2: Stat Threshold Milestones
**How it works:** Milestones complete when player stats reach thresholds

**Examples:**
```javascript
milestones: [
  {
    id: 1,
    text: "Become a Warrior",
    condition: (stats) => stats.strength >= 20,
    completed: false
  },
  {
    id: 2,
    text: "Master Combat",
    condition: (stats) => stats.strength >= 50 && stats.defense >= 30,
    completed: false
  },
  {
    id: 3,
    text: "Achieve Legendary Status",
    condition: (stats) => stats.totalPower >= 1000,
    completed: false
  }
]
```

**Detection Logic:**
```javascript
function checkMilestones(playerStats, milestones) {
  milestones.forEach(milestone => {
    if (!milestone.completed && milestone.condition(playerStats)) {
      completeMilestone(milestone);
    }
  });
}
```

**Pros:**
- Very flexible with lambda functions
- Can combine multiple conditions
- Still deterministic

**Cons:**
- Harder to serialize/save
- Less readable for non-programmers

---

### Option 3: Time-Based + Progress Milestones
**How it works:** Milestones complete after time + progress requirements

**Examples:**
```javascript
milestones: [
  {
    id: 1,
    text: "Survive 5 Minutes",
    type: "TIME_SURVIVED",
    target: { minutes: 5 },
    progress: 0,
    completed: false
  },
  {
    id: 2,
    text: "Idle for 1 Hour",
    type: "IDLE_TIME",
    target: { hours: 1 },
    progress: 0,
    completed: false
  },
  {
    id: 3,
    text: "Complete 100 Battles",
    type: "BATTLE_COUNT",
    target: { count: 100 },
    progress: 0,
    completed: false
  }
]
```

**Detection Logic:**
```javascript
function updateMilestoneProgress(milestone, gameState) {
  switch(milestone.type) {
    case 'TIME_SURVIVED':
      milestone.progress = gameState.timePlayed / 60000; // ms to minutes
      break;
    case 'BATTLE_COUNT':
      milestone.progress = gameState.battlesCompleted;
      break;
  }
  
  // Check completion based on type
  if (milestone.progress >= milestone.target[Object.keys(milestone.target)[0]]) {
    completeMilestone(milestone);
  }
}
```

**Pros:**
- Shows progress bars
- Good for idle games
- Player can see how close they are

**Cons:**
- More complex state management
- Needs UI for progress display

---

### Option 4: Hybrid AI + Deterministic
**How it works:** Use AI to generate milestone text, but deterministic completion

**Examples:**
```javascript
// AI generates quest text
const questPrompt = `Generate a quest for a level ${playerLevel} character in a fantasy idle RPG. 
Include 3 milestones that involve: combat, resource gathering, and character progression.`;

// AI Response:
{
  quest: "The Goblin Menace",
  milestones: [
    "Defeat 50 Goblins in the Dark Forest",
    "Collect 500 Goblin Ears",
    "Reach Combat Level 10"
  ]
}

// You map these to deterministic conditions:
const mappedMilestones = [
  { text: aiMilestones[0], type: "KILL_COUNT", target: { enemy: "goblin", count: 50 } },
  { text: aiMilestones[1], type: "ITEM_COUNT", target: { item: "goblin_ear", count: 500 } },
  { text: aiMilestones[2], type: "SKILL_LEVEL", target: { skill: "combat", level: 10 } }
];
```

**Pros:**
- Dynamic quest text
- Deterministic completion
- Best of both worlds

**Cons:**
- Requires AI integration
- Need mapping logic

---

## Recommended Implementation

For an Idle RPG, I recommend **Option 1 (Event-Based)** with **Option 3 (Progress Tracking)**:

```javascript
const milestoneTypes = {
  KILL_COUNT: {
    check: (state, target) => state.kills[target.enemy] >= target.count,
    progress: (state, target) => state.kills[target.enemy] / target.count
  },
  COLLECT_ITEM: {
    check: (state, target) => state.inventory[target.item] >= target.count,
    progress: (state, target) => state.inventory[target.item] / target.count
  },
  REACH_LEVEL: {
    check: (state, target) => state.player.level >= target.level,
    progress: (state, target) => state.player.level / target.level
  },
  EARN_CURRENCY: {
    check: (state, target) => state.currency[target.type] >= target.amount,
    progress: (state, target) => state.currency[target.type] / target.amount
  },
  UPGRADE_BUILDING: {
    check: (state, target) => state.buildings[target.building] >= target.level,
    progress: (state, target) => state.buildings[target.building] / target.level
  }
};

// Quest Definition
const quest = {
  id: "quest_001",
  name: "The Goblin Menace",
  description: "Clear the Dark Forest of goblins",
  milestones: [
    {
      id: 1,
      text: "Defeat 50 Goblins",
      type: "KILL_COUNT",
      target: { enemy: "goblin", count: 50 },
      completed: false,
      progress: 0
    },
    {
      id: 2,
      text: "Collect 500 Gold from Goblins",
      type: "EARN_CURRENCY",
      target: { type: "gold", amount: 500 },
      completed: false,
      progress: 0
    },
    {
      id: 3,
      text: "Reach Level 5",
      type: "REACH_LEVEL",
      target: { level: 5 },
      completed: false,
      progress: 0
    }
  ],
  rewards: {
    gold: 1000,
    experience: 500,
    item: "goblin_slayer_sword"
  }
};

// Check function (call every game tick)
function updateQuestProgress(quest, gameState) {
  quest.milestones.forEach(milestone => {
    if (milestone.completed) return;
    
    const typeHandler = milestoneTypes[milestone.type];
    milestone.progress = typeHandler.progress(gameState, milestone.target);
    
    if (typeHandler.check(gameState, milestone.target)) {
      milestone.completed = true;
      showMilestoneNotification(milestone);
    }
  });
  
  // Check if all milestones complete
  if (quest.milestones.every(m => m.completed)) {
    completeQuest(quest);
  }
}
```

---

## UI Considerations

**Quest Display:**
```
Quest: The Goblin Menace
Progress: 2/3 Milestones Complete

✓ Defeat 50 Goblins (50/50)
✓ Collect 500 Gold (500/500)
○ Reach Level 5 (4/5) [Progress: 80%]
```

**Benefits:**
- Clear progress indication
- Works without text input
- Fully automated checking
- Easy to save/load
- Can show progress bars

---

## Next Steps

1. **Choose your approach** (I recommend Event-Based + Progress)
2. **Define milestone types** for your game
3. **Implement check logic** in your game loop
4. **Add UI** for quest/milestone display
5. **Test** with sample quests

Would you like me to help implement any of these approaches for your specific Idle RPG?
