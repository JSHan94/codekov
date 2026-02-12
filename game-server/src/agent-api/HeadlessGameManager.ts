import { Client, type Room } from "@colyseus/sdk";
import { EventCollector } from "./EventCollector.js";
import type {
  StartGameRequest,
  GameSessionInfo,
  GameResult,
  PlayerSnapshot,
  GameStatus,
} from "./types.js";
import type { Strategy } from "../types/strategy.js";
import type { WorldContext } from "../game/AgentBrain.js";
import { generateStrategyFromText } from "../ai/strategyGenerator.js";
import { SOLO_STAGES } from "../config/solo.stages.js";

const MAX_CONCURRENT_GAMES = 10;
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

const LISTEN_EVENTS = [
  "ATTACK_EVENT",
  "DEATH_EVENT",
  "LOOT_EVENT",
  "HEAL_EVENT",
  "EXTRACT_EVENT",
  "GRENADE_EVENT",
  "TRAP_TRIGGER_EVENT",
  "SMOKE_EVENT",
  "HINT",
  "WIN_CONDITION_PROGRESS",
  "STAGE_CLEAR",
  "STAGE_FAIL",
  "WORLD_CONTEXT_UPDATE",
] as const;

interface GameSession {
  gameId: string;
  room: Room | null;
  status: GameStatus;
  stageIndex: number;
  stageId: number;
  collector: EventCollector;
  strategy: Strategy | null;
  playerState: PlayerSnapshot | null;
  latestWorldContext: WorldContext | null;
  currentTick: number;
  createdAt: number;
  error?: string;
}

let idCounter = 0;

