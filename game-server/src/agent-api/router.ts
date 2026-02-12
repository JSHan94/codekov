import { createEndpoint } from "colyseus";
import type { Express, Request, Response } from "express";
import { HeadlessGameManager } from "./HeadlessGameManager.js";
import { validateApiKey } from "./apiKeyAuth.js";
import { generateStrategyFromText } from "../ai/strategyGenerator.js";
import { SOLO_STAGES } from "../config/solo.stages.js";
import { StrategySchema, ConditionSubject, Operator, Action } from "../types/strategy.js";
import type { StartGameRequest } from "./types.js";

let manager: HeadlessGameManager | null = null;

function getManager(port: number): HeadlessGameManager {
  if (!manager) {
    manager = new HeadlessGameManager(port);
  }
  return manager;
}

function validateApiKeyFromReq(req: Request): boolean {
  const headers = new Headers();
  if (req.headers.authorization) headers.set("authorization", req.headers.authorization);
  return validateApiKey({ headers });
}

/**
 * Routes registered via Colyseus createEndpoint (POST + parameterless GET).
 * NOTE: Colyseus's router doesn't match GET routes with query params due to a
 * rou3 bug (req.url includes query string, findRoute doesn't strip it).
 * GET routes needing query params are registered via Express in registerExpressAgentRoutes.
 */
export function createAgentRoutes(port: number) {
  return {
    // ── Stage list (GET, no query params) ──
    api_agent_stages: createEndpoint("/api/agent/stages", { method: "GET" }, async () => {
      return {
        stages: SOLO_STAGES.map((s, index) => ({
          index,
          id: s.id,
          name: s.name,
          briefing: s.briefing,
          winCondition: s.winCondition,
          botCount: s.bots.length,
          mapSize: `${s.mapWidth}x${s.mapHeight}`,
          maxTicks: s.maxTicks,
        })),
      };
    }),

    // ── Start headless game (POST) ──
    api_agent_games: createEndpoint("/api/agent/games", { method: "POST" }, async (ctx) => {
      if (!validateApiKey(ctx)) return { error: "Unauthorized" };

      const body = ctx.body as Partial<StartGameRequest> | undefined;
      if (!body || typeof body.stageIndex !== "number") {
        return { error: "Missing stageIndex (number)" };
      }

      if (body.strategy) {
        const parsed = StrategySchema.safeParse(body.strategy);
        if (!parsed.success) {
          return { error: "Invalid strategy object", details: parsed.error.issues };
        }
      }

      const mgr = getManager(port);
      const result = await mgr.startGame({
        stageIndex: body.stageIndex,
        strategy: body.strategy,
        strategyDescription: body.strategyDescription,
      });

      if (result.error) {
        return { error: result.error };
      }

      return { gameId: result.gameId, status: "starting" };
    }),

    // ── Update strategy mid-game (POST) ──
    api_agent_game_strategy: createEndpoint("/api/agent/game-strategy", { method: "POST" }, async (ctx) => {
      if (!validateApiKey(ctx)) return { error: "Unauthorized" };

      const gameId = (ctx as any).query?.gameId as string | undefined;
      if (!gameId) return { error: "Missing gameId query parameter" };

      const body = ctx.body as { strategy?: unknown; strategyDescription?: string } | undefined;
      if (!body) return { error: "Missing request body" };

      let strategy: import("../types/strategy.js").Strategy | undefined;
      if (body.strategy) {
        const parsed = StrategySchema.safeParse(body.strategy);
        if (!parsed.success) {
          return { error: "Invalid strategy", details: parsed.error.issues };
        }
        strategy = parsed.data;
      }

      const mgr = getManager(port);
      return await mgr.updateStrategy(gameId, strategy, body.strategyDescription);
    }),

    // ── Generate strategy without starting a game (POST) ──
    api_agent_generate_strategy: createEndpoint("/api/agent/generate-strategy", { method: "POST" }, async (ctx) => {
      if (!validateApiKey(ctx)) return { error: "Unauthorized" };

      const body = ctx.body as { description?: string } | undefined;
      if (!body?.description || typeof body.description !== "string") {
        return { error: "Missing description (string)" };
      }
      if (body.description.length > 500) {
        return { error: "Description too long (max 500 chars)" };
      }

      try {
        const strategy = await generateStrategyFromText(body.description);
        return { strategy };
      } catch (err) {
        console.error("[AgentAPI] Strategy generation error:", err);
        return { error: "Strategy generation failed" };
      }
    }),

    // ── Strategy schema documentation (GET, no query params) ──
    api_agent_strategy_schema: createEndpoint("/api/agent/strategy-schema", { method: "GET" }, async () => {
      return {
        schema: {
          name: "string (1-64 chars)",
          rules: [{
            priority: "number (0 = highest priority)",
            conditions: [{
              subject: "ConditionSubject",
              operator: "Operator",
              value: "number",
            }],
            action: "Action",
          }],
          fallbackAction: "Action (executed when no rules match)",
        },
        conditionSubjects: ConditionSubject.options.map((s) => {
          const descriptions: Record<string, string> = {
            hp_percent: "Current HP percentage (0-100)",
            nearby_enemy_count: "Number of visible enemies",
            nearest_enemy_distance: "Manhattan distance to nearest enemy (9999 if none)",
            nearby_loot_count: "Number of visible loot sources",
            nearest_loot_distance: "Manhattan distance to nearest loot (9999 if none)",
            inventory_count: "Total items in inventory",
            distance_to_extract: "Manhattan distance to nearest extraction point",
            tick: "Current game tick",
            has_cover: "1 if adjacent to cover tile, 0 otherwise",
            has_armor: "1 if wearing armor, 0 otherwise",
            armor_durability: "Remaining armor durability",
            has_grenade: "Grenade count in inventory",
            has_smoke: "Smoke grenade count in inventory",
            has_trap: "Trap count in inventory",
            extraction_available: "1 if extraction points exist, 0 otherwise",
          };
          return { subject: s, description: descriptions[s] ?? s };
        }),
        operators: Operator.options.map((o) => {
          const descriptions: Record<string, string> = {
            lt: "Less than",
            lte: "Less than or equal",
            gt: "Greater than",
            gte: "Greater than or equal",
            eq: "Equal to",
          };
          return { operator: o, description: descriptions[o] ?? o };
        }),
        actions: Action.options.map((a) => {
          const descriptions: Record<string, string> = {
            MOVE_TO_NEAREST_LOOT: "Move toward closest loot box or corpse",
            MOVE_TO_EXTRACT: "Move toward nearest extraction point",
            MOVE_TO_RANDOM: "Wander randomly with waypoints",
            ATTACK_NEAREST: "Move toward and attack closest enemy",
            LOOT: "Pick up items at current position",
            FLEE: "Run away from nearest enemy",
            HEAL: "Use consumable to restore HP",
            EXTRACT: "Extract at extraction point",
            USE_GRENADE: "Throw grenade at nearest enemy",
            USE_SMOKE: "Deploy smoke at current position",
            PLACE_TRAP: "Place trap at current position",
          };
          return { action: a, description: descriptions[a] ?? a };
        }),
      };
    }),
  };
}

