import type { Strategy } from "../types/strategy.js";

export interface StartGameRequest {
  stageIndex: number;
  strategy?: Strategy;
  strategyDescription?: string;
}

export interface GameResult {
  outcome: "stage_clear" | "stage_fail";
  finalTick: number;
  inventory: Array<{ itemId: string; itemType: string; quantity: number }>;
}

export interface GameEvent {
  tick: number;
  type: string;
  data: unknown;
}

export interface PlayerSnapshot {
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  state: string;
  currentAction: string;
  inventory: Array<{ itemId: string; itemType: string; quantity: number }>;
}

export type GameStatus = "starting" | "active" | "completed" | "failed" | "error";

export interface GameSessionInfo {
  gameId: string;
  status: GameStatus;
  stageId: number;
  currentTick: number;
  result?: GameResult;
  events: GameEvent[];
  playerState?: PlayerSnapshot;
  error?: string;
}
