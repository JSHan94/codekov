import { Application, Container, Sprite, Graphics, Text } from "pixi.js";
import { SpriteManager } from "./SpriteManager";
import { EffectsManager } from "./EffectsManager";
import { getVisibleTilesCircular, VISION_RADIUS } from "./VisionSystem";
import {
  MAP_WIDTH,
  MAP_HEIGHT,
  BG_COLOR,
  ZOOM_MIN,
  ZOOM_MAX,
  ISO_TILE_WIDTH,
  ISO_TILE_HEIGHT,
  LERP_TARGET_MS,
  RECONCILE_SNAP_TILES,
} from "./constants";
import { tileToScreen, screenToTile, getIsoBounds } from "./IsometricUtils";
import type { IsoTileType } from "./IsometricTileFactory";

interface AgentSprite {
  container: Container;
  sprite: Sprite;
  hpBar: Graphics;
  armorBar: Graphics;
  nameTag: Text;
  targetX: number;
  targetY: number;
  currentX: number;
  currentY: number;
}

interface ObjectSprite {
  sprite: Sprite;
  objectType: string;
  tileX: number;
  tileY: number;
}

export interface TileHoverInfo {
  tileX: number;
  tileY: number;
  terrainType: number; // 0=floor, 1=wall, 2=cover, 3=bush
  objectType: string | null;
  agentSessionId: string | null;
  zombieId: string | null;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const HALF_W = ISO_TILE_WIDTH / 2;
const HALF_H = ISO_TILE_HEIGHT / 2;

export class GameRenderer {
  private app: Application | null = null;
  private spriteManager = new SpriteManager();
  private effects = new EffectsManager();
  private mapContainer = new Container();
  private floorContainer = new Container();
  private terrainContainer = new Container();
  private objectContainer = new Container();
  private agentContainer = new Container();
  private zombieContainer = new Container();

  private fogContainer = new Container();
  private fogGraphics = new Graphics();
  private exploredTiles = new Set<string>();
  private mySessionId: string | null = null;
  private wallSet: Set<string> | null = null;
  private lastFogTileX = -1;
  private lastFogTileY = -1;
  private lastVisibleTiles: Set<string> | null = null;

  private agents = new Map<string, AgentSprite>();
  private objects = new Map<string, ObjectSprite>();
  private zombieSprites = new Map<string, AgentSprite>();
  private terrainData: string = "";

  // Configurable map dimensions (default to constants)
  private mapW = MAP_WIDTH;
  private mapH = MAP_HEIGHT;

  setMapDimensions(width: number, height: number): void {
    this.mapW = width;
    this.mapH = height;
  }

  private scale = 1;
  private minScale = ZOOM_MIN;
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  private mapOffset = { x: 0, y: 0 };

  // Camera follow
  private cameraFollowSpeed = 0.08;
  private cameraTargetX = 0;
  private cameraTargetY = 0;

  private tileHoverCallback: ((info: TileHoverInfo | null) => void) | null = null;

  private cleanupHandlers: (() => void)[] = [];

  setTileHoverCallback(cb: (info: TileHoverInfo | null) => void): void {
    this.tileHoverCallback = cb;
  }

