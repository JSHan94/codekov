import { GAME } from "../config/game.constants.js";
import type { Agent, RaidState } from "../rooms/schema/RaidState.js";
import type { TileGrid } from "./TileGrid.js";
import { moveOneStep, type ActionResult } from "./AgentBrain.js";

function manhattanDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

/**
 * Neutral NPC decision logic:
 * 1. Attack nearby zombies (within ZOMBIE_REACT_RANGE)
 * 2. Patrol within PATROL_RADIUS of spawn point
 * 3. Return to spawn if too far
 * 50% chance to idle each tick (slower movement)
 */
export function neutralDecide(
  agent: Agent,
  state: RaidState,
  tileGrid: TileGrid,
): ActionResult {
  const cfg = GAME.NEUTRAL;
  const w = state.mapWidth;
  const h = state.mapHeight;

  // 1. Check for nearby zombies to attack
  let nearestZombieId: string | null = null;
  let nearestZombieDist = Infinity;
  let nearestZombieX = 0;
  let nearestZombieY = 0;

  state.zombies.forEach((zombie, id) => {
    if (zombie.state !== "alive") return;
    const dist = manhattanDistance(agent.x, agent.y, zombie.x, zombie.y);
    if (dist <= cfg.ZOMBIE_REACT_RANGE && dist < nearestZombieDist) {
      nearestZombieDist = dist;
      nearestZombieId = id;
      nearestZombieX = zombie.x;
      nearestZombieY = zombie.y;
    }
  });

  if (nearestZombieId) {
    const step = moveOneStep(agent.x, agent.y, nearestZombieX, nearestZombieY, w, h, tileGrid);
    return {
      action: "ATTACK_NEAREST_ZOMBIE",
      targetSessionId: nearestZombieId,
      targetX: step.x,
      targetY: step.y,
    };
  }

  // 50% chance to idle (slower movement)
  if (Math.random() > cfg.MOVE_CHANCE) {
    return { action: "IDLE" as any, targetX: agent.x, targetY: agent.y };
  }

  // 2. Check distance from spawn
  const distFromSpawn = manhattanDistance(agent.x, agent.y, agent.spawnX, agent.spawnY);

  if (distFromSpawn > cfg.PATROL_RADIUS + 1) {
    // 3. Return to spawn
    const step = moveOneStep(agent.x, agent.y, agent.spawnX, agent.spawnY, w, h, tileGrid);
    return { action: "MOVE_TO_RANDOM", targetX: step.x, targetY: step.y };
  }

  // 2. Patrol: random move within patrol radius
  for (let attempt = 0; attempt < 10; attempt++) {
    const dx = Math.floor(Math.random() * 3) - 1; // -1, 0, 1
    const dy = Math.floor(Math.random() * 3) - 1;
    if (dx === 0 && dy === 0) continue;

    const nx = agent.x + dx;
    const ny = agent.y + dy;

    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
    if (!tileGrid.isPassable(nx, ny)) continue;

    // Stay within patrol radius of spawn
    const newDistFromSpawn = manhattanDistance(nx, ny, agent.spawnX, agent.spawnY);
    if (newDistFromSpawn > cfg.PATROL_RADIUS) continue;

    return { action: "MOVE_TO_RANDOM", targetX: nx, targetY: ny };
  }

  // Fallback: idle
  return { action: "MOVE_TO_RANDOM", targetX: agent.x, targetY: agent.y };
}
