import { GAME } from "../config/game.constants.js";
import type { Action, Condition, Operator, Strategy } from "../types/strategy.js";
import { ITEM_REGISTRY, isConsumable } from "../types/items.js";
import type { Agent, MapObject, RaidState } from "../rooms/schema/RaidState.js";
import type { TileGrid } from "./TileGrid.js";

function manhattanDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

export interface WorldContext {
  hp_percent: number;
  nearby_enemy_count: number;
  nearest_enemy_distance: number;
  nearby_loot_count: number;
  nearest_loot_distance: number;
  inventory_count: number;
  distance_to_extract: number;
  tick: number;
  has_cover: number;
  has_armor: number;
  armor_durability: number;
  has_grenade: number;
  has_smoke: number;
  has_trap: number;
  extraction_available: number;
  nearby_zombie_count: number;
  nearest_zombie_distance: number;
  ally_count: number;
  wave_intensity: number;
}

export function buildWorldContext(
  agent: Agent,
  state: RaidState,
  tileGrid?: TileGrid,
  visionCheck?: (fx: number, fy: number, tx: number, ty: number) => boolean,
): WorldContext {
  const enemies: Array<{ distance: number }> = [];
  state.agents.forEach((other) => {
    if (other.sessionId !== agent.sessionId && other.state === "alive") {
      if (visionCheck && !visionCheck(agent.x, agent.y, other.x, other.y)) return;
      let d = manhattanDistance(agent.x, agent.y, other.x, other.y);

      // Bush detection: agent in bush is harder to detect
      if (tileGrid && tileGrid.isBush(other.x, other.y)) {
        d += GAME.TERRAIN.BUSH_DETECTION_REDUCTION;
      }

      // Smoke detection: enemy inside smoke is invisible
      let insideSmoke = false;
      state.objects.forEach((obj) => {
        if (obj.objectType === "SMOKE" && obj.expiresAtTick > state.tick) {
          const smokeDist = manhattanDistance(other.x, other.y, obj.x, obj.y);
          if (smokeDist <= obj.radius) {
            insideSmoke = true;
          }
        }
      });
      if (insideSmoke) return; // Skip this enemy (undetected)

      enemies.push({ distance: d });
    }
  });

  const lootBoxes: Array<{ distance: number }> = [];
  state.objects.forEach((obj) => {
    if ((obj.objectType === "LOOT_BOX" || obj.objectType === "CORPSE") && obj.items.length > 0) {
      if (visionCheck && !visionCheck(agent.x, agent.y, obj.x, obj.y)) return;
      const d = manhattanDistance(agent.x, agent.y, obj.x, obj.y);
      lootBoxes.push({ distance: d });
    }
  });

  // Detection range adjusted for bush
  let detectionRange = GAME.DETECTION_RANGE;
  if (tileGrid && tileGrid.isBush(agent.x, agent.y)) {
    detectionRange += GAME.TERRAIN.BUSH_DETECTION_REDUCTION;
  }

  const nearbyEnemies = enemies.filter(
    (e) => e.distance <= detectionRange,
  );
  const nearbyLoot = lootBoxes.filter(
    (l) => l.distance <= GAME.DETECTION_RANGE,
  );

  nearbyEnemies.sort((a, b) => a.distance - b.distance);
  nearbyLoot.sort((a, b) => a.distance - b.distance);

  let inventoryCount = 0;
  for (const item of agent.inventory) {
    inventoryCount += item.quantity;
  }

  // Check cover: any adjacent COVER tile
  let hasCover = 0;
  if (tileGrid) {
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dx, dy] of dirs) {
      if (tileGrid.isCover(agent.x + dx, agent.y + dy)) {
        hasCover = 1;
        break;
      }
    }
  }

  // Item checks
  let hasArmor = 0;
  let armorDurability = 0;
  let hasGrenade = 0;
  let hasSmoke = 0;
  let hasTrap = 0;

  if (agent.equippedArmor) {
    hasArmor = 1;
    armorDurability = agent.armorDurability;
  }

  for (const item of agent.inventory) {
    if (item.itemId === "grenade") hasGrenade = item.quantity;
    if (item.itemId === "smoke_grenade") hasSmoke = item.quantity;
    if (item.itemId === "trap") hasTrap = item.quantity;
  }

  // Dynamic extraction point distances
  const extractionDistances: number[] = [];
  state.objects.forEach((obj) => {
    if (obj.objectType === "EXTRACTION") {
      extractionDistances.push(manhattanDistance(agent.x, agent.y, obj.x, obj.y));
    }
  });
  extractionDistances.sort((a, b) => a - b);

  // Zombie detection
  const zombies: Array<{ distance: number }> = [];
  if (state.zombies) {
    state.zombies.forEach((zombie) => {
      if (zombie.state !== "alive") return;
      const d = manhattanDistance(agent.x, agent.y, zombie.x, zombie.y);
      if (d <= detectionRange) {
        zombies.push({ distance: d });
      }
    });
    zombies.sort((a, b) => a.distance - b.distance);
  }

  // Ally count
  let allyCount = 0;
  state.agents.forEach((other) => {
    if (other.allyStatus === "ally" && other.allyOwnerId === agent.sessionId && other.state === "alive") {
      allyCount++;
    }
  });

  return {
    hp_percent: (agent.hp / agent.maxHp) * 100,
    nearby_enemy_count: nearbyEnemies.length,
    nearest_enemy_distance:
      nearbyEnemies.length > 0 ? nearbyEnemies[0].distance : Infinity,
    nearby_loot_count: nearbyLoot.length,
    nearest_loot_distance:
      nearbyLoot.length > 0 ? nearbyLoot[0].distance : Infinity,
    inventory_count: inventoryCount,
    distance_to_extract: extractionDistances[0] ?? Infinity,
    tick: state.tick,
    has_cover: hasCover,
    has_armor: hasArmor,
    armor_durability: armorDurability,
    has_grenade: hasGrenade,
    has_smoke: hasSmoke,
    has_trap: hasTrap,
    extraction_available: extractionDistances.length > 0 ? 1 : 0,
    nearby_zombie_count: zombies.length,
    nearest_zombie_distance: zombies.length > 0 ? zombies[0].distance : Infinity,
    ally_count: allyCount,
    wave_intensity: (state as any).waveIntensity ?? 0,
  };
}

