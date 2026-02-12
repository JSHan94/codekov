import { GAME } from "../config/game.constants.js";
import type { Agent, RaidState } from "../rooms/schema/RaidState.js";
import type { TileGrid } from "./TileGrid.js";
import { moveOneStep, type ActionResult } from "./AgentBrain.js";

export interface ManualAction {
  type: string;
  dx?: number;
  dy?: number;
  targetSessionId?: string;
}

/**
 * Resolve a manual player action into an ActionResult.
 * Returns null if the action is invalid or cannot be performed.
 */
export function resolveManualAction(
  agent: Agent,
  manual: ManualAction,
  state: RaidState,
  tileGrid: TileGrid,
  tick: number,
): ActionResult | null {
  const w = state.mapWidth;
  const h = state.mapHeight;

  switch (manual.type) {
    case "MOVE": {
      const dx = manual.dx ?? 0;
      const dy = manual.dy ?? 0;
      if (dx === 0 && dy === 0) return null;
      const nx = agent.x + dx;
      const ny = agent.y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) return null;
      if (!tileGrid.isPassable(nx, ny)) return null;
      return { action: "MOVE_TO_RANDOM", targetX: nx, targetY: ny };
    }

    case "LOOT": {
      return { action: "LOOT", targetX: agent.x, targetY: agent.y };
    }

    case "ATTACK": {
      const targetId = manual.targetSessionId;
      if (!targetId) return null;
      const target = state.agents.get(targetId);
      if (!target || target.state !== "alive") return null;
      // Move one step toward the target
      const step = moveOneStep(agent.x, agent.y, target.x, target.y, w, h, tileGrid);
      return {
        action: "ATTACK_NEAREST",
        targetSessionId: targetId,
        targetX: step.x,
        targetY: step.y,
      };
    }

    case "ATTACK_ZOMBIE": {
      const targetId = manual.targetSessionId;
      if (!targetId) return null;
      const zombie = state.zombies.get(targetId);
      if (!zombie || zombie.state !== "alive") return null;
      const step = moveOneStep(agent.x, agent.y, zombie.x, zombie.y, w, h, tileGrid);
      return {
        action: "ATTACK_NEAREST_ZOMBIE",
        targetSessionId: targetId,
        targetX: step.x,
        targetY: step.y,
      };
    }

    case "DODGE": {
      // Check cooldown
      if (tick < agent.dodgeCooldownUntilTick) return null;
      const dx = manual.dx ?? 0;
      const dy = manual.dy ?? 0;
      if (dx === 0 && dy === 0) return null;

      // Move up to TILES_MOVED tiles in the given direction, stopping at walls
      let finalX = agent.x;
      let finalY = agent.y;
      for (let i = 0; i < GAME.DODGE.TILES_MOVED; i++) {
        const nx = finalX + dx;
        const ny = finalY + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) break;
        if (!tileGrid.isPassable(nx, ny)) break;
        finalX = nx;
        finalY = ny;
      }

      // Set dodge state
      agent.isDodging = true;
      agent.dodgeTicksRemaining = GAME.DODGE.INVULNERABILITY_TICKS;
      agent.dodgeCooldownUntilTick = tick + GAME.DODGE.COOLDOWN_TICKS;

      return { action: "MOVE_TO_RANDOM", targetX: finalX, targetY: finalY };
    }

    default:
      return null;
  }
}
