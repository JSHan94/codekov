import { Assets, Texture, Rectangle, Graphics, RenderTexture, Application } from "pixi.js";
import { TILE_SIZE, TILEMAP_COLS, TILEMAP_PATH, TILES, ISO_TILE_WIDTH } from "./constants";
import { IsometricTileFactory, IsoTileType } from "./IsometricTileFactory";

// Deterministic color from a seed string
function seedColor(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  // HSL to RGB (s=70%, l=55%)
  const s = 0.7, l = 0.55;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255);
  return (toHex(r) << 16) | (toHex(g) << 8) | toHex(b);
}

export class SpriteManager {
  private textures = new Map<number, Texture>();
  private loaded = false;
  private avatarCache = new Map<string, Texture | null>();
  private defaultAvatarCache = new Map<string, Texture>();
  private app: Application | null = null;
  private isoFactory: IsometricTileFactory | null = null;

  setApp(app: Application) {
    this.app = app;
    this.isoFactory = new IsometricTileFactory(app);
  }

  async load(): Promise<void> {
    if (this.loaded) return;

    const texture = await Assets.load<Texture>(TILEMAP_PATH);
    texture.source.scaleMode = "nearest";

    // Pre-cut all tiles we need
    const indices = [
      TILES.FLOOR,
      ...TILES.CHARACTERS,
      TILES.LOOT_BOX,
      TILES.CORPSE,
      TILES.EXTRACTION,
      TILES.WALL,
      TILES.COVER,
      TILES.BUSH,
      TILES.SMOKE,
      TILES.TRAP,
    ];

    for (const index of indices) {
      const col = index % TILEMAP_COLS;
      const row = Math.floor(index / TILEMAP_COLS);
      const frame = new Rectangle(
        col * TILE_SIZE,
        row * TILE_SIZE,
        TILE_SIZE,
        TILE_SIZE
      );
      const tex = new Texture({ source: texture.source, frame });
      this.textures.set(index, tex);
    }

    this.loaded = true;
  }

  getTexture(index: number): Texture {
    const tex = this.textures.get(index);
    if (!tex) {
      throw new Error(`Texture for tile index ${index} not loaded`);
    }
    return tex;
  }

  /** Get a procedural isometric tile texture by semantic type. */
  getIsoTileTexture(type: IsoTileType): RenderTexture {
    if (!this.isoFactory) throw new Error("SpriteManager: app not set, call setApp() first");
    return this.isoFactory.get(type);
  }

  getCharacterTexture(agentIndex: number): Texture {
    const tileIndex = TILES.CHARACTERS[agentIndex % TILES.CHARACTERS.length];
    return this.getTexture(tileIndex);
  }

  async loadAvatarTexture(url: string): Promise<Texture | null> {
    // Check cache
    if (this.avatarCache.has(url)) {
      return this.avatarCache.get(url)!;
    }

    try {
      const texture = await Assets.load<Texture>(url);
      this.avatarCache.set(url, texture);
      return texture;
    } catch {
      // Network error, CORS, etc.
      this.avatarCache.set(url, null);
      return null;
    }
  }

  generateDefaultAvatar(seed: string): Texture {
    if (this.defaultAvatarCache.has(seed)) {
      return this.defaultAvatarCache.get(seed)!;
    }

    const size = ISO_TILE_WIDTH; // avatar sized to iso tile width
    const color = seedColor(seed);

    if (!this.app) {
      // Fallback: return first character texture if no app available
      return this.getCharacterTexture(0);
    }

    const g = new Graphics();
    // Filled circle
    g.circle(size / 2, size / 2, size / 2 - 1);
    g.fill(color);
    // Small inner highlight
    g.circle(size / 2 - 2, size / 2 - 2, size / 4);
    g.fill({ color: 0xffffff, alpha: 0.3 });

    const renderTexture = RenderTexture.create({ width: size, height: size });
    this.app.renderer.render({ container: g, target: renderTexture });
    g.destroy();

    this.defaultAvatarCache.set(seed, renderTexture);
    return renderTexture;
  }
}
