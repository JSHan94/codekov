import { z } from "zod";

export const ConditionSubject = z.enum([
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
]);
export type ConditionSubject = z.infer<typeof ConditionSubject>;

export const Operator = z.enum(["lt", "lte", "gt", "gte", "eq"]);
export type Operator = z.infer<typeof Operator>;

export const Action = z.enum([
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
]);
export type Action = z.infer<typeof Action>;

export const ConditionSchema = z.object({
  subject: ConditionSubject,
  operator: Operator,
  value: z.number(),
});
export type Condition = z.infer<typeof ConditionSchema>;

export const RuleSchema = z.object({
  priority: z.number().int().min(0),
  conditions: z.array(ConditionSchema).min(1),
  action: Action,
});
export type Rule = z.infer<typeof RuleSchema>;

export const StrategySchema = z.object({
  name: z.string().min(1).max(64),
  rules: z.array(RuleSchema).min(1),
  fallbackAction: Action,
});
export type Strategy = z.infer<typeof StrategySchema>;
