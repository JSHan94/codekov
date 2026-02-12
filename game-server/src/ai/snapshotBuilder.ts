import { GAME } from "../config/game.constants.js";
import type { Agent, RaidState } from "../rooms/schema/RaidState.js";
import type { StateSnapshot } from "./types.js";
import type { Perception } from "./cognitiveTypes.js";

export interface EventLogEntry {
  tick: number;
  agentSessionId: string;
  type: string;
  message: string;
}

function manhattanDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

function getDirection(fromX: number, fromY: number, toX: number, toY: number): string {
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (dx === 0 && dy === 0) return "HERE";
  const angle = Math.atan2(-dy, dx) * (180 / Math.PI); // -dy because grid y increases downward
  if (angle >= -22.5 && angle < 22.5) return "E";
  if (angle >= 22.5 && angle < 67.5) return "NE";
  if (angle >= 67.5 && angle < 112.5) return "N";
  if (angle >= 112.5 && angle < 157.5) return "NW";
  if (angle >= 157.5 || angle < -157.5) return "W";
  if (angle >= -157.5 && angle < -112.5) return "SW";
  if (angle >= -112.5 && angle < -67.5) return "S";
  return "SE";
}

export function buildStateSnapshot(
  agent: Agent,
  state: RaidState,
  visionCheck?: (fx: number, fy: number, tx: number, ty: number) => boolean,
): StateSnapshot {
  const enemies: number[] = [];
  state.agents.forEach((other) => {
    if (other.sessionId !== agent.sessionId && other.state === "alive") {
      if (visionCheck && !visionCheck(agent.x, agent.y, other.x, other.y)) return;
      const d = manhattanDistance(agent.x, agent.y, other.x, other.y);
      if (d <= GAME.DETECTION_RANGE) {
        enemies.push(d);
      }
    }
  });
  enemies.sort((a, b) => a - b);

  const lootDistances: number[] = [];
  state.objects.forEach((obj) => {
    if ((obj.objectType === "LOOT_BOX" || obj.objectType === "CORPSE") && obj.items.length > 0) {
      if (visionCheck && !visionCheck(agent.x, agent.y, obj.x, obj.y)) return;
      const d = manhattanDistance(agent.x, agent.y, obj.x, obj.y);
      if (d <= GAME.DETECTION_RANGE) {
        lootDistances.push(d);
      }
    }
  });
  lootDistances.sort((a, b) => a - b);

  const inventory: string[] = [];
  for (const item of agent.inventory) {
    const label = item.quantity > 1 ? `${item.itemId}x${item.quantity}` : item.itemId;
    inventory.push(label);
  }

  // Dynamic extraction point distances (always visible)
  const extractionDistances: number[] = [];
  state.objects.forEach((obj) => {
    if (obj.objectType === "EXTRACTION") {
      extractionDistances.push(manhattanDistance(agent.x, agent.y, obj.x, obj.y));
    }
  });
  extractionDistances.sort((a, b) => a - b);

  return {
    hp_percent: (agent.hp / agent.maxHp) * 100,
    position: { x: agent.x, y: agent.y },
    inventory,
    nearby_enemy_count: enemies.length,
    nearest_enemy_distance: enemies.length > 0 ? enemies[0] : Infinity,
    nearby_loot_count: lootDistances.length,
    nearest_loot_distance: lootDistances.length > 0 ? lootDistances[0] : Infinity,
    distance_to_extract: extractionDistances[0] ?? Infinity,
    extraction_available: extractionDistances.length > 0,
    tick: state.tick,
    has_armor: !!agent.equippedArmor,
  };
}

export function summarizeEventLog(
  events: EventLogEntry[],
  agentSessionId: string,
  lastNTicks: number = 10,
  currentTick: number = 0,
): string {
  const cutoff = currentTick - lastNTicks;
  const relevant = events.filter(
    (e) => e.tick >= cutoff && e.agentSessionId === agentSessionId
  );
  if (relevant.length === 0) return "No recent events";
  return relevant
    .slice(-5) // Last 5 events max
    .map((e) => `T${e.tick} ${e.message}`)
    .join(", ");
}

export function buildPerception(
  agent: Agent,
  state: RaidState,
  visionCheck?: (fx: number, fy: number, tx: number, ty: number) => boolean,
): Perception {
  const threats: Perception["threats"] = [];
  state.agents.forEach((other) => {
    if (other.sessionId !== agent.sessionId && other.state === "alive") {
      if (visionCheck && !visionCheck(agent.x, agent.y, other.x, other.y)) return;
      const d = manhattanDistance(agent.x, agent.y, other.x, other.y);
      if (d <= GAME.DETECTION_RANGE) {
        threats.push({
          distance: d,
          direction: getDirection(agent.x, agent.y, other.x, other.y),
        });
      }
    }
  });
  threats.sort((a, b) => a.distance - b.distance);

  const opportunities: Perception["opportunities"] = [];
  state.objects.forEach((obj) => {
    if ((obj.objectType === "LOOT_BOX" || obj.objectType === "CORPSE") && obj.items.length > 0) {
      if (visionCheck && !visionCheck(agent.x, agent.y, obj.x, obj.y)) return;
      const d = manhattanDistance(agent.x, agent.y, obj.x, obj.y);
      if (d <= GAME.DETECTION_RANGE) {
        opportunities.push({
          type: obj.objectType === "LOOT_BOX" ? "LootBox" : "Corpse",
          distance: d,
          direction: getDirection(agent.x, agent.y, obj.x, obj.y),
        });
      }
    }
    if (obj.objectType === "EXTRACTION") {
      const d = manhattanDistance(agent.x, agent.y, obj.x, obj.y);
      opportunities.push({
        type: "Extraction",
        distance: d,
        direction: getDirection(agent.x, agent.y, obj.x, obj.y),
      });
    }
  });
  opportunities.sort((a, b) => a.distance - b.distance);

  const inventoryLabels: string[] = [];
  for (const item of agent.inventory) {
    const label = item.quantity > 1 ? `${item.itemId}x${item.quantity}` : item.itemId;
    inventoryLabels.push(label);
  }

  return {
    threats,
    opportunities,
    environment: {
      terrain_cover: false, // TODO: derive from TileGrid if needed
    },
    self: {
      hp_percent: Math.round((agent.hp / agent.maxHp) * 100),
      armor: !!agent.equippedArmor,
      inventory_summary: inventoryLabels.length > 0 ? inventoryLabels.join(", ") : "empty",
    },
  };
}

export function serializePerception(p: Perception): string {
  const parts: string[] = [];

  // Self
  parts.push(`Self: HP ${p.self.hp_percent}% | Armor: ${p.self.armor ? "Yes" : "No"} | Inv: ${p.self.inventory_summary}`);

  // Threats
  if (p.threats.length > 0) {
    const threatStrs = p.threats.map((t) => `Enemy ${t.distance} tiles ${t.direction}`);
    parts.push(`Threats: ${threatStrs.join(", ")}`);
  } else {
    parts.push("Threats: None detected");
  }

  // Opportunities
  if (p.opportunities.length > 0) {
    const oppStrs = p.opportunities.slice(0, 5).map((o) => `${o.type} ${o.distance} tiles ${o.direction}`);
    parts.push(`Opportunities: ${oppStrs.join(", ")}`);
  } else {
    parts.push("Opportunities: None nearby");
  }

  return parts.join("\n");
}
