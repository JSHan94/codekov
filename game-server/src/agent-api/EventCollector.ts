import type { GameEvent, GameResult } from "./types.js";

const MAX_EVENTS = 200;

export class EventCollector {
  private events: GameEvent[] = [];
  private _result: GameResult | null = null;

  push(type: string, tick: number, data: unknown): void {
    this.events.push({ tick, type, data });
    if (this.events.length > MAX_EVENTS) {
      this.events.shift();
    }
  }

  setResult(result: GameResult): void {
    this._result = result;
  }

  get result(): GameResult | null {
    return this._result;
  }

  getEvents(): GameEvent[] {
    return this.events;
  }

  getEventsSince(sinceTick: number): GameEvent[] {
    return this.events.filter((e) => e.tick > sinceTick);
  }
}
