import { aiProvider } from "./aiClient.js";
import type { Strategy } from "../types/strategy.js";

const DEFAULT_FALLBACK: Strategy = {
  name: "AI-Fallback",
  rules: [
    { priority: 0, conditions: [{ subject: "hp_percent", operator: "lt", value: 30 }], action: "HEAL" },
    { priority: 1, conditions: [{ subject: "nearby_loot_count", operator: "gt", value: 0 }], action: "MOVE_TO_NEAREST_LOOT" },
    { priority: 2, conditions: [{ subject: "inventory_count", operator: "gte", value: 4 }], action: "MOVE_TO_EXTRACT" },
  ],
  fallbackAction: "MOVE_TO_RANDOM",
};

export async function generateStrategyFromText(description: string): Promise<Strategy> {
  try {
    return await aiProvider.generateStrategy(description);
  } catch (err) {
    console.error("[AI] generateStrategyFromText failed, using fallback:", err);
    return structuredClone(DEFAULT_FALLBACK);
  }
}