function evaluateCondition(
  ctx: WorldContext,
  condition: Condition,
): boolean {
  const subjectValue = ctx[condition.subject];
  const { operator, value } = condition;

  const ops: Record<Operator, (a: number, b: number) => boolean> = {
    lt: (a, b) => a < b,
    lte: (a, b) => a <= b,
    gt: (a, b) => a > b,
    gte: (a, b) => a >= b,
    eq: (a, b) => a === b,
  };

  return ops[operator](subjectValue, value);
}

export interface ActionResult {
  action: Action;
  targetX?: number;
  targetY?: number;
  targetSessionId?: string;
}

export function decide(
  agent: Agent,
  state: RaidState,
  tileGrid?: TileGrid,
  visionCheck?: (fx: number, fy: number, tx: number, ty: number) => boolean,
): ActionResult {
  let result: ActionResult;

  // 1. Check pending override command
  if (agent.pendingCommand) {
    const action = agent.pendingCommand;
    agent.pendingCommand = null;
    result = resolveActionTarget(action, agent, state, tileGrid, visionCheck);
  } else {
    // 2. Build context and evaluate rules
    const ctx = buildWorldContext(agent, state, tileGrid, visionCheck);
    const sorted = [...agent.strategy.rules].sort(
      (a, b) => a.priority - b.priority,
    );

    let matched = false;
    for (const rule of sorted) {
      const allMatch = rule.conditions.every((c) => evaluateCondition(ctx, c));
      if (allMatch) {
        result = resolveActionTarget(rule.action, agent, state, tileGrid, visionCheck);
        matched = true;
        break;
      }
    }

    // 3. Fallback
    if (!matched) {
      result = resolveActionTarget(agent.strategy.fallbackAction, agent, state, tileGrid, visionCheck);
    }
  }

  // Clear wander state when not wandering
  if (result!.action !== "MOVE_TO_RANDOM") {
    agent.wanderTargetX = null;
    agent.wanderTargetY = null;
  }

  return result!;
}

