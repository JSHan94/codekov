export const VISION_RADIUS = 8;

/** Bresenham LoS: returns false if wall blocks the path; target itself being wall is OK */
export function hasLineOfSight(
  fromX: number, fromY: number,
  toX: number, toY: number,
  isWall: (x: number, y: number) => boolean,
): boolean {
  let x = fromX, y = fromY;
  const dx = Math.abs(toX - fromX), dy = Math.abs(toY - fromY);
  const sx = fromX < toX ? 1 : -1, sy = fromY < toY ? 1 : -1;
  let err = dx - dy;

  while (true) {
    if (x === toX && y === toY) return true;
    if (x !== fromX || y !== fromY) {
      if (isWall(x, y)) return false;
    }
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

/**
 * Server: Chebyshev distance (square) + Bresenham LoS.
 * Used for game logic — simple tile-count check with no sqrt.
 */
export function canSee(
  fromX: number, fromY: number,
  toX: number, toY: number,
  radius: number,
  isWall: (x: number, y: number) => boolean,
): boolean {
  if (Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY)) > radius) return false;
  return hasLineOfSight(fromX, fromY, toX, toY, isWall);
}

/**
 * Client: Euclidean distance (circular) + Bresenham LoS.
 * Used for fog rendering — circular vision UX.
 */
export function getVisibleTilesCircular(
  cx: number, cy: number, radius: number,
  mapW: number, mapH: number,
  isWall: (x: number, y: number) => boolean,
): Set<string> {
  const visible = new Set<string>();
  const r2 = radius * radius;
  const minX = Math.max(0, cx - radius);
  const maxX = Math.min(mapW - 1, cx + radius);
  const minY = Math.max(0, cy - radius);
  const maxY = Math.min(mapH - 1, cy + radius);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r2) {
        if (hasLineOfSight(cx, cy, x, y, isWall)) {
          visible.add(`${x},${y}`);
        }
      }
    }
  }
  return visible;
}
