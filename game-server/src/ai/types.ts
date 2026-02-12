import type { Strategy } from "../types/strategy.js";
import type { CognitivePlan, AgentWorldState } from "./cognitiveTypes.js";

export interface StateSnapshot {
  hp_percent: number;
  position: { x: number; y: number };
  inventory: string[];
  nearby_enemy_count: number;
  nearest_enemy_distance: number;
  nearby_loot_count: number;
  nearest_loot_distance: number;
  distance_to_extract: number;
  extraction_available: boolean;
  tick: number;
  has_armor: boolean;
}

export interface ReplanState {
  lastReplanTick: number;
  lastHp: number;
  lastEnemyCount: number;
  lastLootCount: number;
  pendingReplan: boolean;
  replanCount: number;
  lastReplanMinute: number;
}

export function createReplanState(): ReplanState {
  return {
    lastReplanTick: 0,
    lastHp: 100,
    lastEnemyCount: 0,
    lastLootCount: 0,
    pendingReplan: false,
    replanCount: 0,
    lastReplanMinute: 0,
  };
}

export interface CognitiveReplanResult {
  strategy: Strategy;
  plan: CognitivePlan;
  worldState: AgentWorldState;
}

export interface AIProvider {
  generateStrategy(description: string): Promise<Strategy>;
  replanStrategy(snapshot: StateSnapshot, events: string): Promise<Strategy>;
  cognitiveReplan(
    perception: string,
    memory: string,
    currentState: AgentWorldState | null,
    events: string,
  ): Promise<CognitiveReplanResult>;
}
