import type { Strategy } from "../types/strategy.js";

// Easy: flee-first behavior, runs from zombies and enemies
export const EASY_STRATEGY: Strategy = {
  name: "Bot_Easy",
  rules: [
    {
      priority: 0,
      conditions: [{ subject: "hp_percent", operator: "lt", value: 30 }],
      action: "HEAL",
    },
    {
      priority: 1,
      conditions: [{ subject: "nearest_zombie_distance", operator: "lt", value: 2 }],
      action: "FLEE",
    },
    {
      priority: 2,
      conditions: [{ subject: "nearest_enemy_distance", operator: "lt", value: 3 }],
      action: "FLEE",
    },
    {
      priority: 3,
      conditions: [{ subject: "nearby_loot_count", operator: "gt", value: 0 }],
      action: "MOVE_TO_NEAREST_LOOT",
    },
  ],
  fallbackAction: "MOVE_TO_RANDOM",
};

// Medium: balanced loot+fight behavior, attacks zombies and enemies
export const MEDIUM_STRATEGY: Strategy = {
  name: "Bot_Medium",
  rules: [
    {
      priority: 0,
      conditions: [{ subject: "hp_percent", operator: "lt", value: 25 }],
      action: "HEAL",
    },
    {
      priority: 1,
      conditions: [{ subject: "nearest_zombie_distance", operator: "lt", value: 3 }],
      action: "ATTACK_NEAREST_ZOMBIE",
    },
    {
      priority: 2,
      conditions: [{ subject: "nearest_enemy_distance", operator: "lt", value: 4 }],
      action: "ATTACK_NEAREST",
    },
    {
      priority: 3,
      conditions: [{ subject: "nearby_loot_count", operator: "gt", value: 0 }],
      action: "MOVE_TO_NEAREST_LOOT",
    },
  ],
  fallbackAction: "MOVE_TO_RANDOM",
};

// Hard: Aggressive -- active hunting, utility usage, zombie awareness
export const HARD_STRATEGY: Strategy = {
  name: "Bot_Hard",
  rules: [
    {
      priority: 0,
      conditions: [{ subject: "hp_percent", operator: "lt", value: 20 }],
      action: "HEAL",
    },
    {
      priority: 1,
      conditions: [
        { subject: "has_grenade", operator: "gte", value: 1 },
        { subject: "nearest_enemy_distance", operator: "lt", value: 3 },
      ],
      action: "USE_GRENADE",
    },
    {
      priority: 2,
      conditions: [{ subject: "nearest_zombie_distance", operator: "lt", value: 4 }],
      action: "ATTACK_NEAREST_ZOMBIE",
    },
    {
      priority: 3,
      conditions: [{ subject: "nearest_enemy_distance", operator: "lt", value: 6 }],
      action: "ATTACK_NEAREST",
    },
    {
      priority: 4,
      conditions: [{ subject: "nearby_loot_count", operator: "gt", value: 0 }],
      action: "MOVE_TO_NEAREST_LOOT",
    },
  ],
  fallbackAction: "MOVE_TO_RANDOM",
};

export function getStrategyForDifficulty(difficulty: "easy" | "medium" | "hard"): Strategy {
  switch (difficulty) {
    case "easy": return { ...EASY_STRATEGY };
    case "medium": return { ...MEDIUM_STRATEGY };
    case "hard": return { ...HARD_STRATEGY };
  }
}