  async init(canvas: HTMLElement): Promise<void> {
    this.app = new Application();

    const { clientWidth, clientHeight } = canvas;
    await this.app.init({
      background: BG_COLOR,
      width: clientWidth,
      height: clientHeight,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    // App may have been destroyed during async init (React StrictMode)
    if (!this.app) return;

    canvas.appendChild(this.app.canvas as HTMLCanvasElement);

    await this.spriteManager.load();
    if (!this.app) return;

    this.spriteManager.setApp(this.app);

    // Enable depth sorting on containers that need it
    this.terrainContainer.sortableChildren = true;
    this.objectContainer.sortableChildren = true;
    this.agentContainer.sortableChildren = true;

    // Build layer hierarchy: floor → terrain → FOG → objects → agents → effects
    this.mapContainer.addChild(this.floorContainer);
    this.mapContainer.addChild(this.terrainContainer);
    this.fogContainer.addChild(this.fogGraphics);
    this.mapContainer.addChild(this.fogContainer);
    this.mapContainer.addChild(this.objectContainer);
    this.zombieContainer.sortableChildren = true;
    this.mapContainer.addChild(this.zombieContainer);
    this.mapContainer.addChild(this.agentContainer);
    this.mapContainer.addChild(this.effects.container);
    this.app.stage.addChild(this.mapContainer);

    // Render isometric floor tiles
    this.renderFloor();

    // Calculate initial scale to fit viewport
    this.fitToViewport();

    // Set up zoom/pan
    this.setupInteraction(canvas);

    // Ticker for lerp animation (deltaMS-aware)
    this.app.ticker.add((ticker) => this.tick(ticker.deltaMS));
  }

  private renderFloor() {
    const g = new Graphics();

    // Draw each floor tile as a diamond
    for (let ty = 0; ty < this.mapH; ty++) {
      for (let tx = 0; tx < this.mapW; tx++) {
        const { screenX, screenY } = tileToScreen(tx, ty);
        // Diamond path
        g.moveTo(screenX, screenY - HALF_H);
        g.lineTo(screenX + HALF_W, screenY);
        g.lineTo(screenX, screenY + HALF_H);
        g.lineTo(screenX - HALF_W, screenY);
        g.closePath();
        g.fill(0x16162a);

        // Subtle grid outline
        g.moveTo(screenX, screenY - HALF_H);
        g.lineTo(screenX + HALF_W, screenY);
        g.lineTo(screenX, screenY + HALF_H);
        g.lineTo(screenX - HALF_W, screenY);
        g.closePath();
        g.stroke({ width: 0.5, color: 0x222244, alpha: 0.8 });
      }
    }

    this.floorContainer.addChild(g);
  }

  private spectatorMode = false;

  setPlayerSessionId(sessionId: string): void {
    this.mySessionId = sessionId;
  }

  setSpectatorMode(enabled: boolean): void {
    this.spectatorMode = enabled;
    if (enabled) {
      // Clear fog and show all entities
      this.fogGraphics.clear();
      this.agents.forEach((sprite) => { sprite.container.visible = true; });
      this.objects.forEach((obj) => { obj.sprite.visible = true; });
      // Allow full zoom out in spectator mode
      if (this.app) {
        const viewW = this.app.screen.width;
        const viewH = this.app.screen.height;
        const bounds = getIsoBounds(this.mapW, this.mapH);
        this.minScale = Math.min(viewW / bounds.width, viewH / bounds.height);
      }
    }
  }

  setTerrain(terrain: string): void {
    this.terrainData = terrain;
    this.renderTerrain();
    // Parse wall positions for vision system
    this.wallSet = new Set<string>();
    for (let i = 0; i < terrain.length; i++) {
      if (terrain[i] === "1") {
        this.wallSet.add(`${i % this.mapW},${Math.floor(i / this.mapW)}`);
      }
    }
  }

  private renderTerrain() {
    this.terrainContainer.removeChildren();

    if (!this.terrainData || this.terrainData.length !== this.mapW * this.mapH) return;

    for (let i = 0; i < this.terrainData.length; i++) {
      const type = parseInt(this.terrainData[i]);
      if (type === 0) continue; // FLOOR, skip

      const tx = i % this.mapW;
      const ty = Math.floor(i / this.mapW);

      let isoType: IsoTileType;
      switch (type) {
        case 1: isoType = "wall"; break;
        case 2: isoType = "cover"; break;
        case 3: isoType = "bush"; break;
        default: continue;
      }

      const tex = this.spriteManager.getIsoTileTexture(isoType);
      const sprite = new Sprite(tex);

      const { screenX, screenY } = tileToScreen(tx, ty);
      // Anchor the sprite so the diamond center aligns with screenX/screenY
      sprite.anchor.set(0.5, 1);
      sprite.x = screenX;
      // For wall/cover that have depth, the texture is taller; anchor at bottom of diamond
      if (isoType === "wall") {
        sprite.y = screenY + HALF_H;
      } else if (isoType === "cover") {
        sprite.y = screenY + HALF_H;
      } else {
        // bush, flat tiles
        sprite.y = screenY + HALF_H;
      }

      // Bush tiles are semi-transparent
      if (type === 3) {
        sprite.alpha = 0.7;
      }

      // Depth sorting: tiles further down-right drawn later
      sprite.zIndex = tx + ty;

      this.terrainContainer.addChild(sprite);
    }
  }

  private fitToViewport() {
    if (!this.app) return;

    const viewW = this.app.screen.width;
    const viewH = this.app.screen.height;

    // Show ~20 tiles radius — enough for immersion without revealing the whole map
    const visibleTilesRadius = 20;
    const visibleWorldW = visibleTilesRadius * 2 * (ISO_TILE_WIDTH / 2);
    const visibleWorldH = visibleTilesRadius * 2 * (ISO_TILE_HEIGHT / 2);

    const scaleX = viewW / visibleWorldW;
    const scaleY = viewH / visibleWorldH;
    this.scale = Math.min(scaleX, scaleY);
    this.minScale = this.scale; // can't zoom out further than this
    this.mapContainer.scale.set(this.scale);

    // Center on the map center initially
    const centerTile = tileToScreen(this.mapW / 2, this.mapH / 2);
    this.cameraTargetX = centerTile.screenX;
    this.cameraTargetY = centerTile.screenY;
    this.mapOffset.x = viewW / 2 - this.cameraTargetX * this.scale;
    this.mapOffset.y = viewH / 2 - this.cameraTargetY * this.scale;
    this.mapContainer.x = this.mapOffset.x;
    this.mapContainer.y = this.mapOffset.y;
  }

  private setupInteraction(canvas: HTMLElement) {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(
        this.minScale,
        Math.min(ZOOM_MAX, this.scale * zoomFactor)
      );

      // Zoom toward mouse position
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const worldX = (mouseX - this.mapContainer.x) / this.scale;
      const worldY = (mouseY - this.mapContainer.y) / this.scale;

      this.scale = newScale;
      this.mapContainer.scale.set(this.scale);

      this.mapContainer.x = mouseX - worldX * this.scale;
      this.mapContainer.y = mouseY - worldY * this.scale;
      this.mapOffset.x = this.mapContainer.x;
      this.mapOffset.y = this.mapContainer.y;
    };

    const onMouseDown = (e: MouseEvent) => {
      this.isDragging = true;
      this.dragStart.x = e.clientX - this.mapOffset.x;
      this.dragStart.y = e.clientY - this.mapOffset.y;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (this.isDragging) {
        this.mapOffset.x = e.clientX - this.dragStart.x;
        this.mapOffset.y = e.clientY - this.dragStart.y;
        this.mapContainer.x = this.mapOffset.x;
        this.mapContainer.y = this.mapOffset.y;
        return;
      }

      // Tile hover detection — isometric reverse transform
      if (this.tileHoverCallback) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const worldX = (mouseX - this.mapContainer.x) / this.scale;
        const worldY = (mouseY - this.mapContainer.y) / this.scale;

        const { tileX: rawTX, tileY: rawTY } = screenToTile(worldX, worldY);
        const tileX = Math.floor(rawTX);
        const tileY = Math.floor(rawTY);

        if (tileX < 0 || tileX >= this.mapW || tileY < 0 || tileY >= this.mapH) {
          this.tileHoverCallback(null);
          return;
        }

        // Terrain type
        let terrainType = 0;
        if (this.terrainData && this.terrainData.length === this.mapW * this.mapH) {
          terrainType = parseInt(this.terrainData[tileY * this.mapW + tileX]);
        }

        // Object at tile
        let objectType: string | null = null;
        this.objects.forEach((obj) => {
          if (obj.tileX === tileX && obj.tileY === tileY) {
            objectType = obj.objectType;
          }
        });

        // Agent at tile (use targetX/targetY)
        let agentSessionId: string | null = null;
        this.agents.forEach((agentSprite, sessionId) => {
          if (agentSprite.targetX === tileX && agentSprite.targetY === tileY) {
            agentSessionId = sessionId;
          }
        });

        // Zombie at tile
        let zombieId: string | null = null;
        this.zombieSprites.forEach((zombieSprite, zId) => {
          if (zombieSprite.targetX === tileX && zombieSprite.targetY === tileY) {
            zombieId = zId;
          }
        });

        this.tileHoverCallback({ tileX, tileY, terrainType, objectType, agentSessionId, zombieId });
      }
    };

    const onMouseUp = () => {
      this.isDragging = false;
    };

    const onMouseLeave = () => {
      this.isDragging = false;
      if (this.tileHoverCallback) {
        this.tileHoverCallback(null);
      }
    };

    const onResize = () => {
      if (this.app) {
        const { clientWidth, clientHeight } = canvas;
        this.app.renderer.resize(clientWidth, clientHeight);
        // Recalculate min scale but keep current camera position
        const visibleTilesRadius = 20;
        const visibleWorldW = visibleTilesRadius * 2 * (ISO_TILE_WIDTH / 2);
        const visibleWorldH = visibleTilesRadius * 2 * (ISO_TILE_HEIGHT / 2);
        const scaleX = clientWidth / visibleWorldW;
        const scaleY = clientHeight / visibleWorldH;
        this.minScale = Math.min(scaleX, scaleY);
        if (this.scale < this.minScale) {
          this.scale = this.minScale;
          this.mapContainer.scale.set(this.scale);
        }
      }
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("resize", onResize);

    this.cleanupHandlers.push(
      () => canvas.removeEventListener("wheel", onWheel),
      () => canvas.removeEventListener("mousedown", onMouseDown),
      () => canvas.removeEventListener("mousemove", onMouseMove),
      () => canvas.removeEventListener("mouseup", onMouseUp),
      () => canvas.removeEventListener("mouseleave", onMouseLeave),
      () => window.removeEventListener("resize", onResize)
    );
  }

  private tick(deltaMs: number) {
    const t = Math.min(1, deltaMs / LERP_TARGET_MS);

    // Lerp all agents toward their target positions with snap threshold
    this.agents.forEach((agentSprite) => {
      const dx = agentSprite.targetX - agentSprite.currentX;
      const dy = agentSprite.targetY - agentSprite.currentY;
      const dist = Math.hypot(dx, dy);
      if (dist >= RECONCILE_SNAP_TILES) {
        agentSprite.currentX = agentSprite.targetX;
        agentSprite.currentY = agentSprite.targetY;
      } else {
        agentSprite.currentX = lerp(agentSprite.currentX, agentSprite.targetX, t);
        agentSprite.currentY = lerp(agentSprite.currentY, agentSprite.targetY, t);
      }
      const { screenX, screenY } = tileToScreen(agentSprite.currentX, agentSprite.currentY);
      agentSprite.container.x = screenX;
      agentSprite.container.y = screenY;
      // Depth sorting
      agentSprite.container.zIndex = agentSprite.currentX + agentSprite.currentY;
    });

    // Lerp zombies
    this.zombieSprites.forEach((zombieSprite) => {
      const dx = zombieSprite.targetX - zombieSprite.currentX;
      const dy = zombieSprite.targetY - zombieSprite.currentY;
      const dist = Math.hypot(dx, dy);
      if (dist >= RECONCILE_SNAP_TILES) {
        zombieSprite.currentX = zombieSprite.targetX;
        zombieSprite.currentY = zombieSprite.targetY;
      } else {
        zombieSprite.currentX = lerp(zombieSprite.currentX, zombieSprite.targetX, t);
        zombieSprite.currentY = lerp(zombieSprite.currentY, zombieSprite.targetY, t);
      }
      const { screenX, screenY } = tileToScreen(zombieSprite.currentX, zombieSprite.currentY);
      zombieSprite.container.x = screenX;
      zombieSprite.container.y = screenY;
      zombieSprite.container.zIndex = zombieSprite.currentX + zombieSprite.currentY;
    });

    // Camera follow player
    this.updateCameraFollow();

    // Update fog of war
    this.updateFogOfWar();

    // Update effects
    this.effects.update(1);
  }

  private updateCameraFollow(): void {
    if (!this.app || this.isDragging || this.spectatorMode) return;

    // Follow the player agent
    const myAgent = this.mySessionId ? this.agents.get(this.mySessionId) : null;
    if (myAgent) {
      const { screenX, screenY } = tileToScreen(myAgent.currentX, myAgent.currentY);
      this.cameraTargetX = screenX;
      this.cameraTargetY = screenY;
    }

    const viewW = this.app.screen.width;
    const viewH = this.app.screen.height;

    const targetOffsetX = viewW / 2 - this.cameraTargetX * this.scale;
    const targetOffsetY = viewH / 2 - this.cameraTargetY * this.scale;

    this.mapOffset.x = lerp(this.mapOffset.x, targetOffsetX, this.cameraFollowSpeed);
    this.mapOffset.y = lerp(this.mapOffset.y, targetOffsetY, this.cameraFollowSpeed);
    this.mapContainer.x = this.mapOffset.x;
    this.mapContainer.y = this.mapOffset.y;
  }

  private updateFogOfWar(): void {
    if (this.spectatorMode) return;
    if (!this.wallSet || !this.mySessionId) return;
    const myAgent = this.agents.get(this.mySessionId);
    if (!myAgent) return;

    const px = Math.round(myAgent.targetX);
    const py = Math.round(myAgent.targetY);

    // Skip recalculation if player hasn't moved to a new tile
    if (px === this.lastFogTileX && py === this.lastFogTileY && this.lastVisibleTiles) {
      // Still filter entity visibility with cached tiles
      this.filterEntityVisibility(this.lastVisibleTiles);
      return;
    }
    this.lastFogTileX = px;
    this.lastFogTileY = py;

    const isWall = (x: number, y: number) => this.wallSet!.has(`${x},${y}`);
    const visibleTiles = getVisibleTilesCircular(px, py, VISION_RADIUS, this.mapW, this.mapH, isWall);
    this.lastVisibleTiles = visibleTiles;

    // Update explored tiles
    visibleTiles.forEach(t => this.exploredTiles.add(t));

    // Render fog as isometric diamonds
    this.fogGraphics.clear();
    for (let y = 0; y < this.mapH; y++) {
      for (let x = 0; x < this.mapW; x++) {
        const key = `${x},${y}`;
        if (visibleTiles.has(key)) continue; // In sight: no fog

        const { screenX, screenY } = tileToScreen(x, y);
        const alpha = this.exploredTiles.has(key) ? 0.6 : 0.95;

        this.fogGraphics.moveTo(screenX, screenY - HALF_H);
        this.fogGraphics.lineTo(screenX + HALF_W, screenY);
        this.fogGraphics.lineTo(screenX, screenY + HALF_H);
        this.fogGraphics.lineTo(screenX - HALF_W, screenY);
        this.fogGraphics.closePath();
        this.fogGraphics.fill({ color: 0x000000, alpha });
      }
    }

    // Entity visibility filtering
    this.filterEntityVisibility(visibleTiles);
  }

  private filterEntityVisibility(visibleTiles: Set<string>): void {
    this.agents.forEach((sprite, sid) => {
      if (sid === this.mySessionId) { sprite.container.visible = true; return; }
      const key = `${Math.round(sprite.targetX)},${Math.round(sprite.targetY)}`;
      sprite.container.visible = visibleTiles.has(key);
    });

    this.objects.forEach((obj) => {
      if (obj.objectType === "EXTRACTION") { obj.sprite.visible = true; return; }
      const key = `${obj.tileX},${obj.tileY}`;
      obj.sprite.visible = visibleTiles.has(key);
    });

    this.zombieSprites.forEach((zombie) => {
      const key = `${Math.round(zombie.targetX)},${Math.round(zombie.targetY)}`;
      zombie.container.visible = visibleTiles.has(key);
    });
  }

  addAgent(sessionId: string, x: number, y: number, agentIndex: number, avatarUrl?: string) {
    const container = new Container();
    const avatarSize = ISO_TILE_WIDTH * 0.7;

    // Start with seed-based default avatar; will be replaced if avatarUrl loads
    const initialTexture = this.spriteManager.generateDefaultAvatar(sessionId);

    const sprite = new Sprite(initialTexture);
    sprite.width = avatarSize;
    sprite.height = avatarSize;
    sprite.anchor.set(0.5, 0.5);
    sprite.y = -avatarSize * 0.3; // float above the diamond center
    container.addChild(sprite);

    // HP bar
    const hpBar = new Graphics();
    this.drawHpBar(hpBar, 1);
    hpBar.x = -ISO_TILE_WIDTH / 2;
    hpBar.y = -avatarSize - 2;
    container.addChild(hpBar);

    // Armor bar (below HP bar)
    const armorBar = new Graphics();
    armorBar.x = -ISO_TILE_WIDTH / 2;
    armorBar.y = -avatarSize + 2;
    container.addChild(armorBar);

    // Name tag
    const nameTag = new Text({
      text: sessionId.slice(0, 6),
      style: { fontSize: 7, fill: 0xffffff, fontFamily: "monospace" },
    });
    nameTag.anchor.set(0.5, 0);
    nameTag.y = avatarSize * 0.3;
    container.addChild(nameTag);

    const { screenX, screenY } = tileToScreen(x, y);
    container.x = screenX;
    container.y = screenY;
    container.zIndex = x + y;

    this.agentContainer.addChild(container);
    this.agents.set(sessionId, {
      container,
      sprite,
      hpBar,
      armorBar,
      nameTag,
      targetX: x,
      targetY: y,
      currentX: x,
      currentY: y,
    });

    // Async load avatar texture if URL provided
    if (avatarUrl) {
      this.spriteManager.loadAvatarTexture(avatarUrl).then((tex) => {
        const agentSprite = this.agents.get(sessionId);
        if (agentSprite && tex) {
          agentSprite.sprite.texture = tex;
          agentSprite.sprite.width = avatarSize;
          agentSprite.sprite.height = avatarSize;
        }
      });
    }
  }

  updateAgent(
    sessionId: string,
    x: number,
    y: number,
    hp: number,
    maxHp: number,
    state: string,
    armorDurability?: number,
  ) {
    const agentSprite = this.agents.get(sessionId);
    if (!agentSprite) return;

    agentSprite.targetX = x;
    agentSprite.targetY = y;

    // Update HP bar
    const hpRatio = maxHp > 0 ? hp / maxHp : 0;
    this.drawHpBar(agentSprite.hpBar, hpRatio);

    // Update armor bar
    if (armorDurability && armorDurability > 0) {
      this.drawArmorBar(agentSprite.armorBar, armorDurability);
    } else {
      agentSprite.armorBar.clear();
    }

    // Dim dead/extracted agents
    if (state === "dead") {
      agentSprite.sprite.alpha = 0.3;
      agentSprite.sprite.tint = 0xff0000;
    } else if (state === "extracted") {
      agentSprite.sprite.alpha = 0.3;
      agentSprite.sprite.tint = 0x00ff00;
    }
  }

  predictLocalMove(sessionId: string, dx: number, dy: number) {
    const agentSprite = this.agents.get(sessionId);
    if (!agentSprite) return;
    const tx = agentSprite.targetX + dx;
    const ty = agentSprite.targetY + dy;
    if (tx < 0 || tx >= this.mapW || ty < 0 || ty >= this.mapH) return;
    if (this.wallSet?.has(`${tx},${ty}`)) return;
    agentSprite.targetX = tx;
    agentSprite.targetY = ty;
    agentSprite.currentX = tx;
    agentSprite.currentY = ty;
    const { screenX, screenY } = tileToScreen(tx, ty);
    agentSprite.container.x = screenX;
    agentSprite.container.y = screenY;
    agentSprite.container.zIndex = tx + ty;
  }

  removeAgent(sessionId: string) {
    const agentSprite = this.agents.get(sessionId);
    if (!agentSprite) return;
    this.agentContainer.removeChild(agentSprite.container);
    agentSprite.container.destroy({ children: true });
    this.agents.delete(sessionId);
  }

  updateAgentAllyStatus(sessionId: string, allyStatus: string, allyCommand: string) {
    const agentSprite = this.agents.get(sessionId);
    if (!agentSprite) return;

    // Update name tag color based on ally status
    if (allyStatus === "ally") {
      agentSprite.nameTag.style.fill = 0x00ccff;
      const commandLabel = allyCommand === "follow" ? "F" : allyCommand === "hold" ? "H" : "A";
      agentSprite.nameTag.text = `${sessionId.slice(0, 4)}[${commandLabel}]`;
    } else if (allyStatus === "neutral") {
      agentSprite.nameTag.style.fill = 0xffcc00;
      agentSprite.nameTag.text = `${sessionId.slice(0, 4)}[?]`;
    }
  }

  addObject(id: string, objectType: string, x: number, y: number) {
    let isoType: IsoTileType;
    switch (objectType) {
      case "LOOT_BOX": isoType = "loot_box"; break;
      case "CORPSE": isoType = "corpse"; break;
      case "EXTRACTION": isoType = "extraction"; break;
      case "SMOKE": isoType = "smoke"; break;
      case "TRAP": isoType = "trap"; break;
      default: isoType = "loot_box";
    }

    const tex = this.spriteManager.getIsoTileTexture(isoType);
    const sprite = new Sprite(tex);
    sprite.anchor.set(0.5, 1);

    const { screenX, screenY } = tileToScreen(x, y);
    sprite.x = screenX;
    sprite.y = screenY + HALF_H;

    // Smoke is semi-transparent
    if (objectType === "SMOKE") {
      sprite.alpha = 0.5;
    }
    // Traps are subtle
    if (objectType === "TRAP") {
      sprite.alpha = 0.4;
    }

    sprite.zIndex = x + y;

    this.objectContainer.addChild(sprite);
    this.objects.set(id, { sprite, objectType, tileX: x, tileY: y });
  }

  removeObject(id: string) {
    const obj = this.objects.get(id);
    if (!obj) return;
    this.objectContainer.removeChild(obj.sprite);
    obj.sprite.destroy();
    this.objects.delete(id);
  }

  // ─── Zombie Rendering ───

  addZombie(id: string, x: number, y: number) {
    const container = new Container();
    const avatarSize = ISO_TILE_WIDTH * 0.6;

    // Simple colored sprite for zombies
    const sprite = new Sprite(this.spriteManager.generateDefaultAvatar(`zombie_${id}`));
    sprite.width = avatarSize;
    sprite.height = avatarSize;
    sprite.anchor.set(0.5, 0.5);
    sprite.y = -avatarSize * 0.3;
    sprite.tint = 0x44cc44; // green tint for zombies
    container.addChild(sprite);

    // HP bar
    const hpBar = new Graphics();
    this.drawHpBar(hpBar, 1);
    hpBar.x = -ISO_TILE_WIDTH / 2;
    hpBar.y = -avatarSize - 2;
    container.addChild(hpBar);

    // Name tag
    const nameTag = new Text({
      text: "Z",
      style: { fontSize: 6, fill: 0x44cc44, fontFamily: "monospace" },
    });
    nameTag.anchor.set(0.5, 0);
    nameTag.y = avatarSize * 0.3;
    container.addChild(nameTag);

    const armorBar = new Graphics();
    container.addChild(armorBar);

    const { screenX, screenY } = tileToScreen(x, y);
    container.x = screenX;
    container.y = screenY;
    container.zIndex = x + y;

    this.zombieContainer.addChild(container);
    this.zombieSprites.set(id, {
      container,
      sprite,
      hpBar,
      armorBar,
      nameTag,
      targetX: x,
      targetY: y,
      currentX: x,
      currentY: y,
    });
  }

  updateZombie(id: string, x: number, y: number, hp: number, maxHp: number, state: string) {
    const zombieSprite = this.zombieSprites.get(id);
    if (!zombieSprite) return;

    zombieSprite.targetX = x;
    zombieSprite.targetY = y;

    const hpRatio = maxHp > 0 ? hp / maxHp : 0;
    this.drawHpBar(zombieSprite.hpBar, hpRatio);

    if (state === "dead") {
      zombieSprite.sprite.alpha = 0.3;
      zombieSprite.sprite.tint = 0xff0000;
    }
  }

  removeZombie(id: string) {
    const zombieSprite = this.zombieSprites.get(id);
    if (!zombieSprite) return;
    this.zombieContainer.removeChild(zombieSprite.container);
    zombieSprite.container.destroy({ children: true });
    this.zombieSprites.delete(id);
  }

  // ─── Visual Effects API ───

  showAttackEffect(
    attackerX: number,
    attackerY: number,
    defenderX: number,
    defenderY: number,
    hit: boolean,
    damage: number,
    armorAbsorbed: number,
  ): void {
    this.effects.showBulletTrail(attackerX, attackerY, defenderX, defenderY, hit);
    if (hit) {
      this.effects.showDamageNumber(defenderX, defenderY, damage);
      if (armorAbsorbed > 0) {
        this.effects.showArmorAbsorb(defenderX, defenderY, armorAbsorbed);
      }
    } else {
      this.effects.showMiss(defenderX, defenderY);
    }
  }

  showDeathEffect(x: number, y: number): void {
    this.effects.showDeathExplosion(x, y);
  }

  showHealEffect(x: number, y: number, amount: number): void {
    this.effects.showHealEffect(x, y, amount);
  }

  showGrenadeEffect(x: number, y: number, radius: number): void {
    this.effects.showGrenadeExplosion(x, y, radius);
  }

  showDodgeEffect(x: number, y: number): void {
    this.effects.showDodgeEffect(x, y);
  }

  getTileAtScreenPos(clientX: number, clientY: number, canvasRect: DOMRect): TileHoverInfo | null {
    const mouseX = clientX - canvasRect.left;
    const mouseY = clientY - canvasRect.top;

    const worldX = (mouseX - this.mapContainer.x) / this.scale;
    const worldY = (mouseY - this.mapContainer.y) / this.scale;

    const { tileX: rawTX, tileY: rawTY } = screenToTile(worldX, worldY);
    const tileX = Math.floor(rawTX);
    const tileY = Math.floor(rawTY);

    if (tileX < 0 || tileX >= this.mapW || tileY < 0 || tileY >= this.mapH) {
      return null;
    }

    let terrainType = 0;
    if (this.terrainData && this.terrainData.length === this.mapW * this.mapH) {
      terrainType = parseInt(this.terrainData[tileY * this.mapW + tileX]);
    }

    let objectType: string | null = null;
    this.objects.forEach((obj) => {
      if (obj.tileX === tileX && obj.tileY === tileY) {
        objectType = obj.objectType;
      }
    });

    let agentSessionId: string | null = null;
    this.agents.forEach((agentSprite, sessionId) => {
      if (agentSprite.targetX === tileX && agentSprite.targetY === tileY) {
        agentSessionId = sessionId;
      }
    });

    let zombieId: string | null = null;
    this.zombieSprites.forEach((zombieSprite, zId) => {
      if (zombieSprite.targetX === tileX && zombieSprite.targetY === tileY) {
        zombieId = zId;
      }
    });

    return { tileX, tileY, terrainType, objectType, agentSessionId, zombieId };
  }

  private drawHpBar(g: Graphics, ratio: number) {
    g.clear();
    const barW = ISO_TILE_WIDTH;
    // Background
    g.rect(0, 0, barW, 3);
    g.fill(0x333333);
    // Foreground
    if (ratio > 0) {
      const color =
        ratio > 0.5 ? 0x00cc00 : ratio > 0.25 ? 0xcccc00 : 0xcc0000;
      g.rect(0, 0, barW * ratio, 3);
      g.fill(color);
    }
  }

  private drawArmorBar(g: Graphics, durability: number) {
    g.clear();
    const barW = ISO_TILE_WIDTH;
    // Simplified: show blue bar proportional to durability (max 100)
    const ratio = Math.min(1, durability / 100);
    g.rect(0, 0, barW * ratio, 2);
    g.fill(0x4488ff);
  }

  destroy() {
    // Clean up event listeners
    this.cleanupHandlers.forEach((fn) => fn());
    this.cleanupHandlers = [];

    // Clear tracking maps (let app.destroy handle the PixiJS objects)
    this.agents.clear();
    this.objects.clear();
    this.zombieSprites.clear();
    this.exploredTiles.clear();
    this.wallSet = null;

    // Destroy the app (may be partially initialized if cleanup runs during async init)
    if (this.app) {
      try {
        const app = this.app as any;
        if (typeof app._cancelResize !== "function") {
          app._cancelResize = () => {};
        }
        app.destroy({ removeView: true }, { children: true });
      } catch {
        // Application may not be fully initialized yet
      }
    }
    this.app = null;
  }
}
