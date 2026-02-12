import { ArraySchema } from "@colyseus/schema";
import { GAME } from "../config/game.constants.js";
import { MapObject, InventoryItem } from "../rooms/schema/RaidState.js";
import { generateRandomItems, generateFilteredItems } from "./LootSystem.js";
import { TileGrid, TerrainType } from "./TileGrid.js";

interface Coord {
  x: number;
  y: number;
}

function coordKey(x: number, y: number): string {
  return `${x},${y}`;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Terrain Generation ───

function bfsReachable(grid: TileGrid, startX: number, startY: number, goalX: number, goalY: number): boolean {
  const visited = new Set<string>();
  const queue: Coord[] = [{ x: startX, y: startY }];
  visited.add(coordKey(startX, startY));

  const dirs = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    if (x === goalX && y === goalY) return true;

    for (const { dx, dy } of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      const key = coordKey(nx, ny);
      if (
        nx >= 0 && nx < grid.width &&
        ny >= 0 && ny < grid.height &&
        !visited.has(key) &&
        grid.isPassable(nx, ny)
      ) {
        visited.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }

  return false;
}

function generateWallCluster(grid: TileGrid, reserved: Set<string>): void {
  const cfg = GAME.TERRAIN;
  const size = randomInt(cfg.WALL_CLUSTER_SIZE.min, cfg.WALL_CLUSTER_SIZE.max);
  const startX = randomInt(2, grid.width - 3);
  const startY = randomInt(2, grid.height - 3);

  const cells: Coord[] = [{ x: startX, y: startY }];
  const used = new Set<string>([coordKey(startX, startY)]);

  const dirs = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  while (cells.length < size) {
    const base = cells[randomInt(0, cells.length - 1)];
    const dir = dirs[randomInt(0, dirs.length - 1)];
    const nx = base.x + dir.dx;
    const ny = base.y + dir.dy;
    const key = coordKey(nx, ny);

    if (
      nx >= 1 && nx < grid.width - 1 &&
      ny >= 1 && ny < grid.height - 1 &&
      !used.has(key) &&
      !reserved.has(key)
    ) {
      cells.push({ x: nx, y: ny });
      used.add(key);
    }
  }

  for (const { x, y } of cells) {
    grid.set(x, y, TerrainType.WALL);
  }
}

function generateBushPatch(grid: TileGrid, reserved: Set<string>): void {
  const cfg = GAME.TERRAIN;
  const size = randomInt(cfg.BUSH_PATCH_SIZE.min, cfg.BUSH_PATCH_SIZE.max);
  const startX = randomInt(1, grid.width - 2);
  const startY = randomInt(1, grid.height - 2);

  const cells: Coord[] = [{ x: startX, y: startY }];
  const used = new Set<string>([coordKey(startX, startY)]);

  const dirs = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  while (cells.length < size) {
    const base = cells[randomInt(0, cells.length - 1)];
    const dir = dirs[randomInt(0, dirs.length - 1)];
    const nx = base.x + dir.dx;
    const ny = base.y + dir.dy;
    const key = coordKey(nx, ny);

    if (
      nx >= 0 && nx < grid.width &&
      ny >= 0 && ny < grid.height &&
      !used.has(key) &&
      !reserved.has(key) &&
      grid.get(nx, ny) === TerrainType.FLOOR
    ) {
      cells.push({ x: nx, y: ny });
      used.add(key);
    }
  }

  for (const { x, y } of cells) {
    if (grid.get(x, y) === TerrainType.FLOOR) {
      grid.set(x, y, TerrainType.BUSH);
    }
  }
}

export function generateTerrain(width: number, height: number): TileGrid {
  const cfg = GAME.TERRAIN;
  const reserved = new Set<string>();
  // Reserve corners for spawn safety
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      reserved.add(coordKey(i, j));
      reserved.add(coordKey(width - 1 - i, j));
      reserved.add(coordKey(i, height - 1 - j));
    }
  }

  let grid: TileGrid;
  let attempts = 0;

  do {
    grid = new TileGrid(width, height);

    // Wall clusters
    const wallCount = randomInt(cfg.WALL_CLUSTERS.min, cfg.WALL_CLUSTERS.max);
    for (let i = 0; i < wallCount; i++) {
      generateWallCluster(grid, reserved);
    }

    // Cover objects
    const coverCount = randomInt(cfg.COVER_COUNT.min, cfg.COVER_COUNT.max);
    let placed = 0;
    for (let attempt = 0; attempt < coverCount * 5 && placed < coverCount; attempt++) {
      const x = randomInt(1, width - 2);
      const y = randomInt(1, height - 2);
      const key = coordKey(x, y);
      if (!reserved.has(key) && grid.get(x, y) === TerrainType.FLOOR) {
        grid.set(x, y, TerrainType.COVER);
        placed++;
      }
    }

    // Bush patches
    const bushCount = randomInt(cfg.BUSH_PATCHES.min, cfg.BUSH_PATCHES.max);
    for (let i = 0; i < bushCount; i++) {
      generateBushPatch(grid, reserved);
    }

    attempts++;
  } while (
    !bfsReachable(grid, 0, 0, Math.floor(width / 2), Math.floor(height / 2)) &&
    attempts < 10
  );

  return grid;
}