export function moveOneStep(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  mapWidth: number,
  mapHeight: number,
  tileGrid?: TileGrid,
): { x: number; y: number } {
  const dx = Math.sign(toX - fromX);
  const dy = Math.sign(toY - fromY);

  // Build candidate moves: primary -> secondary -> perpendicular directions
  const candidates: Array<[number, number]> = [];
  if (Math.abs(toX - fromX) >= Math.abs(toY - fromY)) {
    if (dx !== 0) candidates.push([dx, 0]);
    if (dy !== 0) candidates.push([0, dy]);
    // Perpendicular bypass for L-shaped walls
    if (dx !== 0) {
      candidates.push([0, 1], [0, -1]);
    }
  } else {
    if (dy !== 0) candidates.push([0, dy]);
    if (dx !== 0) candidates.push([dx, 0]);
    // Perpendicular bypass for L-shaped walls
    if (dy !== 0) {
      candidates.push([1, 0], [-1, 0]);
    }
  }

  for (const [mx, my] of candidates) {
    const nx = fromX + mx;
    const ny = fromY + my;
    if (nx >= 0 && nx < mapWidth && ny >= 0 && ny < mapHeight) {
      if (!tileGrid || tileGrid.isPassable(nx, ny)) {
        return { x: nx, y: ny };
      }
    }
  }

  // All directions blocked -- stay
  return { x: fromX, y: fromY };
}

function findNearestEnemy(
  agent: Agent,
  state: RaidState,
  visionCheck?: (fx: number, fy: number, tx: number, ty: number) => boolean,
): Agent | null {
  let nearest: Agent | null = null;
  let minDist = Infinity;

  state.agents.forEach((other) => {
    if (other.sessionId !== agent.sessionId && other.state === "alive") {
      if (visionCheck && !visionCheck(agent.x, agent.y, other.x, other.y)) return;
      const d = manhattanDistance(agent.x, agent.y, other.x, other.y);
      if (d < minDist) {
        minDist = d;
        nearest = other;
      }
    }
  });

  return nearest;
}

function findNearestExtraction(
  agent: Agent,
  state: RaidState,
): MapObject | null {
  let nearest: MapObject | null = null;
  let minDist = Infinity;

  state.objects.forEach((obj) => {
    if (obj.objectType === "EXTRACTION") {
      const d = manhattanDistance(agent.x, agent.y, obj.x, obj.y);
      if (d < minDist) {
        minDist = d;
        nearest = obj;
      }
    }
  });

  return nearest;
}

function findNearestLootBox(
  agent: Agent,
  state: RaidState,
  visionCheck?: (fx: number, fy: number, tx: number, ty: number) => boolean,
): MapObject | null {
  let nearest: MapObject | null = null;
  let minDist = Infinity;

  state.objects.forEach((obj) => {
    if ((obj.objectType === "LOOT_BOX" || obj.objectType === "CORPSE") && obj.items.length > 0) {
      if (visionCheck && !visionCheck(agent.x, agent.y, obj.x, obj.y)) return;
      const d = manhattanDistance(agent.x, agent.y, obj.x, obj.y);
      if (d < minDist) {
        minDist = d;
        nearest = obj;
      }
    }
  });

  return nearest;
}

function pickWanderTarget(
  fromX: number,
  fromY: number,
  mapWidth: number,
  mapHeight: number,
  tileGrid?: TileGrid,
): { x: number; y: number } {
  const minDist = GAME.WANDER.minDist;
  for (let i = 0; i < 20; i++) {
    const x = Math.floor(Math.random() * mapWidth);
    const y = Math.floor(Math.random() * mapHeight);
    if (
      manhattanDistance(fromX, fromY, x, y) >= minDist &&
      (!tileGrid || tileGrid.isPassable(x, y))
    ) {
      return { x, y };
    }
  }
  // Safe fallback: try random nearby passable tiles
  for (let attempt = 0; attempt < 10; attempt++) {
    const tx = fromX + Math.floor(Math.random() * 31) - 15;
    const ty = fromY + Math.floor(Math.random() * 31) - 15;
    if (tx >= 0 && tx < mapWidth && ty >= 0 && ty < mapHeight) {
      if (!tileGrid || tileGrid.isPassable(tx, ty)) {
        return { x: tx, y: ty };
      }
    }
  }
  // Last resort: stay at current position
  return { x: fromX, y: fromY };
}

