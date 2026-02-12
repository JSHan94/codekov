import { Container, Graphics, Text } from "pixi.js";
import { ISO_TILE_WIDTH, ISO_TILE_HEIGHT } from "./constants";
import { tileToScreen } from "./IsometricUtils";

interface Effect {
  container: Container;
  age: number;
  maxAge: number;
  update: (age: number, maxAge: number) => void;
}

export class EffectsManager {
  private effects: Effect[] = [];
  readonly container = new Container();

  showDamageNumber(x: number, y: number, damage: number): void {
    const text = new Text({
      text: `-${damage}`,
      style: { fontSize: 10, fill: 0xff8800, fontFamily: "monospace", fontWeight: "bold" },
    });
    const c = new Container();
    c.addChild(text);
    const { screenX, screenY } = tileToScreen(x, y);
    c.x = screenX;
    c.y = screenY - ISO_TILE_HEIGHT;
    text.anchor = { x: 0.5, y: 0.5 } as any;
    this.container.addChild(c);
    this.effects.push({
      container: c,
      age: 0,
      maxAge: 30,
      update(age, maxAge) {
        const t = age / maxAge;
        c.y -= 0.4;
        c.alpha = 1 - t;
      },
    });
  }

  showMiss(x: number, y: number): void {
    const text = new Text({
      text: "MISS",
      style: { fontSize: 8, fill: 0x888888, fontFamily: "monospace" },
    });
    const c = new Container();
    c.addChild(text);
    const { screenX, screenY } = tileToScreen(x, y);
    c.x = screenX;
    c.y = screenY - ISO_TILE_HEIGHT;
    text.anchor = { x: 0.5, y: 0.5 } as any;
    this.container.addChild(c);
    this.effects.push({
      container: c,
      age: 0,
      maxAge: 20,
      update(age, maxAge) {
        const t = age / maxAge;
        c.y -= 0.3;
        c.alpha = 1 - t;
      },
    });
  }

  showBulletTrail(fromX: number, fromY: number, toX: number, toY: number, hit: boolean): void {
    const g = new Graphics();
    const c = new Container();
    c.addChild(g);
    const from = tileToScreen(fromX, fromY);
    const to = tileToScreen(toX, toY);
    g.moveTo(from.screenX, from.screenY);
    g.lineTo(to.screenX, to.screenY);
    g.stroke({ width: 1, color: hit ? 0xff4444 : 0x888888, alpha: 0.8 });
    this.container.addChild(c);
    this.effects.push({
      container: c,
      age: 0,
      maxAge: 15,
      update(age, maxAge) {
        c.alpha = 1 - age / maxAge;
      },
    });
  }

  showDeathExplosion(x: number, y: number): void {
    const g = new Graphics();
    const c = new Container();
    c.addChild(g);
    const { screenX, screenY } = tileToScreen(x, y);
    this.container.addChild(c);
    this.effects.push({
      container: c,
      age: 0,
      maxAge: 25,
      update(age, maxAge) {
        g.clear();
        const t = age / maxAge;
        const radius = ISO_TILE_WIDTH * (0.3 + t * 0.8);
        g.circle(screenX, screenY, radius);
        g.fill({ color: 0xff2222, alpha: 0.6 * (1 - t) });
      },
    });
  }

  showHealEffect(x: number, y: number, amount: number): void {
    const text = new Text({
      text: `+${amount}`,
      style: { fontSize: 10, fill: 0x22cc22, fontFamily: "monospace", fontWeight: "bold" },
    });
    const c = new Container();
    c.addChild(text);
    const { screenX, screenY } = tileToScreen(x, y);
    c.x = screenX;
    c.y = screenY - ISO_TILE_HEIGHT;
    text.anchor = { x: 0.5, y: 0.5 } as any;
    this.container.addChild(c);
    this.effects.push({
      container: c,
      age: 0,
      maxAge: 25,
      update(age, maxAge) {
        const t = age / maxAge;
        c.y -= 0.35;
        c.alpha = 1 - t;
      },
    });
  }

  showArmorAbsorb(x: number, y: number, absorbed: number): void {
    const text = new Text({
      text: `[${absorbed}]`,
      style: { fontSize: 8, fill: 0x4488ff, fontFamily: "monospace" },
    });
    const c = new Container();
    c.addChild(text);
    const { screenX, screenY } = tileToScreen(x, y);
    c.x = screenX + ISO_TILE_WIDTH * 0.3;
    c.y = screenY - ISO_TILE_HEIGHT * 1.2;
    text.anchor = { x: 0.5, y: 0.5 } as any;
    this.container.addChild(c);
    this.effects.push({
      container: c,
      age: 0,
      maxAge: 20,
      update(age, maxAge) {
        const t = age / maxAge;
        c.y -= 0.3;
        c.alpha = 1 - t;
      },
    });
  }

  showDodgeEffect(x: number, y: number): void {
    const g = new Graphics();
    const c = new Container();
    c.addChild(g);
    const { screenX, screenY } = tileToScreen(x, y);
    this.container.addChild(c);
    this.effects.push({
      container: c,
      age: 0,
      maxAge: 20,
      update(age, maxAge) {
        g.clear();
        const t = age / maxAge;
        const radius = ISO_TILE_WIDTH * (0.2 + t * 0.5);
        g.circle(screenX, screenY, radius);
        g.fill({ color: 0x4488ff, alpha: 0.5 * (1 - t) });
      },
    });
  }

  showGrenadeExplosion(x: number, y: number, radius: number): void {
    const g = new Graphics();
    const c = new Container();
    c.addChild(g);
    const { screenX, screenY } = tileToScreen(x, y);
    const maxRadius = (radius + 1) * ISO_TILE_WIDTH * 0.5;
    this.container.addChild(c);
    this.effects.push({
      container: c,
      age: 0,
      maxAge: 30,
      update(age, maxAge) {
        g.clear();
        const t = age / maxAge;
        const r = maxRadius * Math.min(1, t * 3);
        g.circle(screenX, screenY, r);
        g.fill({ color: 0xff6600, alpha: 0.5 * (1 - t) });
      },
    });
  }

  update(delta: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      effect.age += delta;
      effect.update(effect.age, effect.maxAge);
      if (effect.age >= effect.maxAge) {
        this.container.removeChild(effect.container);
        effect.container.destroy({ children: true });
        this.effects.splice(i, 1);
      }
    }
  }

  destroy(): void {
    for (const effect of this.effects) {
      effect.container.destroy({ children: true });
    }
    this.effects = [];
    this.container.destroy({ children: true });
  }
}
