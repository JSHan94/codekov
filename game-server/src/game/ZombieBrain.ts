import { ZOMBIE_CONFIGS } from "../types/zombie.js";
import type { ZombieType } from "../types/zombie.js";
import { moveOneStep } from "./AgentBrain.js";
import type { TileGrid } from "./TileGrid.js";

export interface ZombieState {
  id: string;
  zombieType: ZombieType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: string; // "alive" | "dead"
}

export interface ZombieTarget {
  id: string;
  x: number;
  y: number;
}

export interface ZombieAction {
  type: "move" | "attack" | "idle";
  targetX?: number;
  targetY?: number;
  targetId?: string;
}

function manhattanDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

/**
 * Decide a zombie's action for this tick.
 * Targets are players and ally agents (not neutral NPCs).
 */
export function zombieDecide(
  zombie: ZombieState,
  targets: ZombieTarget[],
  mapWidth: number,
  mapHeight: number,
  tileGrid: TileGrid,
): ZombieAction {
  if (zombie.state !== "alive") return { type: "idle" };

  const config = ZOMBIE_CONFIGS[zombie.zombieType];

  // Find nearest target within detection range
  let nearestTarget: ZombieTarget | null = null;
  let nearestDist = Infinity;

  for (const target of targets) {
    const dist = manhattanDistance(zombie.x, zombie.y, target.x, target.y);
    if (dist <= config.detectionRange && dist < nearestDist) {
      nearestDist = dist;
      nearestTarget = target;
    }
  }

  // If target in attack range, attack
  if (nearestTarget && nearestDist <= config.attackRange) {
    return {
      type: "attack",
      targetId: nearestTarget.id,
      targetX: nearestTarget.x,
      targetY: nearestTarget.y,
    };
  }

  // If target detected, chase
  if (nearestTarget) {
    const step = moveOneStep(
      zombie.x, zombie.y,
      nearestTarget.x, nearestTarget.y,
      mapWidth, mapHeight,
      tileGrid,
    );
    return {
      type: "move",
      targetX: step.x,
      targetY: step.y,
    };
  }

  // No target: move toward map center
  const centerX = Math.floor(mapWidth / 2);
  const centerY = Math.floor(mapHeight / 2);
  const distToCenter = manhattanDistance(zombie.x, zombie.y, centerX, centerY);

  if (distToCenter > 2) {
    const step = moveOneStep(
      zombie.x, zombie.y,
      centerX, centerY,
      mapWidth, mapHeight,
      tileGrid,
    );
    return {
      type: "move",
      targetX: step.x,
      targetY: step.y,
    };
  }

  return { type: "idle" };
}
