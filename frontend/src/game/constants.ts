export const TILE_SIZE = 8; // kept for server-compatible logic & legacy
export const TILEMAP_COLS = 16;
export const TILEMAP_PATH = "/MicroRoguelike/Tilemap/colored_tilemap_packed.png";

// ─── Isometric 2.5D Constants ───
export const ISO_TILE_WIDTH = 32; // diamond horizontal span
export const ISO_TILE_HEIGHT = 16; // diamond vertical span
export const ISO_TILE_DEPTH = 12; // cube height for walls/objects

export const TILES = {
  FLOOR: 0,
  CHARACTERS: [4, 5, 6, 7, 8],
  LOOT_BOX: 112,
  CORPSE: 117,
  EXTRACTION: 118,
  WALL: 3,
  COVER: 96,
  BUSH: 32,
  SMOKE: 113,
  TRAP: 114,
} as const;

export const MAP_WIDTH = 80;
export const MAP_HEIGHT = 80;
export const LERP_SPEED = 0.15;
export const BG_COLOR = 0x1a1a2e;

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 4.0;

// ─── Strategy Presets for 5-Agent Simulation ───

export interface StrategyPreset {
  name: string;
  rules: Array<{
    priority: number;
    conditions: Array<{
      subject: string;
      operator: string;
      value: number;
    }>;
    action: string;
  }>;
  fallbackAction: string;
}

export const STRATEGY_PRESETS: StrategyPreset[] = [
  {
    name: "Aggressive",
    rules: [
      {
        priority: 0,
        conditions: [{ subject: "hp_percent", operator: "lt", value: 15 }],
        action: "HEAL",
      },
      {
        priority: 1,
        conditions: [
          { subject: "nearest_zombie_distance", operator: "lt", value: 3 },
        ],
        action: "ATTACK_NEAREST_ZOMBIE",
      },
      {
        priority: 2,
        conditions: [
          { subject: "nearest_enemy_distance", operator: "lt", value: 6 },
        ],
        action: "ATTACK_NEAREST",
      },
      {
        priority: 3,
        conditions: [
          { subject: "nearby_loot_count", operator: "gt", value: 0 },
        ],
        action: "MOVE_TO_NEAREST_LOOT",
      },
    ],
    fallbackAction: "MOVE_TO_RANDOM",
  },
  {
    name: "Looter",
    rules: [
      {
        priority: 0,
        conditions: [{ subject: "hp_percent", operator: "lt", value: 30 }],
        action: "HEAL",
      },
      {
        priority: 1,
        conditions: [
          { subject: "nearest_zombie_distance", operator: "lt", value: 2 },
        ],
        action: "FLEE",
      },
      {
        priority: 2,
        conditions: [
          { subject: "nearest_enemy_distance", operator: "lt", value: 3 },
        ],
        action: "FLEE",
      },
      {
        priority: 3,
        conditions: [
          { subject: "distance_to_extract", operator: "lt", value: 1 },
          { subject: "extraction_available", operator: "eq", value: 1 },
        ],
        action: "EXTRACT",
      },
      {
        priority: 4,
        conditions: [
          { subject: "nearby_loot_count", operator: "gt", value: 0 },
        ],
        action: "MOVE_TO_NEAREST_LOOT",
      },
      {
        priority: 5,
        conditions: [
          { subject: "inventory_count", operator: "gte", value: 5 },
          { subject: "extraction_available", operator: "eq", value: 1 },
        ],
        action: "MOVE_TO_EXTRACT",
      },
    ],
    fallbackAction: "MOVE_TO_RANDOM",
  },
  {
    name: "Survivor",
    rules: [
      {
        priority: 0,
        conditions: [{ subject: "hp_percent", operator: "lt", value: 50 }],
        action: "HEAL",
      },
      {
        priority: 1,
        conditions: [
          { subject: "nearest_zombie_distance", operator: "lt", value: 3 },
        ],
        action: "ATTACK_NEAREST_ZOMBIE",
      },
      {
        priority: 2,
        conditions: [
          { subject: "nearest_enemy_distance", operator: "lt", value: 5 },
        ],
        action: "FLEE",
      },
      {
        priority: 3,
        conditions: [
          { subject: "distance_to_extract", operator: "lt", value: 1 },
          { subject: "extraction_available", operator: "eq", value: 1 },
        ],
        action: "EXTRACT",
      },
      {
        priority: 4,
        conditions: [
          { subject: "extraction_available", operator: "eq", value: 1 },
          { subject: "inventory_count", operator: "gte", value: 2 },
        ],
        action: "MOVE_TO_EXTRACT",
      },
      {
        priority: 5,
        conditions: [
          { subject: "nearby_loot_count", operator: "gt", value: 0 },
        ],
        action: "MOVE_TO_NEAREST_LOOT",
      },
    ],
    fallbackAction: "MOVE_TO_RANDOM",
  },
  {
    name: "Explorer",
    rules: [
      {
        priority: 0,
        conditions: [{ subject: "hp_percent", operator: "lt", value: 20 }],
        action: "HEAL",
      },
      {
        priority: 1,
        conditions: [
          { subject: "nearest_zombie_distance", operator: "lt", value: 4 },
        ],
        action: "ATTACK_NEAREST_ZOMBIE",
      },
      {
        priority: 2,
        conditions: [
          { subject: "nearby_loot_count", operator: "gt", value: 0 },
        ],
        action: "MOVE_TO_NEAREST_LOOT",
      },
      {
        priority: 3,
        conditions: [
          { subject: "nearest_enemy_distance", operator: "lt", value: 2 },
        ],
        action: "ATTACK_NEAREST",
      },
    ],
    fallbackAction: "MOVE_TO_RANDOM",
  },
  {
    name: "Rusher",
    rules: [
      {
        priority: 0,
        conditions: [{ subject: "hp_percent", operator: "lt", value: 20 }],
        action: "HEAL",
      },
      {
        priority: 1,
        conditions: [
          { subject: "nearest_zombie_distance", operator: "lt", value: 2 },
        ],
        action: "FLEE",
      },
      {
        priority: 2,
        conditions: [
          { subject: "distance_to_extract", operator: "lt", value: 1 },
          { subject: "extraction_available", operator: "eq", value: 1 },
        ],
        action: "EXTRACT",
      },
      {
        priority: 3,
        conditions: [
          { subject: "nearest_enemy_distance", operator: "lt", value: 2 },
        ],
        action: "FLEE",
      },
      {
        priority: 4,
        conditions: [
          { subject: "extraction_available", operator: "eq", value: 1 },
        ],
        action: "MOVE_TO_EXTRACT",
      },
    ],
    fallbackAction: "MOVE_TO_RANDOM",
  },
];

export const STRATEGY_COLORS: Record<string, string> = {
  Aggressive: "#ef4444",
  Looter: "#eab308",
  Survivor: "#22c55e",
  Explorer: "#3b82f6",
  Rusher: "#a855f7",
};
