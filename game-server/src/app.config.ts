import {
    defineServer,
    defineRoom,
    monitor,
    playground,
    createRouter,
    createEndpoint,
} from "colyseus";

/**
 * Import your Room files
 */
import { RaidRoom } from "./rooms/RaidRoom.js";
import { GAME } from "./config/game.constants.js";
import { ITEM_REGISTRY } from "./types/items.js";
import {
    verifySupabaseJwt,
    getPlayerProfile,
    getPlayerInventory,
    toggleEquip,
    sellItem,
    buyItem,
} from "./db/supabase.js";
import { generateStrategyFromText } from "./ai/strategyGenerator.js";
import { createAgentRoutes, registerExpressAgentRoutes } from "./agent-api/router.js";

const PORT = parseInt(process.env.PORT ?? "2567", 10);

const DEV_MODE = process.env.DEV_MODE === "true";
const DEV_PLAYER_ID = "00000000-0000-0000-0000-000000000001";

function getPlayerId(ctx: { headers: Headers }): string | null {
    if (DEV_MODE) return DEV_PLAYER_ID;
    const auth = ctx.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return null;
    try {
        const payload = verifySupabaseJwt(auth.slice(7));
        return payload.sub;
    } catch {
        return null;
    }
}

const server = defineServer({
    /**
     * Define your room handlers:
     */
    rooms: {
        raid: defineRoom(RaidRoom),
        solo_raid: defineRoom(RaidRoom),
    },

    /**
     * Experimental: Define API routes. Built-in integration with the "playground" and SDK.
     * 
     * Usage from SDK: 
     *   client.http.get("/api/hello").then((response) => {})
     * 
     */
    routes: createRouter({
        ...createAgentRoutes(PORT),
        api_hello: createEndpoint("/api/hello", { method: "GET", }, async (ctx) => {
            return { message: "Hello World" }
        }),
        api_game_config: createEndpoint("/api/game-config", { method: "GET" }, async (ctx) => {
            return {
                map: {
                    width: GAME.MAP_WIDTH,
                    height: GAME.MAP_HEIGHT,
                    extraction: GAME.EXTRACTION,
                },
                rules: {
                    tickMs: GAME.TICK_MS,
                    maxPlayers: GAME.MAX_PLAYERS,
                    lootBoxCount: GAME.LOOT_BOX_COUNT,
                    detectionRange: GAME.DETECTION_RANGE,
                    defaultHp: GAME.DEFAULT_HP,
                    lootPerBox: GAME.LOOT_PER_BOX,
                },
                combat: {
                    unarmed: GAME.UNARMED,
                    hitChance: GAME.HIT_CHANCE,
                    damageVariance: GAME.DAMAGE_VARIANCE,
                },
                items: ITEM_REGISTRY,
            };
        }),

        // ── Profile ──
        api_profile: createEndpoint("/api/profile", { method: "GET" }, async (ctx) => {
            const playerId = getPlayerId(ctx);
            if (!playerId) return { error: "Unauthorized" };
            if (DEV_MODE && !process.env.SUPABASE_URL) {
                return { id: playerId, username: "Dev Player", gold: 1000 };
            }
            const profile = await getPlayerProfile(playerId);
            if (!profile) return { error: "Player not found" };
            return profile;
        }),

        // ── Inventory ──
        api_inventory: createEndpoint("/api/inventory", { method: "GET" }, async (ctx) => {
            const playerId = getPlayerId(ctx);
            if (!playerId) return { error: "Unauthorized" };
            if (DEV_MODE && !process.env.SUPABASE_URL) {
                return { items: [] };
            }
            const items = await getPlayerInventory(playerId);
            return { items };
        }),

        api_inventory_equip: createEndpoint("/api/inventory/equip", { method: "POST" }, async (ctx) => {
            const playerId = getPlayerId(ctx);
            if (!playerId) return { error: "Unauthorized" };
            if (DEV_MODE && !process.env.SUPABASE_URL) {
                return { success: true };
            }
            const body = ctx.body as { loadoutId?: string; equipped?: boolean } | undefined;
            if (!body?.loadoutId || typeof body.equipped !== "boolean") {
                return { error: "Missing loadoutId or equipped" };
            }
            const ok = await toggleEquip(playerId, body.loadoutId, body.equipped);
            return ok ? { success: true } : { error: "Failed" };
        }),

        // ── Shop ──
        api_shop_buy: createEndpoint("/api/shop/buy", { method: "POST" }, async (ctx) => {
            const playerId = getPlayerId(ctx);
            if (!playerId) return { error: "Unauthorized" };
            if (DEV_MODE && !process.env.SUPABASE_URL) {
                return { success: true, gold: 1000 };
            }
            const body = ctx.body as { itemId?: string } | undefined;
            if (!body?.itemId) return { error: "Missing itemId" };
            return await buyItem(playerId, body.itemId);
        }),

        api_shop_sell: createEndpoint("/api/shop/sell", { method: "POST" }, async (ctx) => {
            const playerId = getPlayerId(ctx);
            if (!playerId) return { error: "Unauthorized" };
            if (DEV_MODE && !process.env.SUPABASE_URL) {
                return { success: true, gold: 1000 };
            }
            const body = ctx.body as { loadoutId?: string } | undefined;
            if (!body?.loadoutId) return { error: "Missing loadoutId" };
            return await sellItem(playerId, body.loadoutId);
        }),

        // ── AI Strategy Generation ──
        api_ai_generate_strategy: createEndpoint("/api/ai/generate-strategy", { method: "POST" }, async (ctx) => {
            const playerId = getPlayerId(ctx);
            if (!playerId) return { error: "Unauthorized" };
            const body = ctx.body as { description?: string } | undefined;
            if (!body?.description || typeof body.description !== "string") {
                return { error: "Missing description" };
            }
            if (body.description.length > 500) {
                return { error: "Description too long (max 500 chars)" };
            }
            try {
                const strategy = await generateStrategyFromText(body.description);
                return { strategy };
            } catch (err) {
                console.error("[AI] Strategy generation error:", err);
                return { error: "Strategy generation failed" };
            }
        }),
    }),

    /**
     * Bind your custom express routes here:
     * Read more: https://expressjs.com/en/starter/basic-routing.html
     */
    express: (app) => {
        // Agent API GET routes (require query params, can't use createEndpoint due to rou3 bug)
        registerExpressAgentRoutes(app, PORT);

        app.get("/hi", (req, res) => {
            res.send("It's time to kick ass and chew bubblegum!");
        });

        /**
         * Use @colyseus/monitor
         * It is recommended to protect this route with a password
         * Read more: https://docs.colyseus.io/tools/monitoring/#restrict-access-to-the-panel-using-a-password
         */
        app.use("/monitor", monitor());

        /**
         * Use @colyseus/playground
         * (It is not recommended to expose this route in a production environment)
         */
        if (process.env.NODE_ENV !== "production") {
            app.use("/", playground());
        }
    }

});

export default server;