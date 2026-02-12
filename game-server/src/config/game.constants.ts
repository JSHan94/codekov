export const GAME = {
  MAP_WIDTH: 80,
  MAP_HEIGHT: 80,
  TICK_MS: 120,
  MAX_PLAYERS: 10,
  LOOT_BOX_COUNT: 40,
  EXTRACTION: {
    ACTIVATES_AT_TICK: 550, // ~61% of game, slightly later for more survival time
    EXIT_COUNT: 2,
    MIN_DISTANCE_BETWEEN: 5,
  },
  MAX_TICKS: 900,
  ZOMBIE: {
    INITIAL_SPAWN_TICK: 20, // legacy fallback
    PHASE_SAFE_END: 100,       // ~30s safe phase (no zombies)
    PHASE_WARNING_END: 300,    // ~90s warning phase (slow spawns)
    WARNING_SPAWN_INTERVAL: 20, // warning phase: slow spawn interval
    WARNING_MAX_ACTIVE: 8,      // warning phase: max 8 zombies
    FULL_SPAWN_INTERVAL: 6,     // full phase: fast spawn interval
    FULL_SPAWN_SCALING: 2.0,    // full phase: aggressive scaling
    BASE_SPAWN_INTERVAL: 15,
    BASE_SPAWN_COUNT: 1,
    SPAWN_SCALING: 1.5,
    MAX_ACTIVE: 50,
    MIN_SPAWN_INTERVAL: 2,
  },
  ALLY: {
    MAX_ALLIES: 3,
    FOLLOW_DISTANCE: 2,
    ATTACK_RANGE: 8,
  },
  RECRUITMENT: {
    PROXIMITY_RANGE: 2,
    COOLDOWN_TICKS: 30,
  },
  NEUTRAL: {
    PATROL_RADIUS: 4,
    MOVE_CHANCE: 0.5,
    ZOMBIE_REACT_RANGE: 2,
  },
  DETECTION_RANGE: 10,
  VISION_RADIUS: 8,
  UNARMED: { damage: 8, accuracy: 75, range: 2 },
  HIT_CHANCE: { min: 10, max: 95, distancePenalty: 5 },
  WANDER: { minDist: 10, historySize: 6, stuckThreshold: 2 },
  DODGE: {
    TILES_MOVED: 2,
    INVULNERABILITY_TICKS: 1,
    COOLDOWN_TICKS: 5,
  },
  DAMAGE_VARIANCE: 0.2,
  DEFAULT_HP: 100,
  LOOT_PER_BOX: { min: 1, max: 3 },
  TERRAIN: {
    WALL_CLUSTERS: { min: 8, max: 14 },
    WALL_CLUSTER_SIZE: { min: 4, max: 9 },
    COVER_COUNT: { min: 30, max: 50 },
    BUSH_PATCHES: { min: 5, max: 9 },
    BUSH_PATCH_SIZE: { min: 5, max: 12 },
    COVER_HIT_REDUCTION: 15,
    BUSH_DETECTION_REDUCTION: 5,
  },
} as const;