// ─── Map Object Generation ───

export function generateLootBoxes(
  count: number,
  width: number,
  height: number,
  reserved: Set<string>,
): MapObject[] {
  const boxes: MapObject[] = [];
  const used = new Set(reserved);

  while (boxes.length < count) {
    const x = randomInt(0, width - 1);
    const y = randomInt(0, height - 1);
    const key = coordKey(x, y);

    if (used.has(key)) continue;
    used.add(key);

    const box = new MapObject();
    box.id = `loot_${boxes.length}`;
    box.objectType = "LOOT_BOX";
    box.x = x;
    box.y = y;

    const itemCount = randomInt(GAME.LOOT_PER_BOX.min, GAME.LOOT_PER_BOX.max);
    const items = generateRandomItems(itemCount);
    box.items = new ArraySchema<InventoryItem>(...items);

    boxes.push(box);
  }

  return boxes;
}

export function generateLootBoxesFiltered(
  count: number,
  width: number,
  height: number,
  reserved: Set<string>,
  lootPerBox: { min: number; max: number },
  allowedItems?: string[],
): MapObject[] {
  const boxes: MapObject[] = [];
  const used = new Set(reserved);

  while (boxes.length < count) {
    const x = randomInt(0, width - 1);
    const y = randomInt(0, height - 1);
    const key = coordKey(x, y);

    if (used.has(key)) continue;
    used.add(key);

    const box = new MapObject();
    box.id = `loot_${boxes.length}`;
    box.objectType = "LOOT_BOX";
    box.x = x;
    box.y = y;

    const itemCount = randomInt(lootPerBox.min, lootPerBox.max);
    const items = generateFilteredItems(itemCount, allowedItems);
    box.items = new ArraySchema<InventoryItem>(...items);

    boxes.push(box);
  }

  return boxes;
}

export function generateMap(): { objects: MapObject[]; terrain: TileGrid } {
  const terrain = generateTerrain(GAME.MAP_WIDTH, GAME.MAP_HEIGHT);
  const wallCoords = terrain.getWallCoords();

  const reserved = new Set<string>(wallCoords);

  const lootBoxes = generateLootBoxes(
    GAME.LOOT_BOX_COUNT,
    GAME.MAP_WIDTH,
    GAME.MAP_HEIGHT,
    reserved,
  );

  return { objects: lootBoxes, terrain };
}

export function spawnExtractionPoints(
  count: number,
  zoneCenter: { x: number; y: number },
  zoneRadius: number,
  tileGrid: TileGrid,
  existingExtractions: Array<{ x: number; y: number }>,
  minDistance: number,
): Array<{ x: number; y: number }> {
  const candidates: Array<{ x: number; y: number }> = [];

  for (let x = 0; x < tileGrid.width; x++) {
    for (let y = 0; y < tileGrid.height; y++) {
      // Must be inside zone (Chebyshev distance)
      const dx = Math.abs(x - zoneCenter.x);
      const dy = Math.abs(y - zoneCenter.y);
      if (Math.max(dx, dy) > zoneRadius) continue;

      // Must be passable
      if (!tileGrid.isPassable(x, y)) continue;

      // Must be far enough from zone center
      if (Math.max(dx, dy) < minDistance) continue;

      // Must be far enough from existing extraction points
      let tooClose = false;
      for (const ext of existingExtractions) {
        if (Math.abs(x - ext.x) + Math.abs(y - ext.y) < minDistance) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      candidates.push({ x, y });
    }
  }

  // Shuffle and pick
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  return candidates.slice(0, count);
}

export function getRandomSpawnCoord(
  width: number,
  height: number,
  occupied: Set<string>,
  terrain?: TileGrid,
): Coord {
  let x: number, y: number;
  do {
    x = randomInt(0, width - 1);
    y = randomInt(0, height - 1);
  } while (
    occupied.has(coordKey(x, y)) ||
    (terrain && !terrain.isPassable(x, y))
  );
  occupied.add(coordKey(x, y));
  return { x, y };
}
