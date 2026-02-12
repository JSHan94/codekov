// Strategy type definitions mirroring game-server/src/types/strategy.ts

export const ACTIONS = [
  "MOVE_TO_NEAREST_LOOT",
  "MOVE_TO_EXTRACT",
  "MOVE_TO_RANDOM",
  "ATTACK_NEAREST",
  "LOOT",
  "FLEE",
  "HEAL",
  "EXTRACT",
  "USE_GRENADE",
  "USE_SMOKE",
  "PLACE_TRAP",
  "ATTACK_NEAREST_ZOMBIE",
  "FOLLOW_PLAYER",
  "HOLD_POSITION",
] as const;
export type Action = (typeof ACTIONS)[number];

export const CONDITION_SUBJECTS = [
  "hp_percent",
  "nearby_enemy_count",
  "nearest_enemy_distance",
  "nearby_loot_count",
  "nearest_loot_distance",
  "inventory_count",
  "distance_to_extract",
  "tick",
  "has_cover",
  "has_armor",
  "armor_durability",
  "has_grenade",
  "has_smoke",
  "has_trap",
  "extraction_available",
  "nearby_zombie_count",
  "nearest_zombie_distance",
  "ally_count",
  "wave_intensity",
] as const;
export type ConditionSubject = (typeof CONDITION_SUBJECTS)[number];

export const OPERATORS = ["lt", "lte", "gt", "gte", "eq"] as const;
export type Operator = (typeof OPERATORS)[number];

export interface Condition {
  subject: ConditionSubject;
  operator: Operator;
  value: number;
}

export interface Rule {
  priority: number;
  conditions: Condition[];
  action: Action;
}

export interface Strategy {
  name: string;
  rules: Rule[];
  fallbackAction: Action;
}

export const ACTION_LABELS: Record<Action, string> = {
  MOVE_TO_NEAREST_LOOT: "Move to Loot",
  MOVE_TO_EXTRACT: "Move to Extract",
  MOVE_TO_RANDOM: "Move Random",
  ATTACK_NEAREST: "Attack Nearest",
  LOOT: "Loot",
  FLEE: "Flee",
  HEAL: "Heal",
  EXTRACT: "Extract",
  USE_GRENADE: "Use Grenade",
  USE_SMOKE: "Use Smoke",
  PLACE_TRAP: "Place Trap",
  ATTACK_NEAREST_ZOMBIE: "Attack Zombie",
  FOLLOW_PLAYER: "Follow Player",
  HOLD_POSITION: "Hold Position",
};

export const SUBJECT_LABELS: Record<ConditionSubject, string> = {
  hp_percent: "HP %",
  nearby_enemy_count: "Nearby Enemies",
  nearest_enemy_distance: "Enemy Distance",
  nearby_loot_count: "Nearby Loot",
  nearest_loot_distance: "Loot Distance",
  inventory_count: "Inventory Count",
  distance_to_extract: "Extract Distance",
  tick: "Tick",
  has_cover: "Has Cover",
  has_armor: "Has Armor",
  armor_durability: "Armor Durability",
  has_grenade: "Has Grenade",
  has_smoke: "Has Smoke",
  has_trap: "Has Trap",
  extraction_available: "Extraction Available",
  nearby_zombie_count: "Nearby Zombies",
  nearest_zombie_distance: "Zombie Distance",
  ally_count: "Ally Count",
  wave_intensity: "Wave Intensity",
};

export const OPERATOR_LABELS: Record<Operator, string> = {
  lt: "<",
  lte: "\u2264",
  gt: ">",
  gte: "\u2265",
  eq: "=",
};
