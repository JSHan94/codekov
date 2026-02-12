export type WinConditionType =
  | "extract"            // reach extraction point
  | "eliminate_all"      // kill all enemies
  | "survive_ticks"      // survive N ticks
  | "loot_threshold"     // collect N items
  | "extract_with_loot"; // extract with N+ items

export interface BotSpawnConfig {
  difficulty: "easy" | "medium" | "hard";
  hp: number;
  startItems?: Array<{ itemId: string; quantity: number }>;
  equippedArmor?: string;
  armorDurability?: number;
}

export interface StageConfig {
  id: number;
  name: string;
  briefing: { icon: string; objective: string };
  mapWidth: number;
  mapHeight: number;
  maxTicks: number;
  lootBoxCount: number;
  lootPerBox: { min: number; max: number };
  allowedLootItems?: string[];
  bots: BotSpawnConfig[];
  zone: {
    enabled: boolean;
    stages: Array<{ radius: number; waitTicks: number; shrinkTicks: number }>;
    damagePerTick: number;
    damageScaling: number;
  };
  extraction: { enabled: boolean; count: number; spawnAtTick?: number };
  zombie?: {
    enabled: boolean;
    initialSpawnTick?: number;
    baseSpawnInterval?: number;
    maxActive?: number;
    spawnScaling?: number;
  };
  neutralBots?: number; // number of neutral recruitable NPCs to spawn
  winCondition: { type: WinConditionType; value?: number };
  hints: Array<{ trigger: string; text: string; showOnce: boolean }>;
  playerStartItems?: Array<{ itemId: string; quantity: number }>;
}