function generateGameId(): string {
  return `game_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;
}

export class HeadlessGameManager {
  private sessions = new Map<string, GameSession>();
  private port: number;
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(port: number) {
    this.port = port;
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), 60_000);
  }

  async startGame(request: StartGameRequest): Promise<{ gameId: string; error?: string }> {
    if (this.sessions.size >= MAX_CONCURRENT_GAMES) {
      return { gameId: "", error: "Too many concurrent games. Try again later." };
    }

    const { stageIndex } = request;
    if (stageIndex < 0 || stageIndex >= SOLO_STAGES.length) {
      return { gameId: "", error: `Invalid stageIndex. Must be 0-${SOLO_STAGES.length - 1}.` };
    }

    const gameId = generateGameId();
    const stageConfig = SOLO_STAGES[stageIndex];

    const session: GameSession = {
      gameId,
      room: null,
      status: "starting",
      stageIndex,
      stageId: stageConfig.id,
      collector: new EventCollector(),
      strategy: request.strategy ?? null,
      playerState: null,
      latestWorldContext: null,
      currentTick: 0,
      createdAt: Date.now(),
    };

    this.sessions.set(gameId, session);

    // Run connection asynchronously — return gameId immediately
    this.connectAndPlay(session, request).catch((err) => {
      console.error(`[HeadlessGameManager] Game ${gameId} failed:`, err);
      session.status = "error";
      session.error = String(err);
    });

    return { gameId };
  }

  getGameStatus(gameId: string): GameSessionInfo | null {
    const session = this.sessions.get(gameId);
    if (!session) return null;

    return {
      gameId: session.gameId,
      status: session.status,
      stageId: session.stageId,
      currentTick: session.currentTick,
      result: session.collector.result ?? undefined,
      events: session.collector.getEvents(),
      playerState: session.playerState ?? undefined,
      error: session.error,
    };
  }

  async updateStrategy(
    gameId: string,
    strategy?: Strategy,
    strategyDescription?: string,
  ): Promise<{ success: boolean; strategyName?: string; error?: string }> {
    const session = this.sessions.get(gameId);
    if (!session) return { success: false, error: "Game not found" };
    if (session.status !== "active") return { success: false, error: "Game is not active" };
    if (!session.room) return { success: false, error: "Room not connected" };

    let newStrategy: Strategy;
    if (strategy) {
      newStrategy = strategy;
    } else if (strategyDescription) {
      newStrategy = await generateStrategyFromText(strategyDescription);
    } else {
      return { success: false, error: "Provide strategy or strategyDescription" };
    }

    session.room.send("UPDATE_STRATEGY", { strategy: newStrategy });
    session.strategy = newStrategy;
    return { success: true, strategyName: newStrategy.name };
  }

  getWorldContext(gameId: string): WorldContext | null {
    const session = this.sessions.get(gameId);
    if (!session) return null;
    return session.latestWorldContext;
  }

  // ─── Private ───

  private async connectAndPlay(session: GameSession, request: StartGameRequest): Promise<void> {
    // Resolve strategy
    let strategy: Strategy;
    if (request.strategy) {
      strategy = request.strategy;
    } else if (request.strategyDescription) {
      strategy = await generateStrategyFromText(request.strategyDescription);
    } else {
      strategy = await generateStrategyFromText("balanced play: loot items, fight enemies, heal when low");
    }
    session.strategy = strategy;

    // Self-connect via Colyseus SDK
    const client = new Client(`ws://127.0.0.1:${this.port}`);
    const room = await client.joinOrCreate("solo_raid", {
      stageIndex: request.stageIndex,
      strategy,
    });

    session.room = room;
    session.status = "active";

    // Attach event listeners (mirrors SoloGameClient pattern)
    for (const eventType of LISTEN_EVENTS) {
      room.onMessage(eventType, (data: unknown) => {
        this.handleRoomMessage(session, eventType, data);
      });
    }

    room.onStateChange((state: any) => {
      if (state.tick !== undefined) {
        session.currentTick = state.tick;
      }

      // Find player agent in state and snapshot it
      if (state.agents) {
        const playerEntry = this.findPlayerAgent(state, room.sessionId);
        if (playerEntry) {
          session.playerState = {
            hp: playerEntry.hp,
            maxHp: playerEntry.maxHp,
            x: playerEntry.x,
            y: playerEntry.y,
            state: playerEntry.state,
            currentAction: playerEntry.currentAction,
            inventory: Array.from(playerEntry.inventory ?? []).map((i: any) => ({
              itemId: i.itemId,
              itemType: i.itemType,
              quantity: i.quantity,
            })),
          };
        }
      }
    });

    room.onLeave((code: number) => {
      if (session.status === "active" || session.status === "starting") {
        // If no result was recorded, mark as failed
        if (!session.collector.result) {
          session.status = "failed";
        }
      }
    });

    room.onError((code: number, message?: string) => {
      console.error(`[HeadlessGameManager] Room error for ${session.gameId}: ${code} ${message}`);
      session.status = "error";
      session.error = message ?? `Room error code ${code}`;
    });
  }

  private handleRoomMessage(session: GameSession, type: string, data: unknown): void {
    const tick = (data as any)?.tick ?? session.currentTick;
    session.collector.push(type, tick, data);

    if (type === "STAGE_CLEAR") {
      const d = data as any;
      session.collector.setResult({
        outcome: "stage_clear",
        finalTick: d.tick ?? session.currentTick,
        inventory: d.inventory ?? [],
      });
      session.status = "completed";
    } else if (type === "STAGE_FAIL") {
      const d = data as any;
      session.collector.setResult({
        outcome: "stage_fail",
        finalTick: d.tick ?? session.currentTick,
        inventory: [],
      });
      session.status = "failed";
    } else if (type === "WORLD_CONTEXT_UPDATE") {
      // Store latest world context for the player
      const d = data as any;
      if (d && session.room && d.agentSessionId === session.room.sessionId) {
        const { agentSessionId, ...ctx } = d;
        session.latestWorldContext = ctx as WorldContext;
      }
    }
  }

  private findPlayerAgent(state: any, sessionId: string): any | null {
    if (!state.agents) return null;
    // Colyseus MapSchema iteration
    if (typeof state.agents.get === "function") {
      return state.agents.get(sessionId) ?? null;
    }
    // Fallback: iterate entries
    if (typeof state.agents.forEach === "function") {
      let found: any = null;
      state.agents.forEach((agent: any, key: string) => {
        if (key === sessionId) found = agent;
      });
      return found;
    }
    return null;
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [gameId, session] of this.sessions) {
      if (now - session.createdAt > SESSION_TTL_MS) {
        if (session.room) {
          try {
            session.room.leave();
          } catch { /* ignore */ }
        }
        this.sessions.delete(gameId);
      }
    }
  }

  dispose(): void {
    clearInterval(this.cleanupTimer);
    for (const [, session] of this.sessions) {
      if (session.room) {
        try {
          session.room.leave();
        } catch { /* ignore */ }
      }
    }
    this.sessions.clear();
  }
}