/**
 * GET routes that need query params must be registered via Express
 * because Colyseus's bindRouterToTransport passes req.url (with query string)
 * to rou3's findRoute, which doesn't strip query params.
 */
export function registerExpressAgentRoutes(app: Express, port: number): void {
  // ── Game status polling ──
  app.get("/api/agent/game-status", (req: Request, res: Response) => {
    if (!validateApiKeyFromReq(req)) { res.json({ error: "Unauthorized" }); return; }

    const gameId = req.query.gameId as string | undefined;
    if (!gameId) { res.json({ error: "Missing gameId query parameter" }); return; }

    const mgr = getManager(port);
    const info = mgr.getGameStatus(gameId);
    if (!info) { res.json({ error: "Game not found" }); return; }

    res.json(info);
  });

  // ── World context snapshot ──
  app.get("/api/agent/game-context", (req: Request, res: Response) => {
    if (!validateApiKeyFromReq(req)) { res.json({ error: "Unauthorized" }); return; }

    const gameId = req.query.gameId as string | undefined;
    if (!gameId) { res.json({ error: "Missing gameId query parameter" }); return; }

    const mgr = getManager(port);
    const context = mgr.getWorldContext(gameId);
    if (context === null) { res.json({ error: "Game not found or no context available yet" }); return; }

    res.json({ gameId, worldContext: context });
  });
}
