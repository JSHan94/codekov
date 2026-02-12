import { GAME } from "../config/game.constants.js";
import type { ZombieType } from "../types/zombie.js";
import { ZOMBIE_CONFIGS } from "../types/zombie.js";
import type { TileGrid } from "./TileGrid.js";

export interface ZombieSpawnResult {
  id: string;
  zombieType: ZombieType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
}

let zombieIdCounter = 0;

export function resetZombieIdCounter(): void {
  zombieIdCounter = 0;
}

export interface ZombieManagerConfig {
  initialSpawnTick: number;
  baseSpawnInterval: number;
  baseSpawnCount: number;
  spawnScaling: number;
  maxActive: number;
  minSpawnInterval: number;
  maxTicks: number;
  // Phase system
  phaseSafeEnd: number;
  phaseWarningEnd: number;
  warningSpawnInterval: number;
  warningMaxActive: number;
  fullSpawnInterval: number;
  fullSpawnScaling: number;
}

export class ZombieManager {
  private mapWidth: number;
  private mapHeight: number;
  private tileGrid: TileGrid;
  private activeZombieCount = 0;
  private config: ZombieManagerConfig;

  constructor(mapWidth: number, mapHeight: number, tileGrid: TileGrid, configOverrides?: Partial<ZombieManagerConfig>) {
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
    this.tileGrid = tileGrid;
    this.config = {
      initialSpawnTick: GAME.ZOMBIE.INITIAL_SPAWN_TICK,
      baseSpawnInterval: GAME.ZOMBIE.BASE_SPAWN_INTERVAL,
      baseSpawnCount: GAME.ZOMBIE.BASE_SPAWN_COUNT,
      spawnScaling: GAME.ZOMBIE.SPAWN_SCALING,
      maxActive: GAME.ZOMBIE.MAX_ACTIVE,
      minSpawnInterval: GAME.ZOMBIE.MIN_SPAWN_INTERVAL,
      maxTicks: GAME.MAX_TICKS,
      phaseSafeEnd: GAME.ZOMBIE.PHASE_SAFE_END,
      phaseWarningEnd: GAME.ZOMBIE.PHASE_WARNING_END,
      warningSpawnInterval: GAME.ZOMBIE.WARNING_SPAWN_INTERVAL,
      warningMaxActive: GAME.ZOMBIE.WARNING_MAX_ACTIVE,
      fullSpawnInterval: GAME.ZOMBIE.FULL_SPAWN_INTERVAL,
      fullSpawnScaling: GAME.ZOMBIE.FULL_SPAWN_SCALING,
      ...configOverrides,
    };
  }

  setActiveCount(count: number): void {
    this.activeZombieCount = count;
  }

  /**
   * 3-phase spawn system:
   * - Safe phase (0 ~ phaseSafeEnd): no zombies
   * - Warning phase (phaseSafeEnd ~ phaseWarningEnd): slow spawns, low cap
   * - Full phase (phaseWarningEnd+): fast scaling, high cap
   */
  update(tick: number): ZombieSpawnResult[] {
    const cfg = this.config;

    // Phase 1: Safe - no spawns
    if (tick < cfg.phaseSafeEnd) return [];

    // Determine phase-specific parameters
    let spawnInterval: number;
    let maxActive: number;
    let spawnCount: number;

    if (tick < cfg.phaseWarningEnd) {
      // Phase 2: Warning - slow spawns, low cap
      spawnInterval = cfg.warningSpawnInterval;
      maxActive = cfg.warningMaxActive;
      spawnCount = cfg.baseSpawnCount;
    } else {
      // Phase 3: Full - fast scaling
      const fullProgress = (tick - cfg.phaseWarningEnd) / (cfg.maxTicks - cfg.phaseWarningEnd);
      const intensity = Math.min(1, fullProgress * cfg.fullSpawnScaling);

      spawnInterval = Math.max(
        cfg.minSpawnInterval,
        Math.round(cfg.fullSpawnInterval * (1 - intensity * 0.7))
      );
      maxActive = cfg.maxActive;
      spawnCount = Math.max(1, Math.round(cfg.baseSpawnCount + intensity * cfg.fullSpawnScaling));
    }

    // Don't exceed max active zombies
    if (this.activeZombieCount >= maxActive) return [];

    // Only spawn at intervals
    const ticksSincePhaseStart = tick - cfg.phaseSafeEnd;
    if (ticksSincePhaseStart % spawnInterval !== 0) return [];

    // Clamp spawn count to available slots
    spawnCount = Math.min(spawnCount, maxActive - this.activeZombieCount);

    const results: ZombieSpawnResult[] = [];
    for (let i = 0; i < spawnCount; i++) {
      const spawn = this.getEdgeSpawnPosition();
      if (!spawn) continue;

      const config = ZOMBIE_CONFIGS["basic"];
      const id = `zombie_${zombieIdCounter++}`;
      results.push({
        id,
        zombieType: "basic",
        x: spawn.x,
        y: spawn.y,
        hp: config.hp,
        maxHp: config.hp,
      });
    }

    return results;
  }

  /**
   * Get a passable position on the map edge
   */
  private getEdgeSpawnPosition(): { x: number; y: number } | null {
    const w = this.mapWidth;
    const h = this.mapHeight;

    for (let attempt = 0; attempt < 20; attempt++) {
      let x: number, y: number;

      // Pick a random edge
      const edge = Math.floor(Math.random() * 4);
      switch (edge) {
        case 0: // top
          x = Math.floor(Math.random() * w);
          y = 0;
          break;
        case 1: // bottom
          x = Math.floor(Math.random() * w);
          y = h - 1;
          break;
        case 2: // left
          x = 0;
          y = Math.floor(Math.random() * h);
          break;
        default: // right
          x = w - 1;
          y = Math.floor(Math.random() * h);
          break;
      }

      if (this.tileGrid.isPassable(x, y)) {
        return { x, y };
      }
    }

    return null;
  }

  /**
   * Calculate current wave intensity for HUD display (0-1 scale across 3 phases)
   */
  getWaveIntensity(tick: number): number {
    const cfg = this.config;
    if (tick < cfg.phaseSafeEnd) return 0;
    if (tick < cfg.phaseWarningEnd) {
      // Warning phase: 0 ~ 0.3
      const progress = (tick - cfg.phaseSafeEnd) / (cfg.phaseWarningEnd - cfg.phaseSafeEnd);
      return progress * 0.3;
    }
    // Full phase: 0.3 ~ 1.0
    const fullProgress = (tick - cfg.phaseWarningEnd) / (cfg.maxTicks - cfg.phaseWarningEnd);
    return 0.3 + Math.min(0.7, fullProgress * cfg.fullSpawnScaling * 0.7);
  }
}