function isStuck(recentPositions: Array<{ x: number; y: number }>): boolean {
  if (recentPositions.length < GAME.WANDER.historySize) return false;
  const unique = new Set(recentPositions.map((p) => `${p.x},${p.y}`));
  return unique.size <= GAME.WANDER.stuckThreshold;
}

export function resolveActionTarget(
  action: Action,
  agent: Agent,
  state: RaidState,
  tileGrid?: TileGrid,
  visionCheck?: (fx: number, fy: number, tx: number, ty: number) => boolean,
): ActionResult {
  const w = state.mapWidth;
  const h = state.mapHeight;

  switch (action) {
    case "MOVE_TO_NEAREST_LOOT": {
      const loot = findNearestLootBox(agent, state, visionCheck);
      if (loot) {
        // Already at loot position -- pick it up
        if (loot.x === agent.x && loot.y === agent.y) {
          return { action: "LOOT", targetX: agent.x, targetY: agent.y };
        }
        const step = moveOneStep(agent.x, agent.y, loot.x, loot.y, w, h, tileGrid);
        return { action, targetX: step.x, targetY: step.y };
      }
      // No loot found, move random
      return resolveActionTarget("MOVE_TO_RANDOM", agent, state, tileGrid, visionCheck);
    }

    case "MOVE_TO_EXTRACT": {
      const nearest = findNearestExtraction(agent, state);
      if (nearest) {
        const step = moveOneStep(agent.x, agent.y, nearest.x, nearest.y, w, h, tileGrid);
        return { action, targetX: step.x, targetY: step.y };
      }
      // No extraction points available, wander
      return resolveActionTarget("MOVE_TO_RANDOM", agent, state, tileGrid, visionCheck);
    }

    case "MOVE_TO_RANDOM": {
      // Update position history (circular buffer)
      agent.recentPositions.push({ x: agent.x, y: agent.y });
      if (agent.recentPositions.length > GAME.WANDER.historySize) {
        agent.recentPositions.shift();
      }

      // Determine if a new waypoint is needed
      const needNew =
        agent.wanderTargetX === null ||
        agent.wanderTargetY === null ||
        manhattanDistance(agent.x, agent.y, agent.wanderTargetX, agent.wanderTargetY) <= 1 ||
        isStuck(agent.recentPositions);

      if (needNew) {
        const wp = pickWanderTarget(agent.x, agent.y, w, h, tileGrid);
        agent.wanderTargetX = wp.x;
        agent.wanderTargetY = wp.y;
        agent.recentPositions = [];
      }

      const step = moveOneStep(agent.x, agent.y, agent.wanderTargetX!, agent.wanderTargetY!, w, h, tileGrid);
      return { action, targetX: step.x, targetY: step.y };
    }

    case "ATTACK_NEAREST": {
      const enemy = findNearestEnemy(agent, state, visionCheck);
      if (enemy) {
        // Move toward enemy while attacking
        const step = moveOneStep(agent.x, agent.y, enemy.x, enemy.y, w, h, tileGrid);
        return { action, targetSessionId: enemy.sessionId, targetX: step.x, targetY: step.y };
      }
      // No enemy, wander
      return resolveActionTarget("MOVE_TO_RANDOM", agent, state, tileGrid, visionCheck);
    }

    case "LOOT": {
      return { action, targetX: agent.x, targetY: agent.y };
    }

    case "FLEE": {
      const enemy = findNearestEnemy(agent, state, visionCheck);
      if (enemy) {
        // Calculate flee target (opposite direction from enemy, extended)
        const fleeTargetX = agent.x + (agent.x - enemy.x);
        const fleeTargetY = agent.y + (agent.y - enemy.y);
        const step = moveOneStep(agent.x, agent.y, fleeTargetX, fleeTargetY, w, h, tileGrid);
        return { action, targetX: step.x, targetY: step.y };
      }
      // No enemy to flee from, move randomly but keep FLEE action
      const fallback = resolveActionTarget("MOVE_TO_RANDOM", agent, state, tileGrid, visionCheck);
      return { ...fallback, action };
    }

    case "HEAL": {
      // Check if agent actually has consumables to heal with
      const hasConsumable = agent.inventory.some((item) => {
        const def = ITEM_REGISTRY[item.itemId];
        return def && def.type === "consumable" && isConsumable(def.stats);
      });
      if (!hasConsumable) {
        // No consumables -- fall back to wandering instead of standing still
        return resolveActionTarget("MOVE_TO_RANDOM", agent, state, tileGrid, visionCheck);
      }
      return { action };
    }

    case "EXTRACT": {
      return { action, targetX: agent.x, targetY: agent.y };
    }

    case "USE_GRENADE": {
      const hasItem = agent.inventory.some((i) => i.itemId === "grenade" && i.quantity > 0);
      if (!hasItem) {
        return resolveActionTarget("ATTACK_NEAREST", agent, state, tileGrid, visionCheck);
      }
      const enemy = findNearestEnemy(agent, state, visionCheck);
      if (enemy) {
        return { action, targetX: enemy.x, targetY: enemy.y, targetSessionId: enemy.sessionId };
      }
      return resolveActionTarget("MOVE_TO_RANDOM", agent, state, tileGrid, visionCheck);
    }

    case "USE_SMOKE": {
      const hasItem = agent.inventory.some((i) => i.itemId === "smoke_grenade" && i.quantity > 0);
      if (!hasItem) {
        return resolveActionTarget("FLEE", agent, state, tileGrid, visionCheck);
      }
      return { action, targetX: agent.x, targetY: agent.y };
    }

    case "PLACE_TRAP": {
      const hasItem = agent.inventory.some((i) => i.itemId === "trap" && i.quantity > 0);
      if (!hasItem) {
        return resolveActionTarget("MOVE_TO_RANDOM", agent, state, tileGrid, visionCheck);
      }
      // Don't place on walls
      if (tileGrid && !tileGrid.isPassable(agent.x, agent.y)) {
        return resolveActionTarget("MOVE_TO_RANDOM", agent, state, tileGrid, visionCheck);
      }
      return { action, targetX: agent.x, targetY: agent.y };
    }

    case "ATTACK_NEAREST_ZOMBIE": {
      // Find nearest zombie
      let nearestZombie: { id: string; x: number; y: number } | null = null;
      let minZDist = Infinity;
      if (state.zombies) {
        state.zombies.forEach((zombie, id) => {
          if (zombie.state !== "alive") return;
          const d = manhattanDistance(agent.x, agent.y, zombie.x, zombie.y);
          if (d < minZDist) {
            minZDist = d;
            nearestZombie = { id, x: zombie.x, y: zombie.y };
          }
        });
      }
      if (nearestZombie) {
        const step = moveOneStep(agent.x, agent.y, nearestZombie.x, nearestZombie.y, w, h, tileGrid);
        return { action, targetSessionId: nearestZombie.id, targetX: step.x, targetY: step.y };
      }
      return resolveActionTarget("MOVE_TO_RANDOM", agent, state, tileGrid, visionCheck);
    }

    case "FOLLOW_PLAYER": {
      // Find owner player
      let owner: Agent | null = null;
      state.agents.forEach((other) => {
        if (other.sessionId === agent.allyOwnerId && other.state === "alive") {
          owner = other;
        }
      });
      if (owner) {
        const step = moveOneStep(agent.x, agent.y, (owner as Agent).x, (owner as Agent).y, w, h, tileGrid);
        return { action, targetX: step.x, targetY: step.y };
      }
      return { action: "HOLD_POSITION" };
    }

    case "HOLD_POSITION": {
      return { action };
    }

    default:
      return { action: "MOVE_TO_RANDOM", ...resolveActionTarget("MOVE_TO_RANDOM", agent, state, tileGrid, visionCheck) };
  }
}
