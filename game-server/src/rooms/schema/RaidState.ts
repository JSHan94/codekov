import { Schema, type, ArraySchema, MapSchema } from "@colyseus/schema";
import type { Strategy, Action } from "../../types/strategy.js";
import type { ReplanState } from "../../ai/types.js";
import type { CognitiveState } from "../../ai/cognitiveTypes.js";
import { createReplanState } from "../../ai/types.js";

export class InventoryItem extends Schema {
  @type("string") itemId: string = "";
  @type("string") itemType: string = "";
  @type("number") quantity: number = 0;
}

export class Agent extends Schema {
  @type("string") sessionId: string = "";
  @type("string") playerId: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") hp: number = 100;
  @type("number") maxHp: number = 100;
  @type("string") state: string = "alive"; // "alive" | "dead" | "extracted"
  @type("string") currentAction: string = "IDLE";
  @type([InventoryItem]) inventory = new ArraySchema<InventoryItem>();
  @type("string") equippedArmor: string = "";
  @type("number") armorDurability: number = 0;
  @type("string") avatarUrl: string = "";

  // Synced field for dodge animation
  @type("boolean") isDodging: boolean = false;

  // Server-only fields (not synced to clients)
  strategy: Strategy;
  pendingCommand: Action | null = null;
  joinedAtTick: number = 0;

  // Wander state (server-only, not synced)
  wanderTargetX: number | null = null;
  wanderTargetY: number | null = null;
  recentPositions: Array<{ x: number; y: number }> = [];

  // AI mode (server-only, not synced)
  aiEnabled: boolean = false;
  replanState: ReplanState = createReplanState();

  // Cognitive state (server-only, not synced)
  cognitiveState: CognitiveState | null = null;

  // Manual control (server-only, not synced)
  manualControlActive: boolean = false;
  pendingManualAction: { type: string; dx?: number; dy?: number; targetSessionId?: string } | null = null;
  dodgeCooldownUntilTick: number = 0;
  dodgeTicksRemaining: number = 0;

  // Ally / recruitment fields
  @type("string") allyStatus: string = "neutral"; // "neutral" | "ally" | "player"
  @type("string") personality: string = "brave";
  @type("string") allyCommand: string = "follow"; // "follow" | "hold" | "attack"

  // Server-only ally fields
  allyOwnerId: string = "";
  recruitmentCooldown: number = 0;

  // Server-only spawn origin (for neutral NPC patrol)
  spawnX: number = 0;
  spawnY: number = 0;
}

export class Zombie extends Schema {
  @type("string") id: string = "";
  @type("string") zombieType: string = "basic";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") hp: number = 40;
  @type("number") maxHp: number = 40;
  @type("string") state: string = "alive"; // "alive" | "dead"

  // Server-only
  attackCooldown: number = 0;
}

export class MapObject extends Schema {
  @type("string") id: string = "";
  @type("string") objectType: string = ""; // "LOOT_BOX" | "CORPSE" | "EXTRACTION" | "SMOKE" | "TRAP"
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type([InventoryItem]) items = new ArraySchema<InventoryItem>();
  @type("number") expiresAtTick: number = 0;
  @type("number") radius: number = 0;
}

export class RaidState extends Schema {
  @type({ map: Agent }) agents = new MapSchema<Agent>();
  @type({ map: MapObject }) objects = new MapSchema<MapObject>();
  @type({ map: Zombie }) zombies = new MapSchema<Zombie>();
  @type("number") tick: number = 0;
  @type("number") mapWidth: number = 80;
  @type("number") mapHeight: number = 80;
  @type("string") phase: string = "waiting"; // "waiting" | "active" | "ended"
  @type("string") terrain: string = "";
  @type("number") maxTicks: number = 900;
  @type("number") zombieKillCount: number = 0;
  @type("number") waveIntensity: number = 0;
  @type("boolean") extractionActive: boolean = false;
  @type("number") extractionActivatesTick: number = 0;
}
