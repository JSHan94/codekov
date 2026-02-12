import { ISO_TILE_WIDTH, ISO_TILE_HEIGHT } from "./constants";

const HALF_W = ISO_TILE_WIDTH / 2;
const HALF_H = ISO_TILE_HEIGHT / 2;

/** Convert tile (grid) coordinates to isometric screen coordinates. */
export function tileToScreen(tileX: number, tileY: number): { screenX: number; screenY: number } {
  return {
    screenX: (tileX - tileY) * HALF_W,
    screenY: (tileX + tileY) * HALF_H,
  };
}

/** Inverse: convert isometric screen coordinates back to tile coordinates. */
export function screenToTile(screenX: number, screenY: number): { tileX: number; tileY: number } {
  const tileX = (screenX / HALF_W + screenY / HALF_H) / 2;
  const tileY = (screenY / HALF_H - screenX / HALF_W) / 2;
  return { tileX, tileY };
}

/** Depth-sort index: tiles with larger (tileX + tileY) are drawn later (in front). */
export function getDepthIndex(tileX: number, tileY: number): number {
  return tileX + tileY;
}

/**
 * Compute the bounding box (in screen pixels) of the full isometric map.
 * The map is a diamond rotated 45 deg; its corners are the four map edges.
 */
export function getIsoBounds(mapW: number, mapH: number): {
  minX: number; minY: number; width: number; height: number;
} {
  // Four corner tiles → screen coords
  const topLeft = tileToScreen(0, 0);                  // top vertex
  const topRight = tileToScreen(mapW - 1, 0);          // right vertex
  const bottomLeft = tileToScreen(0, mapH - 1);        // left vertex
  const bottomRight = tileToScreen(mapW - 1, mapH - 1); // bottom vertex

  const minX = bottomLeft.screenX - HALF_W;
  const maxX = topRight.screenX + HALF_W;
  const minY = topLeft.screenY - HALF_H;
  const maxY = bottomRight.screenY + HALF_H;

  return { minX, minY, width: maxX - minX, height: maxY - minY };
}