export const SOLO_STAGES: StageConfig[] = [
  // Stage 1: First Steps — movement & looting basics
  {
    id: 1,
    name: "First Steps",
    briefing: { icon: "📦", objective: "Collect 3 items from crates" },
    mapWidth: 25, mapHeight: 25, maxTicks: 200,
    lootBoxCount: 8, lootPerBox: { min: 1, max: 2 },
    allowedLootItems: ["bandage", "gold_coin", "pistol"],
    bots: [],
    zone: { enabled: false, stages: [], damagePerTick: 0, damageScaling: 1 },
    extraction: { enabled: false, count: 0 },
    zombie: { enabled: false },
    winCondition: { type: "loot_threshold", value: 3 },
    hints: [
      { trigger: "stage_start", text: "Move towards the crates and loot them", showOnce: true },
      { trigger: "near_loot", text: "You're near a crate! Your agent will loot it automatically", showOnce: true },
      { trigger: "first_loot", text: "Nice! Keep collecting items", showOnce: true },
    ],
  },

  // Stage 2: First Contact — first zombie encounter
  {
    id: 2,
    name: "First Contact",
    briefing: { icon: "🧟", objective: "Survive and kill 3 zombies" },
    mapWidth: 25, mapHeight: 25, maxTicks: 250,
    lootBoxCount: 5, lootPerBox: { min: 1, max: 2 },
    allowedLootItems: ["bandage", "pistol"],
    bots: [],
    zone: { enabled: false, stages: [], damagePerTick: 0, damageScaling: 1 },
    extraction: { enabled: false, count: 0 },
    zombie: { enabled: true, initialSpawnTick: 15, baseSpawnInterval: 30, maxActive: 5, spawnScaling: 0.2 },
    winCondition: { type: "survive_ticks", value: 200 },
    hints: [
      { trigger: "stage_start", text: "Zombies are coming from the edges! Fight them off", showOnce: true },
      { trigger: "low_hp", text: "HP is low! Use bandages to heal", showOnce: true },
    ],
  },

  // Stage 3: Finding Friends — learn recruitment
  {
    id: 3,
    name: "Finding Friends",
    briefing: { icon: "🤝", objective: "Recruit an ally and survive" },
    mapWidth: 30, mapHeight: 30, maxTicks: 300,
    lootBoxCount: 8, lootPerBox: { min: 1, max: 2 },
    bots: [],
    neutralBots: 3,
    zone: { enabled: false, stages: [], damagePerTick: 0, damageScaling: 1 },
    extraction: { enabled: false, count: 0 },
    zombie: { enabled: true, initialSpawnTick: 30, baseSpawnInterval: 20, maxActive: 8, spawnScaling: 0.3 },
    winCondition: { type: "survive_ticks", value: 250 },
    hints: [
      { trigger: "stage_start", text: "Neutral agents roam the map. Press E near one to recruit them!", showOnce: true },
      { trigger: "near_neutral", text: "A neutral agent is nearby! Press E to recruit", showOnce: true },
    ],
  },

  // Stage 4: Hold the Line — defense with allies
  {
    id: 4,
    name: "Hold the Line",
    briefing: { icon: "🛡️", objective: "Survive 250 ticks with your allies" },
    mapWidth: 35, mapHeight: 35, maxTicks: 350,
    lootBoxCount: 12, lootPerBox: { min: 1, max: 3 },
    allowedLootItems: ["bandage", "medkit", "pistol", "ak47"],
    bots: [],
    neutralBots: 4,
    zone: { enabled: false, stages: [], damagePerTick: 0, damageScaling: 1 },
    extraction: { enabled: false, count: 0 },
    zombie: { enabled: true, initialSpawnTick: 20, baseSpawnInterval: 15, maxActive: 15, spawnScaling: 0.5 },
    winCondition: { type: "survive_ticks", value: 250 },
    playerStartItems: [{ itemId: "pistol", quantity: 1 }],
    hints: [
      { trigger: "stage_start", text: "Recruit allies and hold the line against the zombie horde!", showOnce: true },
      { trigger: "low_hp", text: "Heal up! You need to stay alive to command your allies", showOnce: true },
    ],
  },

  // Stage 5: Command & Control — learn ally commands
  {
    id: 5,
    name: "Command & Control",
    briefing: { icon: "📡", objective: "Use ally commands to survive and extract" },
    mapWidth: 35, mapHeight: 35, maxTicks: 400,
    lootBoxCount: 12, lootPerBox: { min: 1, max: 3 },
    allowedLootItems: ["bandage", "medkit", "pistol", "ak47", "grenade"],
    bots: [],
    neutralBots: 5,
    zone: { enabled: false, stages: [], damagePerTick: 0, damageScaling: 1 },
    extraction: { enabled: true, count: 2, spawnAtTick: 200 },
    zombie: { enabled: true, initialSpawnTick: 20, baseSpawnInterval: 12, maxActive: 20, spawnScaling: 0.8 },
    winCondition: { type: "extract" },
    playerStartItems: [{ itemId: "pistol", quantity: 1 }, { itemId: "bandage", quantity: 2 }],
    hints: [
      { trigger: "stage_start", text: "Press 1/2/3 to command allies: Follow, Hold Position, or Attack!", showOnce: true },
      { trigger: "near_extraction", text: "Extraction point! Step on it to escape", showOnce: true },
    ],
  },

  // Stage 6: Extraction Protocol — extract with allies
  {
    id: 6,
    name: "Extraction Protocol",
    briefing: { icon: "🚁", objective: "Extract with at least 2 allies" },
    mapWidth: 40, mapHeight: 40, maxTicks: 500,
    lootBoxCount: 15, lootPerBox: { min: 1, max: 3 },
    bots: [],
    neutralBots: 6,
    zone: { enabled: false, stages: [], damagePerTick: 0, damageScaling: 1 },
    extraction: { enabled: true, count: 2, spawnAtTick: 300 },
    zombie: { enabled: true, initialSpawnTick: 15, baseSpawnInterval: 10, maxActive: 25, spawnScaling: 1.0 },
    winCondition: { type: "extract" },
    playerStartItems: [{ itemId: "ak47", quantity: 1 }, { itemId: "medkit", quantity: 1 }],
    hints: [
      { trigger: "stage_start", text: "Recruit allies and extract together for max reward!", showOnce: true },
    ],
  },

  // Stage 7: Full Survival — complete zombie survival
  {
    id: 7,
    name: "Full Survival",
    briefing: { icon: "🎯", objective: "Survive the full zombie outbreak and extract" },
    mapWidth: 80, mapHeight: 80, maxTicks: 900,
    lootBoxCount: 40, lootPerBox: { min: 1, max: 3 },
    bots: [],
    neutralBots: 8,
    zone: { enabled: false, stages: [], damagePerTick: 0, damageScaling: 1 },
    extraction: { enabled: true, count: 2, spawnAtTick: 550 },
    zombie: { enabled: true, initialSpawnTick: 20, baseSpawnInterval: 12, maxActive: 50, spawnScaling: 1.5 },
    winCondition: { type: "extract" },
    hints: [
      { trigger: "stage_start", text: "Full survival mode. Recruit, fight, extract. Good luck!", showOnce: true },
    ],
  },

  // Stage 8: Last Stand — extreme zombie survival challenge
  {
    id: 8,
    name: "Last Stand",
    briefing: { icon: "💀", objective: "Survive 300 ticks against the zombie apocalypse" },
    mapWidth: 35, mapHeight: 35, maxTicks: 400,
    lootBoxCount: 15, lootPerBox: { min: 2, max: 3 },
    bots: [],
    neutralBots: 5,
    zone: { enabled: false, stages: [], damagePerTick: 0, damageScaling: 1 },
    extraction: { enabled: false, count: 0 },
    zombie: { enabled: true, initialSpawnTick: 10, baseSpawnInterval: 8, maxActive: 60, spawnScaling: 2.0 },
    winCondition: { type: "survive_ticks", value: 300 },
    playerStartItems: [
      { itemId: "ak47", quantity: 1 },
      { itemId: "medkit", quantity: 2 },
      { itemId: "grenade", quantity: 3 },
    ],
    hints: [
      { trigger: "stage_start", text: "Endless zombie waves. Survive 300 ticks. They're coming.", showOnce: true },
    ],
  },
];
