import type { Agent, RaidState } from "../rooms/schema/RaidState.js";
import { moveOneStep } from "./AgentBrain.js";
import type { TileGrid } from "./TileGrid.js";
import type { ActionResult } from "./AgentBrain.js";
import { GAME } from "../config/game.constants.js";

type AllyCommand = "follow" | "hold" | "attack";

function manhattanDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

interface ZombieInfo {
  id: string;
  x: number;
  y: number;
  distance: number;
}

function findNearbyZombies(
  agent: Agent,
  state: RaidState,
  maxRange: number,
): ZombieInfo[] {
  const zombies: ZombieInfo[] = [];
  state.zombies.forEach((zombie, id) => {
    if (zombie.state !== "alive") return;
    const dist = manhattanDistance(agent.x, agent.y, zombie.x, zombie.y);
    if (dist <= maxRange) {
      zombies.push({ id, x: zombie.x, y: zombie.y, distance: dist });
    }
  });
  zombies.sort((a, b) => a.distance - b.distance);
  return zombies;
}

/**
 * Decide ally behavior based on command.
 *
 * - follow: Follow player, attack zombies that get close
 * - hold: Stay at current position, attack nearby zombies
 * - attack: Actively hunt nearest zombie
 */
export function allyDecide(
  ally: Agent,
  state: RaidState,
  tileGrid: TileGrid,
): ActionResult {
  const command: AllyCommand = (ally.allyCommand as AllyCommand) || "follow";
  const w = state.mapWidth;
  const h = state.mapHeight;

  // Find owner (player)
  let owner: Agent | null = null;
  if (ally.allyOwnerId) {
    state.agents.forEach((agent) => {
      if (agent.sessionId === ally.allyOwnerId && agent.state === "alive") {
        owner = agent;
      }
    });
  }

  const nearbyZombies = findNearbyZombies(ally, state, GAME.ALLY.ATTACK_RANGE);

  switch (command) {
    case "follow": {
      // Attack zombies that are very close (within 2 tiles)
      const closeZombie = nearbyZombies.find((z) => z.distance <= 2);
      if (closeZombie) {
        const step = moveOneStep(ally.x, ally.y, closeZombie.x, closeZombie.y, w, h, tileGrid);
        return {
          action: "ATTACK_NEAREST_ZOMBIE",
          targetX: step.x,
          targetY: step.y,
          targetSessionId: closeZombie.id,
        };
      }

      // Follow player
      if (owner) {
        const distToOwner = manhattanDistance(ally.x, ally.y, owner.x, owner.y);
        if (distToOwner > GAME.ALLY.FOLLOW_DISTANCE) {
          const step = moveOneStep(ally.x, ally.y, owner.x, owner.y, w, h, tileGrid);
          return { action: "FOLLOW_PLAYER", targetX: step.x, targetY: step.y };
        }
      }

      return { action: "HOLD_POSITION" };
    }

    case "hold": {
      // Attack nearby zombies but don't move from position
      if (nearbyZombies.length > 0 && nearbyZombies[0].distance <= 2) {
        return {
          action: "ATTACK_NEAREST_ZOMBIE",
          targetX: ally.x,
          targetY: ally.y,
          targetSessionId: nearbyZombies[0].id,
        };
      }
      return { action: "HOLD_POSITION" };
    }

    case "attack": {
      // Actively chase and attack nearest zombie
      if (nearbyZombies.length > 0) {
        const target = nearbyZombies[0];
        const step = moveOneStep(ally.x, ally.y, target.x, target.y, w, h, tileGrid);
        return {
          action: "ATTACK_NEAREST_ZOMBIE",
          targetX: step.x,
          targetY: step.y,
          targetSessionId: target.id,
        };
      }

      // No zombies nearby, wander or follow player
      if (owner) {
        const distToOwner = manhattanDistance(ally.x, ally.y, owner.x, owner.y);
        if (distToOwner > GAME.ALLY.ATTACK_RANGE) {
          const step = moveOneStep(ally.x, ally.y, owner.x, owner.y, w, h, tileGrid);
          return { action: "FOLLOW_PLAYER", targetX: step.x, targetY: step.y };
        }
      }

      return { action: "MOVE_TO_RANDOM" };
    }

    default:
      return { action: "HOLD_POSITION" };
  }
}
