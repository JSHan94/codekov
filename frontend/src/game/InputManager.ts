import type { GameClient } from "./GameClient";
import type { GameRenderer } from "./GameRenderer";

const FLUSH_INTERVAL_MS = 50;

export class InputManager {
  private client: GameClient;
  private renderer: GameRenderer;
  private container: HTMLElement;

  // Key state tracking
  private keysDown = new Set<string>();
  private lastMoveDir: { dx: number; dy: number } = { dx: 0, dy: 1 };

  // Pending actions (priority: dodge > attack > loot > move)
  private pendingDodge = false;
  private pendingLoot = false;
  private pendingAttackTarget: string | null = null;
  private pendingAttackZombie: string | null = null;
  private pendingRecruit = false;
  private pendingAllyCommand: string | null = null;

  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private enabled = false;

  // Handlers stored for cleanup
  private onKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private onKeyUp: ((e: KeyboardEvent) => void) | null = null;
  private onClick: ((e: MouseEvent) => void) | null = null;

  constructor(client: GameClient, renderer: GameRenderer, container: HTMLElement) {
    this.client = client;
    this.renderer = renderer;
    this.container = container;
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;

    this.onKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;

      const key = e.key.toLowerCase();
      this.keysDown.add(key);

      // Track movement direction
      const dir = this.getMoveDirFromKeys();
      if (dir.dx !== 0 || dir.dy !== 0) {
        this.lastMoveDir = dir;
      }

      // One-shot actions
      if (key === "f") {
        e.preventDefault();
        this.pendingLoot = true;
      }
      if (key === " ") {
        e.preventDefault();
        this.pendingDodge = true;
      }
      if (key === "e") {
        e.preventDefault();
        this.pendingRecruit = true;
      }
      if (key === "1") {
        e.preventDefault();
        this.pendingAllyCommand = "follow";
      }
      if (key === "2") {
        e.preventDefault();
        this.pendingAllyCommand = "hold";
      }
      if (key === "3") {
        e.preventDefault();
        this.pendingAllyCommand = "attack";
      }
    };

    this.onKeyUp = (e: KeyboardEvent) => {
      this.keysDown.delete(e.key.toLowerCase());
    };

    this.onClick = (e: MouseEvent) => {
      // Only process left click
      if (e.button !== 0) return;

      const rect = this.container.getBoundingClientRect();
      const tileInfo = this.renderer.getTileAtScreenPos(e.clientX, e.clientY, rect);
      if (!tileInfo) return;

      // Check for zombie at the clicked tile (priority over agents)
      if (tileInfo.zombieId) {
        this.pendingAttackZombie = tileInfo.zombieId;
        return;
      }

      // Check for enemy agent at the clicked tile
      if (tileInfo.agentSessionId) {
        const myId = this.client.getMySessionId();
        if (myId && tileInfo.agentSessionId !== myId) {
          this.pendingAttackTarget = tileInfo.agentSessionId;
        }
      }
    };

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.container.addEventListener("click", this.onClick);

    // Flush interval: send latest input to server
    this.flushInterval = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;

    if (this.onKeyDown) window.removeEventListener("keydown", this.onKeyDown);
    if (this.onKeyUp) window.removeEventListener("keyup", this.onKeyUp);
    if (this.onClick) this.container.removeEventListener("click", this.onClick);

    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    this.keysDown.clear();
  }

  destroy(): void {
    this.disable();
  }

  private getMoveDirFromKeys(): { dx: number; dy: number } {
    let dx = 0;
    let dy = 0;

    if (this.keysDown.has("w") || this.keysDown.has("arrowup")) dy = -1;
    if (this.keysDown.has("s") || this.keysDown.has("arrowdown")) dy = 1;
    if (this.keysDown.has("a") || this.keysDown.has("arrowleft")) dx = -1;
    if (this.keysDown.has("d") || this.keysDown.has("arrowright")) dx = 1;

    return { dx, dy };
  }

  private flush(): void {
    // Priority: dodge > attack > loot > move

    if (this.pendingDodge) {
      this.pendingDodge = false;
      const { dx, dy } = this.lastMoveDir;
      if (dx !== 0 || dy !== 0) {
        this.client.sendPlayerDodge(dx, dy);
      }
      return;
    }

    if (this.pendingAttackZombie) {
      const zombieId = this.pendingAttackZombie;
      this.pendingAttackZombie = null;
      this.client.sendPlayerAttackZombie(zombieId);
      return;
    }

    if (this.pendingAttackTarget) {
      const target = this.pendingAttackTarget;
      this.pendingAttackTarget = null;
      this.client.sendPlayerAttack(target);
      return;
    }

    if (this.pendingLoot) {
      this.pendingLoot = false;
      this.client.sendPlayerLoot();
      return;
    }

    if (this.pendingRecruit) {
      this.pendingRecruit = false;
      this.client.sendInitiateRecruitment();
      return;
    }

    if (this.pendingAllyCommand) {
      const cmd = this.pendingAllyCommand;
      this.pendingAllyCommand = null;
      this.client.sendAllyCommand(cmd);
      return;
    }

    // Continuous movement while keys held
    const dir = this.getMoveDirFromKeys();
    if (dir.dx !== 0 || dir.dy !== 0) {
      this.client.sendPlayerMove(dir.dx, dir.dy);
    }
  }
}
