import { Application, Graphics, RenderTexture } from "pixi.js";
import { ISO_TILE_WIDTH, ISO_TILE_HEIGHT, ISO_TILE_DEPTH } from "./constants";

const W = ISO_TILE_WIDTH;
const H = ISO_TILE_HEIGHT;
const D = ISO_TILE_DEPTH;
const HW = W / 2;
const HH = H / 2;

export type IsoTileType =
  | "floor"
  | "wall"
  | "cover"
  | "bush"
  | "loot_box"
  | "corpse"
  | "extraction"
  | "smoke"
  | "trap";

/**
 * Generates procedural isometric tile textures using Pixi.js Graphics,
 * cached as RenderTextures for fast reuse.  Designed so real sprite
 * assets can replace these later by swapping the returned textures.
 */
export class IsometricTileFactory {
  private cache = new Map<string, RenderTexture>();
  private app: Application;

  constructor(app: Application) {
    this.app = app;
  }

  get(type: IsoTileType): RenderTexture {
    const cached = this.cache.get(type);
    if (cached) return cached;

    const tex = this.create(type);
    this.cache.set(type, tex);
    return tex;
  }

  private create(type: IsoTileType): RenderTexture {
    switch (type) {
      case "floor": return this.makeFloor();
      case "wall": return this.makeWall();
      case "cover": return this.makeCover();
      case "bush": return this.makeBush();
      case "loot_box": return this.makeLootBox();
      case "corpse": return this.makeCorpse();
      case "extraction": return this.makeExtraction();
      case "smoke": return this.makeSmoke();
      case "trap": return this.makeTrap();
    }
  }

  // ── Helpers ──

  /** Draw the standard diamond (top face) path at a given vertical offset. */
  private drawDiamond(g: Graphics, offsetY: number = 0) {
    g.moveTo(HW, offsetY);
    g.lineTo(W, HH + offsetY);
    g.lineTo(HW, H + offsetY);
    g.lineTo(0, HH + offsetY);
    g.closePath();
  }

  private render(g: Graphics, w: number, h: number): RenderTexture {
    const rt = RenderTexture.create({ width: w, height: h });
    this.app.renderer.render({ container: g, target: rt });
    g.destroy();
    return rt;
  }

  // ── Tile Generators ──

  private makeFloor(): RenderTexture {
    const g = new Graphics();
    // Base diamond
    this.drawDiamond(g);
    g.fill(0x16213e);
    // Subtle grid outline
    this.drawDiamond(g);
    g.stroke({ width: 0.5, color: 0x222244, alpha: 0.8 });
    return this.render(g, W, H);
  }

  private makeWall(): RenderTexture {
    const totalH = H + D;
    const g = new Graphics();

    // Top face (lightest)
    this.drawDiamond(g);
    g.fill(0x4a4a6a);

    // Left face
    g.moveTo(0, HH);
    g.lineTo(HW, H);
    g.lineTo(HW, H + D);
    g.lineTo(0, HH + D);
    g.closePath();
    g.fill(0x2a2a4a);

    // Right face
    g.moveTo(W, HH);
    g.lineTo(HW, H);
    g.lineTo(HW, H + D);
    g.lineTo(W, HH + D);
    g.closePath();
    g.fill(0x383858);

    return this.render(g, W, totalH);
  }

  private makeCover(): RenderTexture {
    const coverD = Math.floor(D * 0.5);
    const totalH = H + coverD;
    const g = new Graphics();

    // Top face
    this.drawDiamond(g);
    g.fill(0x3a5a3a);

    // Left face
    g.moveTo(0, HH);
    g.lineTo(HW, H);
    g.lineTo(HW, H + coverD);
    g.lineTo(0, HH + coverD);
    g.closePath();
    g.fill(0x2a4a2a);

    // Right face
    g.moveTo(W, HH);
    g.lineTo(HW, H);
    g.lineTo(HW, H + coverD);
    g.lineTo(W, HH + coverD);
    g.closePath();
    g.fill(0x305030);

    return this.render(g, W, totalH);
  }

  private makeBush(): RenderTexture {
    const totalH = H + 6;
    const g = new Graphics();

    // Floor diamond underneath
    this.drawDiamond(g);
    g.fill(0x16213e);

    // Leafy circle on top
    g.circle(HW, HH, HW * 0.6);
    g.fill({ color: 0x2d5a2d, alpha: 0.75 });

    // Lighter highlight
    g.circle(HW - 2, HH - 2, HW * 0.3);
    g.fill({ color: 0x4a8a4a, alpha: 0.4 });

    return this.render(g, W, totalH);
  }

  private makeLootBox(): RenderTexture {
    const boxD = Math.floor(D * 0.4);
    const totalH = H + boxD;
    const inset = 6;
    const g = new Graphics();

    // Floor diamond
    this.drawDiamond(g);
    g.fill(0x16213e);

    // Small box – top
    g.moveTo(HW, inset);
    g.lineTo(W - inset, HH);
    g.lineTo(HW, H - inset);
    g.lineTo(inset, HH);
    g.closePath();
    g.fill(0xc8a84e);

    // Small box – left face
    g.moveTo(inset, HH);
    g.lineTo(HW, H - inset);
    g.lineTo(HW, H - inset + boxD);
    g.lineTo(inset, HH + boxD);
    g.closePath();
    g.fill(0x8a6a2e);

    // Small box – right face
    g.moveTo(W - inset, HH);
    g.lineTo(HW, H - inset);
    g.lineTo(HW, H - inset + boxD);
    g.lineTo(W - inset, HH + boxD);
    g.closePath();
    g.fill(0xa07a3e);

    return this.render(g, W, totalH);
  }

  private makeCorpse(): RenderTexture {
    const g = new Graphics();
    // Dim floor
    this.drawDiamond(g);
    g.fill(0x16213e);
    // Dark red marker
    g.ellipse(HW, HH, HW * 0.5, HH * 0.5);
    g.fill({ color: 0x8b0000, alpha: 0.7 });
    return this.render(g, W, H);
  }

  private makeExtraction(): RenderTexture {
    const g = new Graphics();
    // Glowing diamond – bright yellow-green
    this.drawDiamond(g);
    g.fill({ color: 0x44cc44, alpha: 0.6 });
    this.drawDiamond(g);
    g.stroke({ width: 1.5, color: 0xffee44, alpha: 0.9 });
    // Inner glow
    g.ellipse(HW, HH, HW * 0.4, HH * 0.4);
    g.fill({ color: 0xffffaa, alpha: 0.4 });
    return this.render(g, W, H);
  }

  private makeSmoke(): RenderTexture {
    const g = new Graphics();
    // Floor
    this.drawDiamond(g);
    g.fill(0x16213e);
    // Semi-transparent ellipse
    g.ellipse(HW, HH, HW * 0.7, HH * 0.7);
    g.fill({ color: 0x888899, alpha: 0.45 });
    return this.render(g, W, H);
  }

  private makeTrap(): RenderTexture {
    const g = new Graphics();
    // Floor
    this.drawDiamond(g);
    g.fill(0x16213e);
    // Subtle X mark
    const pad = 8;
    g.moveTo(pad, HH);
    g.lineTo(W - pad, HH);
    g.stroke({ width: 0.5, color: 0xcc4444, alpha: 0.35 });
    g.moveTo(HW, pad);
    g.lineTo(HW, H - pad);
    g.stroke({ width: 0.5, color: 0xcc4444, alpha: 0.35 });
    return this.render(g, W, H);
  }

  destroy(): void {
    this.cache.forEach((tex) => tex.destroy(true));
    this.cache.clear();
  }
}
