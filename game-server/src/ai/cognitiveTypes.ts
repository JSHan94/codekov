export interface Perception {
  threats: Array<{ distance: number; direction: string }>;
  opportunities: Array<{ type: string; distance: number; direction: string }>;
  environment: { terrain_cover: boolean };
  self: { hp_percent: number; armor: boolean; inventory_summary: string };
}

export interface MemoryEntry {
  tick: number;
  type: "combat" | "loot" | "movement" | "observation";
  summary: string;
}

export interface AgentWorldState {
  threat_level: "low" | "medium" | "high" | "critical";
  resource_status: "abundant" | "sufficient" | "scarce" | "depleted";
  objective: string;
  confidence: number;
}

export interface CognitivePlan {
  reasoning: string;
  situation_assessment: string;
  chosen_approach: string;
}

export interface CognitiveState {
  perception: Perception;
  memory: MemoryEntry[];
  worldState: AgentWorldState;
  plan: CognitivePlan;
  lastUpdatedTick: number;
}
