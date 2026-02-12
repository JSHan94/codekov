import { Room, Client, CloseCode } from "colyseus";
import { ArraySchema } from "@colyseus/schema";
import {
  RaidState,
  Agent,
  MapObject,
  InventoryItem,
} from "./schema/RaidState.js";
import { GAME } from "../config/game.constants.js";
import { StrategySchema, type Strategy } from "../types/strategy.js";
import {
  OverrideCommandSchema,
  UpdateStrategySchema,
  PlayerMoveSchema,
  PlayerLootSchema,
  PlayerAttackSchema,
  PlayerDodgeSchema,
  PlayerAttackZombieSchema,
} from "../types/messages.js";
import type {
  RaidResult,
  AttackEvent,
  DeathEvent,
  LootEvent,
  HealEvent,
  ExtractEvent,
  GrenadeEvent,
  TrapTriggerEvent,
  SmokeEvent,
  DodgeEvent,
} from "../types/messages.js";
import { ITEM_REGISTRY, isConsumable, isUtility, type UtilityStats } from "../types/items.js";
import { generateMap, getRandomSpawnCoord, generateLootBoxesFiltered } from "../game/MapGenerator.js";
import { generateTerrain } from "../game/MapGenerator.js";
import { transferItems, transferAllItems } from "../game/LootSystem.js";
import { resolveAttack } from "../game/CombatResolver.js";
import { decide, buildWorldContext, resolveActionTarget, type ActionResult, type WorldContext } from "../game/AgentBrain.js";
import { resolveManualAction } from "../game/ManualControl.js";
import { createBotAgent, resetBotIdCounter } from "../game/BotAgent.js";
import { SOLO_STAGES, type BotSpawnConfig, type StageConfig } from "../config/solo.stages.js";
import { canSee, VISION_RADIUS } from "../game/VisionSystem.js";
import { autoEquipArmor, applyArmorDamageReduction } from "../game/EquipmentSystem.js";
import { TileGrid } from "../game/TileGrid.js";
import { shouldReplan } from "../ai/replanTrigger.js";
import { cognitiveReplan } from "../ai/cognitiveReplanner.js";
import { buildStateSnapshot, buildPerception, serializePerception, summarizeEventLog, type EventLogEntry } from "../ai/snapshotBuilder.js";
import { MemoryManager } from "../ai/memoryManager.js";
import type { MemoryEntry } from "../ai/cognitiveTypes.js";
import {
  verifySupabaseJwt,
  loadPlayerLoadout,
  saveRaidResult,
  deletePlayerEquipment,
  saveLootToLoadout,
} from "../db/supabase.js";
import { ZombieManager, type ZombieManagerConfig } from "../game/ZombieManager.js";
import { zombieDecide, type ZombieAction } from "../game/ZombieBrain.js";
import { allyDecide } from "../game/AllyManager.js";
import { RecruitmentSystem } from "../game/RecruitmentSystem.js";
import { resolveZombieAttack, resolveAttackOnZombie } from "../game/CombatResolver.js";
import { neutralDecide } from "../game/NeutralBehavior.js";
import { Zombie } from "./schema/RaidState.js";
import { getRandomPersonality } from "../types/personality.js";
import type { ZombieAttackEvent, ZombieDeathEvent } from "../types/zombie-messages.js";
import {
  InitiateRecruitmentSchema,
  RecruitmentChoiceSchema,
  DismissRecruitmentSchema,
} from "../types/recruitment-messages.js";
import type { RecruitmentDialogueEvent, RecruitmentResultEvent } from "../types/recruitment-messages.js";
import { buildRecruitmentSystemPrompt, buildRecruitmentUserPrompt } from "../ai/recruitmentPrompts.js";
import { PERSONALITIES, type PersonalityType } from "../types/personality.js";

const DEV_MODE = process.env.DEV_MODE === "true";

const ALLOWED_AVATAR_HOSTS = new Set([
  "lh3.googleusercontent.com",
  "pbs.twimg.com",
  "abs.twimg.com",
]);

function isValidAvatarUrl(url: string): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ALLOWED_AVATAR_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export class RaidRoom extends Room<{ state: RaidState }> {
  maxClients: number = GAME.MAX_PLAYERS;
  state = new RaidState();

  private occupiedSpawns = new Set<string>();
  private clientsBySession = new Map<string, Client>();
  private tileGrid: TileGrid;
  private smokeCounter = 0;
  private trapCounter = 0;
  private extractionCounter = 0;
  private eventLog: EventLogEntry[] = [];
  private memoryManager = new MemoryManager();
  private visionCheck: (fx: number, fy: number, tx: number, ty: number) => boolean = () => true;
  private zombieManager: ZombieManager;
  private recruitmentSystem = new RecruitmentSystem();
  private isPaused = false;
  private stageConfig: StageConfig | null = null;
  private zombiesEnabled = true;

  private sendInputAck(sessionId: string, seq: number) {
    const client = this.clientsBySession.get(sessionId);
    if (client) {
      client.send("INPUT_ACK", { seq, tick: this.state.tick });
    }
  }

  private enqueueManualInput(
    agent: Agent,
    manual: { type: string; dx?: number; dy?: number; targetSessionId?: string; seq?: number; ts?: number },
  ) {
    const seq = manual.seq ?? ++agent.manualSeqCounter;
    if (seq <= agent.manualLastAckSeq) return; // stale

    const normalized = { ...manual, seq, ts: manual.ts };
    agent.manualSeqCounter = Math.max(agent.manualSeqCounter, seq);

    if (manual.type === "MOVE") {
      const dx = manual.dx ?? 0;
      const dy = manual.dy ?? 0;
      agent.manualLatestMove = { type: "MOVE", dx, dy, seq, ts: manual.ts };
      return;
    }

    // Push one-shot actions; keep queue sorted and size-bounded
    agent.manualActionQueue.push(normalized);
    agent.manualActionQueue.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    const MAX_MANUAL_QUEUE = 8; // ~1s at 120ms tick (user choice: 6-8 frames)
    if (agent.manualActionQueue.length > MAX_MANUAL_QUEUE) {
      agent.manualActionQueue.splice(0, agent.manualActionQueue.length - MAX_MANUAL_QUEUE);
    }
  }

  private consumeManualInput(agent: Agent) {
    // Prioritize queued one-shot events
    if (agent.manualActionQueue.length > 0) {
      const next = agent.manualActionQueue.shift()!;
      if (typeof next.seq === "number") {
        agent.manualLastAckSeq = Math.max(agent.manualLastAckSeq, next.seq);
        this.sendInputAck(agent.sessionId, agent.manualLastAckSeq);
      }
      return next;
    }

    const move = agent.manualLatestMove;
    if (move && move.seq > agent.manualLastAckSeq) {
      agent.manualLastAckSeq = move.seq;
      this.sendInputAck(agent.sessionId, agent.manualLastAckSeq);
      return move;
    }

    return null;
  }

  onAuth(_client: Client, options: Record<string, unknown>) {
    if (DEV_MODE) {
      return { sub: `dev-player-${_client.sessionId}` };
    }
    const token = options.accessToken;
    if (typeof token !== "string") {
      throw new Error("Missing accessToken");
    }
    return verifySupabaseJwt(token);
  }

  messages = {
    OVERRIDE_COMMAND: (client: Client, message: unknown) => {
      const parsed = OverrideCommandSchema.safeParse(message);
      if (!parsed.success) return;

      const agent = this.state.agents.get(client.sessionId);
      if (!agent || agent.state !== "alive") return;

      agent.pendingCommand = parsed.data.action;
    },

    UPDATE_STRATEGY: (client: Client, message: unknown) => {
      const parsed = UpdateStrategySchema.safeParse(message);
      if (!parsed.success) return;

      const agent = this.state.agents.get(client.sessionId);
      if (!agent || agent.state !== "alive") return;

      agent.strategy = parsed.data.strategy;
    },

    ACTIVATE_MANUAL: (client: Client) => {
      const agent = this.state.agents.get(client.sessionId);
      if (!agent) return;
      agent.manualControlActive = true;
      agent.pendingManualAction = null;
      agent.manualLatestMove = null;
      agent.manualActionQueue = [];
    },

    PLAYER_MOVE: (client: Client, message: unknown) => {
      const parsed = PlayerMoveSchema.safeParse(message);
      if (!parsed.success) return;
      const agent = this.state.agents.get(client.sessionId);
      if (!agent || agent.state !== "alive") return;
      agent.manualControlActive = true;
      this.enqueueManualInput(agent, {
        type: "MOVE",
        dx: parsed.data.dx,
        dy: parsed.data.dy,
        seq: parsed.data.seq,
        ts: parsed.data.ts,
      });
    },

    PLAYER_LOOT: (client: Client, message: unknown) => {
      const parsed = PlayerLootSchema.safeParse(message);
      if (!parsed.success) return;
      const agent = this.state.agents.get(client.sessionId);
      if (!agent || agent.state !== "alive") return;
      agent.manualControlActive = true;
      this.enqueueManualInput(agent, {
        type: "LOOT",
        seq: parsed.data.seq,
        ts: parsed.data.ts,
      });
    },

    PLAYER_ATTACK: (client: Client, message: unknown) => {
      const parsed = PlayerAttackSchema.safeParse(message);
      if (!parsed.success) return;
      const agent = this.state.agents.get(client.sessionId);
      if (!agent || agent.state !== "alive") return;
      agent.manualControlActive = true;
      this.enqueueManualInput(agent, {
        type: "ATTACK",
        targetSessionId: parsed.data.targetSessionId,
        seq: parsed.data.seq,
        ts: parsed.data.ts,
      });
    },

    PLAYER_DODGE: (client: Client, message: unknown) => {
      const parsed = PlayerDodgeSchema.safeParse(message);
      if (!parsed.success) return;
      const agent = this.state.agents.get(client.sessionId);
      if (!agent || agent.state !== "alive") return;
      if (this.state.tick < agent.dodgeCooldownUntilTick) return;
      agent.manualControlActive = true;
      this.enqueueManualInput(agent, {
        type: "DODGE",
        dx: parsed.data.dx,
        dy: parsed.data.dy,
        seq: parsed.data.seq,
        ts: parsed.data.ts,
      });
    },

    PLAYER_ATTACK_ZOMBIE: (client: Client, message: unknown) => {
      const parsed = PlayerAttackZombieSchema.safeParse(message);
      if (!parsed.success) return;
      const agent = this.state.agents.get(client.sessionId);
      if (!agent || agent.state !== "alive") return;
      agent.manualControlActive = true;
      this.enqueueManualInput(agent, {
        type: "ATTACK_ZOMBIE",
        targetSessionId: parsed.data.zombieId,
        seq: parsed.data.seq,
        ts: parsed.data.ts,
      });
    },

    INITIATE_RECRUITMENT: (client: Client, message: unknown) => {
      const parsed = InitiateRecruitmentSchema.safeParse(message);
      if (!parsed.success) return;

      const player = this.state.agents.get(client.sessionId);
      if (!player || player.state !== "alive") return;

      const target = this.state.agents.get(parsed.data.targetSessionId);
      if (!target) return;

      const check = this.recruitmentSystem.canInitiate(player, target, this.state);
      if (!check.ok) {
        client.send("RECRUITMENT_ERROR", { reason: check.reason });
        return;
      }

      // Pause the game during recruitment
      this.isPaused = true;

      // Generate dialogue (mock for now - LLM integration in Phase 2)
      const personality = PERSONALITIES[target.personality as PersonalityType];
      const dialogue: RecruitmentDialogueEvent = {
        tick: this.state.tick,
        targetSessionId: target.sessionId,
        personality: target.personality,
        displayName: personality?.displayName ?? "Unknown",
        dialogueLines: ["Hey... you looking for an ally?", "I've been watching you fight those things."],
        choices: [
          { text: "We're stronger together. Join me.", successChance: 0.8 },
          { text: "I have supplies to share.", successChance: 0.5 },
          { text: "Follow me or get out of my way.", successChance: 0.2 },
        ],
      };

      this.recruitmentSystem.startRecruitment(client.sessionId, target.sessionId, dialogue, this.state.tick);
      client.send("RECRUITMENT_DIALOGUE", dialogue);
    },

    RECRUITMENT_CHOICE: (client: Client, message: unknown) => {
      const parsed = RecruitmentChoiceSchema.safeParse(message);
      if (!parsed.success) return;

      const target = this.state.agents.get(parsed.data.targetSessionId);
      if (!target) return;

      const result = this.recruitmentSystem.processChoice(
        client.sessionId,
        parsed.data.choiceIndex,
        target,
        this.state.tick,
      );

      if (result) {
        if (result.success) {
          // Convert to ally
          target.allyStatus = "ally";
          target.allyOwnerId = client.sessionId;
          target.allyCommand = "follow";
        }

        client.send("RECRUITMENT_RESULT", result);
      }

      // Unpause
      this.isPaused = false;
    },

    DISMISS_RECRUITMENT: (client: Client, message: unknown) => {
      const parsed = DismissRecruitmentSchema.safeParse(message);
      if (!parsed.success) return;

      this.recruitmentSystem.dismiss(client.sessionId);
      this.isPaused = false;
    },

    ALLY_COMMAND: (client: Client, message: unknown) => {
      const data = message as { command?: string };
      if (!data?.command) return;
      const validCommands = ["follow", "hold", "attack"];
      if (!validCommands.includes(data.command)) return;

      // Apply command to all allies owned by this player
      this.state.agents.forEach((agent) => {
        if (agent.allyStatus === "ally" && agent.allyOwnerId === client.sessionId) {
          agent.allyCommand = data.command!;
        }
      });
    },
  };

  onCreate(options?: Record<string, unknown>) {
    // Load stage config if stageIndex is provided (solo mode)
    const stageIndex = typeof options?.stageIndex === "number" ? options.stageIndex : -1;
    if (stageIndex >= 0 && stageIndex < SOLO_STAGES.length) {
      this.stageConfig = SOLO_STAGES[stageIndex];
      this.maxClients = 1;
    }

    const sc = this.stageConfig;
    const mapWidth = sc?.mapWidth ?? GAME.MAP_WIDTH;
    const mapHeight = sc?.mapHeight ?? GAME.MAP_HEIGHT;
    const maxTicks = sc?.maxTicks ?? GAME.MAX_TICKS;

    this.state.mapWidth = mapWidth;
    this.state.mapHeight = mapHeight;
    this.state.maxTicks = maxTicks;

    // Generate map with terrain
    if (sc) {
      // Solo mode: custom map size and loot
      const terrain = generateTerrain(mapWidth, mapHeight);
      this.tileGrid = terrain;
      this.state.terrain = terrain.serialize();
      const wallCoords = terrain.getWallCoords();
      const reserved = new Set<string>(wallCoords);
      const objects = generateLootBoxesFiltered(
        sc.lootBoxCount, mapWidth, mapHeight, reserved,
        sc.lootPerBox, sc.allowedLootItems,
      );
      for (const obj of objects) {
        this.state.objects.set(obj.id, obj);
      }
    } else {
      // Regular mode: default map
      const { objects, terrain } = generateMap();
      this.tileGrid = terrain;
      this.state.terrain = terrain.serialize();
      for (const obj of objects) {
        this.state.objects.set(obj.id, obj);
      }
    }

    // Vision system: bind wall check to tileGrid
    const tileGrid = this.tileGrid;
    this.visionCheck = (fx: number, fy: number, tx: number, ty: number) =>
      canSee(fx, fy, tx, ty, VISION_RADIUS, (x, y) => tileGrid.get(x, y) === 1);

    // Zombie system
    this.zombiesEnabled = sc?.zombie?.enabled ?? true;
    const zombieConfigOverrides: Partial<ZombieManagerConfig> = { maxTicks };
    if (sc?.zombie) {
      if (sc.zombie.initialSpawnTick !== undefined) zombieConfigOverrides.initialSpawnTick = sc.zombie.initialSpawnTick;
      if (sc.zombie.baseSpawnInterval !== undefined) zombieConfigOverrides.baseSpawnInterval = sc.zombie.baseSpawnInterval;
      if (sc.zombie.maxActive !== undefined) zombieConfigOverrides.maxActive = sc.zombie.maxActive;
      if (sc.zombie.spawnScaling !== undefined) zombieConfigOverrides.spawnScaling = sc.zombie.spawnScaling;
    }
    this.zombieManager = new ZombieManager(mapWidth, mapHeight, this.tileGrid, zombieConfigOverrides);

    // Extraction
    if (sc?.extraction) {
      this.state.extractionActivatesTick = sc.extraction.enabled
        ? (sc.extraction.spawnAtTick ?? GAME.EXTRACTION.ACTIVATES_AT_TICK)
        : maxTicks + 9999; // effectively disabled
    } else {
      this.state.extractionActivatesTick = GAME.EXTRACTION.ACTIVATES_AT_TICK;
    }

    this.state.phase = "active";
    this.setSimulationInterval(this.update.bind(this), GAME.TICK_MS);
  }

  async onJoin(
    client: Client,
    options: Record<string, unknown>,
  ) {
    this.clientsBySession.set(client.sessionId, client);
    // Validate strategy
    const strategyResult = StrategySchema.safeParse(options.strategy);
    if (!strategyResult.success) {
      console.error(
        "Invalid strategy from",
        client.sessionId,
        strategyResult.error.message,
      );
      client.leave(CloseCode.WITH_ERROR);
      return;
    }

    const auth = client.auth as { sub: string; email?: string };
    const playerId = auth.sub;

    // Load player loadout from DB
    let loadout: Awaited<ReturnType<typeof loadPlayerLoadout>> = [];
    try {
      loadout = await loadPlayerLoadout(playerId);
    } catch (err) {
      if (!DEV_MODE) throw err;
      console.warn("[DEV_MODE] loadPlayerLoadout failed, using empty loadout");
    }

    // Create agent
    const agent = new Agent();
    agent.sessionId = client.sessionId;
    agent.playerId = playerId;
    agent.hp = GAME.DEFAULT_HP;
    agent.maxHp = GAME.DEFAULT_HP;
    agent.state = "alive";
    agent.currentAction = "IDLE";
    agent.strategy = strategyResult.data;
    agent.joinedAtTick = this.state.tick;
    agent.aiEnabled = options.aiMode === true;
    agent.manualControlActive = !!options.manualControl;
    agent.allyStatus = "player";
    const rawAvatarUrl = typeof options.avatarUrl === "string" ? options.avatarUrl : "";
    agent.avatarUrl = isValidAvatarUrl(rawAvatarUrl) ? rawAvatarUrl : "";

    // Spawn position (avoid walls)
    const spawn = getRandomSpawnCoord(
      GAME.MAP_WIDTH,
      GAME.MAP_HEIGHT,
      this.occupiedSpawns,
      this.tileGrid,
    );
    agent.x = spawn.x;
    agent.y = spawn.y;

    // Populate inventory from loadout
    for (const item of loadout) {
      const invItem = new InventoryItem();
      invItem.itemId = item.item_id;
      invItem.itemType = item.item_type;
      invItem.quantity = 1;
      agent.inventory.push(invItem);
    }

    this.state.agents.set(client.sessionId, agent);

    // Solo mode: give player start items and spawn neutral bots
    if (this.stageConfig) {
      if (this.stageConfig.playerStartItems) {
        for (const startItem of this.stageConfig.playerStartItems) {
          const invItem = new InventoryItem();
          invItem.itemId = startItem.itemId;
          invItem.itemType = ITEM_REGISTRY[startItem.itemId]?.type ?? "weapon";
          invItem.quantity = startItem.quantity;
          agent.inventory.push(invItem);
        }
        autoEquipArmor(agent);
      }
      this.spawnNeutralBots(this.stageConfig.neutralBots ?? 0);
    }

    // Spawn server-side bots for manual control players (non-solo)
    if (!this.stageConfig && agent.manualControlActive) {
      this.spawnBotsForManualPlayer();
    }

    console.log(
      `[RaidRoom] ${client.sessionId} joined as ${playerId} at (${spawn.x},${spawn.y}) manual=${agent.manualControlActive}`,
    );
  }

  private spawnBotsForManualPlayer() {
    resetBotIdCounter();
    const botConfigs: BotSpawnConfig[] = [
      { difficulty: "easy", hp: 80 },
      { difficulty: "easy", hp: 80 },
      { difficulty: "medium", hp: 100 },
      { difficulty: "hard", hp: 100 },
    ];
    for (const config of botConfigs) {
      const spawn = getRandomSpawnCoord(
        GAME.MAP_WIDTH, GAME.MAP_HEIGHT,
        this.occupiedSpawns, this.tileGrid,
      );
      const bot = createBotAgent(config, spawn.x, spawn.y);
      bot.allyStatus = "neutral";
      bot.personality = getRandomPersonality();
      bot.spawnX = spawn.x;
      bot.spawnY = spawn.y;
      this.state.agents.set(bot.sessionId, bot);
    }
  }

  private spawnNeutralBots(count: number) {
    if (count <= 0) return;
    for (let i = 0; i < count; i++) {
      const config: BotSpawnConfig = { difficulty: "medium", hp: 80 };
      const spawn = getRandomSpawnCoord(
        this.state.mapWidth, this.state.mapHeight,
        this.occupiedSpawns, this.tileGrid,
      );
      const bot = createBotAgent(config, spawn.x, spawn.y);
      bot.allyStatus = "neutral";
      bot.personality = getRandomPersonality();
      bot.spawnX = spawn.x;
      bot.spawnY = spawn.y;
      this.state.agents.set(bot.sessionId, bot);
    }
  }

  private update() {
    if (this.state.phase !== "active") return;
    if (this.isPaused) return;

    // --- Tick increment ---
    this.state.tick++;

    // --- Zombie spawning ---
    const newZombies = this.zombiesEnabled ? this.zombieManager.update(this.state.tick) : [];
    for (const zData of newZombies) {
      const zombie = new Zombie();
      zombie.id = zData.id;
      zombie.zombieType = zData.zombieType;
      zombie.x = zData.x;
      zombie.y = zData.y;
      zombie.hp = zData.hp;
      zombie.maxHp = zData.maxHp;
      this.state.zombies.set(zData.id, zombie);
    }
    this.state.waveIntensity = Math.round(this.zombieManager.getWaveIntensity(this.state.tick) * 100) / 100;

    // --- Extraction activation ---
    if (!this.state.extractionActive && this.state.tick >= this.state.extractionActivatesTick) {
      this.state.extractionActive = true;
      // Spawn extraction points
      const exitCount = this.stageConfig?.extraction?.count ?? GAME.EXTRACTION.EXIT_COUNT;
      const existingCoords = this.getExistingExtractionCoords();
      for (let i = 0; i < exitCount; i++) {
        const ex = this.spawnExtractionPoint(existingCoords);
        if (ex) existingCoords.push({ x: ex.x, y: ex.y });
      }
      this.broadcast("EXTRACTION_ACTIVATED", { tick: this.state.tick });
    }

    // --- AI Cognitive Replan Check (async, non-blocking) ---
    this.state.agents.forEach((agent) => {
      if (agent.state !== "alive") return;
      if (!agent.aiEnabled) return;

      const snapshot = buildStateSnapshot(agent, this.state, this.visionCheck);
      if (shouldReplan(snapshot, agent.replanState, this.state.tick)) {
        agent.replanState.pendingReplan = true;

        // Notify clients that replan started
        this.broadcast("AI_REPLAN_START", {
          tick: this.state.tick,
          agentSessionId: agent.sessionId,
        });

        // Build cognitive inputs
        const perception = buildPerception(agent, this.state, this.visionCheck);
        const perceptionStr = serializePerception(perception);
        const memoryStr = this.memoryManager.serializeForLLM(agent.sessionId);
        const currentWorldState = agent.cognitiveState?.worldState ?? null;
        const events = summarizeEventLog(this.eventLog, agent.sessionId, 10, this.state.tick);

        const agentSessionId = agent.sessionId;
        cognitiveReplan(perceptionStr, memoryStr, currentWorldState, events)
          .then((result) => {
            // Guard: agent may have died or left during async call
            const currentAgent = this.state.agents.get(agentSessionId);
            if (!currentAgent || currentAgent.state !== "alive") {
              return;
            }

            console.log(`[AI] ${agentSessionId.slice(0, 6)} cognitive replan: ${result.strategy.name} | reasoning="${result.plan.reasoning.slice(0, 60)}..."`);
            currentAgent.strategy = result.strategy;
            currentAgent.replanState.lastReplanTick = this.state.tick;
            currentAgent.replanState.pendingReplan = false;

            // Update rate limit tracking
            const currentMinute = Math.floor(this.state.tick / 200);
            if (currentMinute !== currentAgent.replanState.lastReplanMinute) {
              currentAgent.replanState.replanCount = 1;
              currentAgent.replanState.lastReplanMinute = currentMinute;
            } else {
              currentAgent.replanState.replanCount++;
            }

            // Rebuild snapshot at resolution time for accurate trigger comparison
            const currentSnapshot = buildStateSnapshot(currentAgent, this.state, this.visionCheck);
            currentAgent.replanState.lastHp = currentSnapshot.hp_percent;
            currentAgent.replanState.lastEnemyCount = currentSnapshot.nearby_enemy_count;
            currentAgent.replanState.lastLootCount = currentSnapshot.nearby_loot_count;

            // Update cognitive state
            const recentMemory = this.memoryManager.getRecent(agentSessionId, 10);
            currentAgent.cognitiveState = {
              perception,
              memory: recentMemory,
              worldState: result.worldState,
              plan: result.plan,
              lastUpdatedTick: this.state.tick,
            };

            // Broadcast cognitive update event to clients
            this.broadcast("AI_COGNITIVE_UPDATE", {
              tick: this.state.tick,
              agentSessionId,
              strategyName: result.strategy.name,
              cognitive: {
                perception: structuredClone(perception),
                memory: recentMemory,
                worldState: { ...result.worldState },
                plan: { ...result.plan },
              },
            });
          })
          .catch((err) => {
            console.error(`[AI] Cognitive replan failed for ${agentSessionId.slice(0, 6)}:`, err);
            const failedAgent = this.state.agents.get(agentSessionId);
            if (failedAgent) {
              failedAgent.replanState.pendingReplan = false;
            }
          });
      }
    });

    // --- Trap triggers ---
    const trapDeathQueue: Array<{ victimId: string }> = [];
    const trapsToRemove: string[] = [];

    this.state.objects.forEach((obj) => {
      if (obj.objectType !== "TRAP") return;
      if (obj.expiresAtTick > 0 && obj.expiresAtTick <= this.state.tick) {
        trapsToRemove.push(obj.id);
        return;
      }

      this.state.agents.forEach((agent) => {
        if (agent.state !== "alive") return;
        if (agent.x === obj.x && agent.y === obj.y) {
          const trapDef = ITEM_REGISTRY["trap"];
          const trapStats = trapDef?.stats as UtilityStats;
          const damage = trapStats?.damage ?? 35;

          // Trap damage applies through armor
          const { finalDamage, armorAbsorbed } = applyArmorDamageReduction(agent, damage);
          agent.hp -= finalDamage;

          const evt: TrapTriggerEvent = {
            tick: this.state.tick,
            victimSessionId: agent.sessionId,
            x: obj.x,
            y: obj.y,
            damage: finalDamage,
            hpAfter: Math.max(0, agent.hp),
          };
          this.broadcast("TRAP_TRIGGER_EVENT", evt);

          trapsToRemove.push(obj.id);

          if (agent.hp <= 0) {
            agent.hp = 0;
            trapDeathQueue.push({ victimId: agent.sessionId });
          }
        }
      });
    });

    for (const id of trapsToRemove) {
      this.state.objects.delete(id);
    }

    for (const { victimId } of trapDeathQueue) {
      const agent = this.state.agents.get(victimId);
      if (!agent || agent.state !== "alive") continue;
      this.handleDeath(agent, null, "trap");
    }

    // --- Expire temporary objects (SMOKE) ---
    const expiredIds: string[] = [];
    this.state.objects.forEach((obj) => {
      if (
        (obj.objectType === "SMOKE") &&
        obj.expiresAtTick > 0 &&
        obj.expiresAtTick <= this.state.tick
      ) {
        expiredIds.push(obj.id);
      }
    });
    for (const id of expiredIds) {
      this.state.objects.delete(id);
    }

    // --- World Context broadcast (every 3 ticks) ---
    if (this.state.tick % 3 === 0) {
      this.state.agents.forEach((agent) => {
        if (agent.state !== "alive") return;
        const ctx = buildWorldContext(agent, this.state, this.tileGrid, this.visionCheck);
        // Replace Infinity with 9999 for JSON serialization
        const sanitized: Record<string, number> = {};
        for (const [k, v] of Object.entries(ctx)) {
          sanitized[k] = v === Infinity ? 9999 : v;
        }
        this.broadcast("WORLD_CONTEXT_UPDATE", {
          agentSessionId: agent.sessionId,
          ...sanitized,
        });
      });
    }

    // --- Phase 1: Collect all decisions ---
    const decisions = new Map<string, ActionResult>();
    this.state.agents.forEach((agent) => {
      if (agent.state !== "alive") return;

      // Dodge tick countdown
      if (agent.dodgeTicksRemaining > 0) {
        agent.dodgeTicksRemaining--;
        if (agent.dodgeTicksRemaining <= 0) {
          agent.isDodging = false;
        }
      }

      // Manual control branch
      if (agent.manualControlActive) {
        const manual = this.consumeManualInput(agent);
        if (manual) {
          const result = resolveManualAction(agent, manual, this.state, this.tileGrid, this.state.tick);
          if (result) {
            decisions.set(agent.sessionId, result);
            agent.currentAction = result.action;
            // Broadcast dodge event
            if (manual.type === "DODGE" && agent.isDodging) {
              const dodgeEvt: DodgeEvent = {
                tick: this.state.tick,
                agentSessionId: agent.sessionId,
                x: agent.x,
                y: agent.y,
              };
              this.broadcast("DODGE_EVENT", dodgeEvt);
            }
          } else {
            agent.currentAction = "IDLE";
          }
        } else {
          // Manual control active but no pending action -- idle
          agent.currentAction = "IDLE";
        }
      // Ally agent decision
      } else if (agent.allyStatus === "ally") {
        const decision = allyDecide(agent, this.state, this.tileGrid);
        decisions.set(agent.sessionId, decision);
        agent.currentAction = decision.action;
      // Neutral NPC: small patrol + attack nearby zombies
      } else if (agent.allyStatus === "neutral") {
        const decision = neutralDecide(agent, this.state, this.tileGrid);
        decisions.set(agent.sessionId, decision);
        agent.currentAction = decision.action;
      } else {
        // AI decision
        const decision = decide(agent, this.state, this.tileGrid, this.visionCheck);
        decisions.set(agent.sessionId, decision);
        agent.currentAction = decision.action;
      }
    });

    // --- Zombie AI decisions ---
    const zombieActions = new Map<string, ZombieAction>();
    const zombieTargets: Array<{ id: string; x: number; y: number }> = [];
    this.state.agents.forEach((agent) => {
      if (agent.state === "alive" && (agent.allyStatus === "player" || agent.allyStatus === "ally")) {
        zombieTargets.push({ id: agent.sessionId, x: agent.x, y: agent.y });
      }
    });

    this.state.zombies.forEach((zombie, zombieId) => {
      if (zombie.state !== "alive") return;
      const action = zombieDecide(
        { id: zombieId, zombieType: zombie.zombieType as any, x: zombie.x, y: zombie.y, hp: zombie.hp, maxHp: zombie.maxHp, state: zombie.state },
        zombieTargets,
        this.state.mapWidth,
        this.state.mapHeight,
        this.tileGrid,
      );
      zombieActions.set(zombieId, action);
    });

    // --- Phase 2: Execute decisions ---
    // Track occupied tiles to prevent agents from stacking
    const occupiedTiles = new Set<string>();
    this.state.agents.forEach((a) => {
      if (a.state === "alive") occupiedTiles.add(`${a.x},${a.y}`);
    });

    const tryMove = (agent: Agent, tx: number, ty: number): void => {
      const key = `${tx},${ty}`;
      if (tx === agent.x && ty === agent.y) return; // no move
      if (occupiedTiles.has(key)) return; // blocked by another agent
      occupiedTiles.delete(`${agent.x},${agent.y}`);
      agent.x = tx;
      agent.y = ty;
      occupiedTiles.add(key);
    };

    const deathQueue: Array<{ victimId: string; killerId: string; cause: string }> = [];

    decisions.forEach((decision, sessionId) => {
      const agent = this.state.agents.get(sessionId);
      if (!agent || agent.state !== "alive") return;

      switch (decision.action) {
        case "MOVE_TO_NEAREST_LOOT":
        case "MOVE_TO_EXTRACT":
        case "MOVE_TO_RANDOM":
        case "FLEE": {
          if (decision.targetX !== undefined && decision.targetY !== undefined) {
            tryMove(agent, decision.targetX, decision.targetY);
          }
          break;
        }

        case "ATTACK_NEAREST": {
          // Move toward enemy while attacking
          if (decision.targetX !== undefined && decision.targetY !== undefined) {
            tryMove(agent, decision.targetX, decision.targetY);
          }
          if (decision.targetSessionId) {
            const defender = this.state.agents.get(decision.targetSessionId);
            if (defender && defender.state === "alive") {
              // Dodge invulnerability check
              if (defender.isDodging && defender.dodgeTicksRemaining > 0) {
                const missEvt: AttackEvent = {
                  tick: this.state.tick,
                  attackerSessionId: agent.sessionId,
                  defenderSessionId: defender.sessionId,
                  weaponId: "unarmed",
                  hit: false,
                  damage: 0,
                  defenderHpAfter: defender.hp,
                  armorAbsorbed: 0,
                };
                this.broadcast("ATTACK_EVENT", missEvt);
                const dodgeEvt: DodgeEvent = {
                  tick: this.state.tick,
                  agentSessionId: defender.sessionId,
                  x: defender.x,
                  y: defender.y,
                };
                this.broadcast("DODGE_EVENT", dodgeEvt);
              } else {
                const result = resolveAttack(agent, defender, this.tileGrid);
                const evt: AttackEvent = {
                  tick: this.state.tick,
                  attackerSessionId: agent.sessionId,
                  defenderSessionId: defender.sessionId,
                  weaponId: result.weaponId,
                  hit: result.hit,
                  damage: result.damage,
                  defenderHpAfter: defender.hp,
                  armorAbsorbed: result.armorAbsorbed,
                };
                this.broadcast("ATTACK_EVENT", evt);
                this.addEventLog(agent.sessionId, "attack", `dealt ${result.damage}dmg to ${defender.sessionId.slice(0, 4)}`);
                this.addEventLog(defender.sessionId, "hit", `took ${result.damage}dmg from ${agent.sessionId.slice(0, 4)}`);
                if (result.killed) {
                  deathQueue.push({ victimId: defender.sessionId, killerId: agent.sessionId, cause: "combat" });
                }
              }
            }
          }
          break;
        }

        case "LOOT": {
          // Find loot box at agent's position
          let targetBox: MapObject | null = null;
          this.state.objects.forEach((obj) => {
            if (
              !targetBox &&
              (obj.objectType === "LOOT_BOX" || obj.objectType === "CORPSE") &&
              obj.x === agent.x &&
              obj.y === agent.y &&
              obj.items.length > 0
            ) {
              targetBox = obj;
            }
          });

          if (targetBox) {
            const lootedItems = (targetBox as MapObject).items.map((i) => ({
              itemId: i.itemId,
              quantity: i.quantity,
            }));
            transferItems(targetBox, agent);
            const lootEvt: LootEvent = {
              tick: this.state.tick,
              agentSessionId: agent.sessionId,
              objectId: (targetBox as MapObject).id,
              items: lootedItems,
            };
            this.broadcast("LOOT_EVENT", lootEvt);
            this.addEventLog(agent.sessionId, "loot", `looted ${lootedItems.map(i => i.itemId).join(",")}`);

            // Remove empty loot boxes (keep corpses and extraction)
            if (
              (targetBox as MapObject).objectType === "LOOT_BOX" &&
              (targetBox as MapObject).items.length === 0
            ) {
              this.state.objects.delete((targetBox as MapObject).id);
            }
            // Auto-equip armor after looting
            autoEquipArmor(agent);
          }
          break;
        }

        case "HEAL": {
          // Find first consumable in inventory
          for (let i = 0; i < agent.inventory.length; i++) {
            const item = agent.inventory[i];
            const def = ITEM_REGISTRY[item.itemId];
            if (def && def.type === "consumable" && isConsumable(def.stats)) {
              agent.hp = Math.min(agent.maxHp, agent.hp + def.stats.healAmount);
              const healEvt: HealEvent = {
                tick: this.state.tick,
                agentSessionId: agent.sessionId,
                itemId: item.itemId,
                healAmount: def.stats.healAmount,
                hpAfter: agent.hp,
              };
              this.broadcast("HEAL_EVENT", healEvt);
              this.addEventLog(agent.sessionId, "heal", `healed +${def.stats.healAmount}hp`);
              item.quantity -= 1;
              if (item.quantity <= 0) {
                agent.inventory.splice(i, 1);
              }
              break;
            }
          }
          break;
        }

        case "EXTRACT": {
          const extraction = this.findExtractionAt(agent.x, agent.y);
          if (extraction) {
            // Remove extraction point (1-use)
            this.state.objects.delete(extraction.id);
            this.handleExtraction(agent);
          }
          break;
        }

        case "USE_GRENADE": {
          this.handleGrenade(agent, decision);
          break;
        }

        case "USE_SMOKE": {
          this.handleSmoke(agent);
          break;
        }

        case "PLACE_TRAP": {
          this.handlePlaceTrap(agent);
          break;
        }

        case "ATTACK_NEAREST_ZOMBIE": {
          if (decision.targetX !== undefined && decision.targetY !== undefined) {
            tryMove(agent, decision.targetX, decision.targetY);
          }
          if (decision.targetSessionId) {
            const zombie = this.state.zombies.get(decision.targetSessionId);
            if (zombie && zombie.state === "alive") {
              const result = resolveAttackOnZombie(agent, zombie);
              this.broadcast("ATTACK_EVENT", {
                tick: this.state.tick,
                attackerSessionId: agent.sessionId,
                defenderSessionId: zombie.id,
                weaponId: result.weaponId,
                hit: result.hit,
                damage: result.damage,
                defenderHpAfter: zombie.hp,
                armorAbsorbed: 0,
              });
              if (result.killed) {
                zombie.state = "dead";
                this.state.zombieKillCount++;
                const deathEvt: ZombieDeathEvent = {
                  tick: this.state.tick,
                  zombieId: zombie.id,
                  killerSessionId: agent.sessionId,
                  x: zombie.x,
                  y: zombie.y,
                };
                this.broadcast("ZOMBIE_DEATH_EVENT", deathEvt);
              }
            }
          }
          break;
        }

        case "FOLLOW_PLAYER":
        case "HOLD_POSITION": {
          if (decision.targetX !== undefined && decision.targetY !== undefined) {
            tryMove(agent, decision.targetX, decision.targetY);
          }
          break;
        }
      }
    });

    // --- Execute zombie actions ---
    zombieActions.forEach((action, zombieId) => {
      const zombie = this.state.zombies.get(zombieId);
      if (!zombie || zombie.state !== "alive") return;

      if (action.type === "move" && action.targetX !== undefined && action.targetY !== undefined) {
        zombie.x = action.targetX;
        zombie.y = action.targetY;
      } else if (action.type === "attack" && action.targetId) {
        const target = this.state.agents.get(action.targetId);
        if (target && target.state === "alive") {
          const result = resolveZombieAttack(zombie, target);
          const attackEvt: ZombieAttackEvent = {
            tick: this.state.tick,
            zombieId: zombie.id,
            targetSessionId: target.sessionId,
            damage: result.damage,
            targetHpAfter: target.hp,
          };
          this.broadcast("ZOMBIE_ATTACK_EVENT", attackEvt);
          if (result.hit && result.killed) {
            deathQueue.push({ victimId: target.sessionId, killerId: zombie.id, cause: "zombie" });
          }
        }
      }
    });

    // --- Clean up dead zombies ---
    const deadZombieIds: string[] = [];
    this.state.zombies.forEach((zombie, id) => {
      if (zombie.state === "dead") deadZombieIds.push(id);
    });
    for (const id of deadZombieIds) {
      this.state.zombies.delete(id);
    }

    // --- Phase 3: Process death queue ---
    for (const { victimId, killerId, cause } of deathQueue) {
      const agent = this.state.agents.get(victimId);
      if (!agent || agent.state !== "alive") continue;
      this.handleDeath(agent, killerId, cause);
    }

    // --- Phase 4: Check solo win conditions ---
    if (this.stageConfig) {
      const wc = this.stageConfig.winCondition;
      let stageClear = false;

      if (wc.type === "survive_ticks" && wc.value && this.state.tick >= wc.value) {
        stageClear = true;
      } else if (wc.type === "loot_threshold" && wc.value) {
        let totalItems = 0;
        this.state.agents.forEach((a) => {
          if (a.allyStatus === "player" && a.state === "alive") {
            a.inventory.forEach((item) => { totalItems += item.quantity; });
          }
        });
        if (totalItems >= wc.value) stageClear = true;
      }
      // extract and extract_with_loot are handled in handleExtraction

      if (stageClear) {
        const playerAgent = this.findPlayerAgent();
        this.broadcast("STAGE_CLEAR", {
          tick: this.state.tick,
          stageId: this.stageConfig.id,
          inventory: playerAgent ? Array.from(playerAgent.inventory).map((i) => ({
            itemId: i.itemId, quantity: i.quantity,
          })) : [],
        });
        this.state.phase = "ended";
        this.disconnect();
        return;
      }
    }

    // --- Check end condition ---
    let alivePlayerCount = 0;
    this.state.agents.forEach((a) => {
      if (a.state === "alive" && (a.allyStatus === "player")) alivePlayerCount++;
    });

    const timedOut = this.state.tick >= this.state.maxTicks;

    if ((alivePlayerCount === 0 && this.state.tick > 1) || timedOut) {
      // Timeout: kill all remaining alive agents
      if (timedOut) {
        this.state.agents.forEach((agent) => {
          if (agent.state === "alive") {
            agent.state = "dead";
            agent.hp = 0;
            const deathEvt: DeathEvent = {
              tick: this.state.tick,
              victimSessionId: agent.sessionId,
              killerSessionId: null,
              corpseId: `corpse_${agent.sessionId}`,
              causeOfDeath: "timeout",
            };
            this.broadcast("DEATH_EVENT", deathEvt);
          }
        });
      }

      // Solo mode: send STAGE_FAIL
      if (this.stageConfig) {
        this.broadcast("STAGE_FAIL", {
          tick: this.state.tick,
          stageId: this.stageConfig.id,
          reason: timedOut ? "timeout" : "death",
        });
      }

      this.state.phase = "ended";
      this.disconnect();
    }
  }

  private findPlayerAgent(): Agent | null {
    let player: Agent | null = null;
    this.state.agents.forEach((a) => {
      if (!player && a.allyStatus === "player") player = a;
    });
    return player;
  }

  private getExistingExtractionCoords(): Array<{ x: number; y: number }> {
    const coords: Array<{ x: number; y: number }> = [];
    this.state.objects.forEach((obj) => {
      if (obj.objectType === "EXTRACTION") {
        coords.push({ x: obj.x, y: obj.y });
      }
    });
    return coords;
  }

  private spawnExtractionPoint(existingCoords: Array<{ x: number; y: number }>): MapObject | null {
    for (let attempt = 0; attempt < 30; attempt++) {
      const x = Math.floor(Math.random() * this.state.mapWidth);
      const y = Math.floor(Math.random() * this.state.mapHeight);
      if (!this.tileGrid.isPassable(x, y)) continue;

      // Check distance from existing extraction points
      let tooClose = false;
      for (const coord of existingCoords) {
        if (Math.abs(x - coord.x) + Math.abs(y - coord.y) < GAME.EXTRACTION.MIN_DISTANCE_BETWEEN) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      const extraction = new MapObject();
      extraction.id = `extraction_${this.extractionCounter++}`;
      extraction.objectType = "EXTRACTION";
      extraction.x = x;
      extraction.y = y;
      this.state.objects.set(extraction.id, extraction);
      return extraction;
    }
    return null;
  }

  private findExtractionAt(x: number, y: number): MapObject | null {
    let found: MapObject | null = null;
    this.state.objects.forEach((obj) => {
      if (!found && obj.objectType === "EXTRACTION" && obj.x === x && obj.y === y) {
        found = obj;
      }
    });
    return found;
  }

  private addEventLog(agentSessionId: string, type: string, message: string): void {
    this.eventLog.push({
      tick: this.state.tick,
      agentSessionId,
      type,
      message,
    });
    // Keep event log bounded
    if (this.eventLog.length > 100) {
      this.eventLog = this.eventLog.slice(-50);
    }

    // Record to agent memory for cognitive replan
    const memoryTypeMap: Record<string, MemoryEntry["type"]> = {
      attack: "combat",
      hit: "combat",
      loot: "loot",
      heal: "loot",
      move: "movement",
    };
    const memoryType = memoryTypeMap[type] ?? "observation";
    this.memoryManager.record(agentSessionId, {
      tick: this.state.tick,
      type: memoryType,
      summary: message,
    });
  }

  private handleGrenade(agent: Agent, decision: ActionResult): void {
    // Find and consume grenade from inventory
    let consumed = false;
    for (let i = 0; i < agent.inventory.length; i++) {
      if (agent.inventory[i].itemId === "grenade" && agent.inventory[i].quantity > 0) {
        agent.inventory[i].quantity -= 1;
        if (agent.inventory[i].quantity <= 0) {
          agent.inventory.splice(i, 1);
        }
        consumed = true;
        break;
      }
    }
    if (!consumed) return;

    const grenadeDef = ITEM_REGISTRY["grenade"];
    const grenadeStats = grenadeDef.stats as UtilityStats;
    const gx = decision.targetX ?? agent.x;
    const gy = decision.targetY ?? agent.y;
    const radius = grenadeStats.radius ?? 1;
    const baseDamage = grenadeStats.damage ?? 40;

    const victims: GrenadeEvent["victims"] = [];
    const grenadeDeaths: Array<{ victimId: string }> = [];

    this.state.agents.forEach((target) => {
      if (target.state !== "alive") return;
      const dist = Math.abs(target.x - gx) + Math.abs(target.y - gy);
      if (dist <= radius) {
        // Distance falloff
        const falloff = dist === 0 ? 1 : 0.5;
        const rawDamage = Math.round(baseDamage * falloff);
        // Grenades apply through armor
        const { finalDamage, armorAbsorbed } = applyArmorDamageReduction(target, rawDamage);
        target.hp -= finalDamage;
        if (target.hp <= 0) target.hp = 0;
        victims.push({
          sessionId: target.sessionId,
          damage: finalDamage,
          hpAfter: target.hp,
        });
        if (target.hp <= 0) {
          grenadeDeaths.push({ victimId: target.sessionId });
        }
      }
    });

    const evt: GrenadeEvent = {
      tick: this.state.tick,
      throwerSessionId: agent.sessionId,
      x: gx,
      y: gy,
      radius,
      victims,
    };
    this.broadcast("GRENADE_EVENT", evt);

    for (const { victimId } of grenadeDeaths) {
      const victim = this.state.agents.get(victimId);
      if (victim && victim.state === "alive") {
        this.handleDeath(victim, agent.sessionId, "grenade");
      }
    }
  }

  private handleSmoke(agent: Agent): void {
    let consumed = false;
    for (let i = 0; i < agent.inventory.length; i++) {
      if (agent.inventory[i].itemId === "smoke_grenade" && agent.inventory[i].quantity > 0) {
        agent.inventory[i].quantity -= 1;
        if (agent.inventory[i].quantity <= 0) {
          agent.inventory.splice(i, 1);
        }
        consumed = true;
        break;
      }
    }
    if (!consumed) return;

    const smokeDef = ITEM_REGISTRY["smoke_grenade"];
    const smokeStats = smokeDef.stats as UtilityStats;

    const smoke = new MapObject();
    smoke.id = `smoke_${this.smokeCounter++}`;
    smoke.objectType = "SMOKE";
    smoke.x = agent.x;
    smoke.y = agent.y;
    smoke.radius = smokeStats.radius ?? 2;
    smoke.expiresAtTick = this.state.tick + (smokeStats.duration ?? 10);
    this.state.objects.set(smoke.id, smoke);

    const evt: SmokeEvent = {
      tick: this.state.tick,
      throwerSessionId: agent.sessionId,
      x: smoke.x,
      y: smoke.y,
      radius: smoke.radius,
      objectId: smoke.id,
    };
    this.broadcast("SMOKE_EVENT", evt);
  }

  private handlePlaceTrap(agent: Agent): void {
    // Don't place on walls
    if (!this.tileGrid.isPassable(agent.x, agent.y)) return;

    let consumed = false;
    for (let i = 0; i < agent.inventory.length; i++) {
      if (agent.inventory[i].itemId === "trap" && agent.inventory[i].quantity > 0) {
        agent.inventory[i].quantity -= 1;
        if (agent.inventory[i].quantity <= 0) {
          agent.inventory.splice(i, 1);
        }
        consumed = true;
        break;
      }
    }
    if (!consumed) return;

    const trapDef = ITEM_REGISTRY["trap"];
    const trapStats = trapDef.stats as UtilityStats;

    const trapObj = new MapObject();
    trapObj.id = `trap_${this.trapCounter++}`;
    trapObj.objectType = "TRAP";
    trapObj.x = agent.x;
    trapObj.y = agent.y;
    trapObj.expiresAtTick = this.state.tick + (trapStats.duration ?? 100);
    this.state.objects.set(trapObj.id, trapObj);
  }

  private async handleExtraction(agent: Agent) {
    agent.state = "extracted";
    const ticksAlive = this.state.tick - agent.joinedAtTick;

    const lootGained = agent.inventory.map((item) => ({
      itemId: item.itemId,
      quantity: item.quantity,
    }));

    let itemCount = 0;
    for (const item of agent.inventory) itemCount += item.quantity;
    const extractEvt: ExtractEvent = {
      tick: this.state.tick,
      agentSessionId: agent.sessionId,
      itemCount,
    };
    this.broadcast("EXTRACT_EVENT", extractEvt);

    // Solo mode: extraction-based win conditions
    if (this.stageConfig && agent.allyStatus === "player") {
      const wc = this.stageConfig.winCondition;
      if (wc.type === "extract" || wc.type === "extract_with_loot") {
        const hasEnoughLoot = !wc.value || itemCount >= wc.value;
        if (wc.type === "extract" || hasEnoughLoot) {
          this.broadcast("STAGE_CLEAR", {
            tick: this.state.tick,
            stageId: this.stageConfig.id,
            inventory: lootGained,
          });
          this.state.phase = "ended";
          // Disconnect after DB save completes below
        }
      }
    }

    // Save to DB
    try {
      await saveRaidResult({
        playerId: agent.playerId,
        roomId: this.roomId,
        result: "survived",
        lootGained,
        durationSeconds: ticksAlive,
      });

      // Save loot to player loadout
      await saveLootToLoadout(
        agent.playerId,
        Array.from(agent.inventory),
      );
    } catch (err) {
      if (!DEV_MODE) throw err;
      console.warn("[DEV_MODE] DB save on extraction failed, ignoring");
    }

    // Notify client
    const client = this.clients.find(
      (c) => c.sessionId === agent.sessionId,
    );
    if (client) {
      const result: RaidResult = { result: "survived", ticksAlive };
      client.send("RAID_RESULT", result);
      client.leave();
    }
  }

  private async handleDeath(
    agent: Agent,
    killerSessionId: string | null = null,
    causeOfDeath: string = "disconnect",
  ) {
    agent.state = "dead";
    const ticksAlive = this.state.tick - agent.joinedAtTick;

    // Create corpse with agent's inventory
    const corpse = new MapObject();
    corpse.id = `corpse_${agent.sessionId}`;
    corpse.objectType = "CORPSE";
    corpse.x = agent.x;
    corpse.y = agent.y;
    transferAllItems(agent, corpse);
    this.state.objects.set(corpse.id, corpse);

    const deathEvt: DeathEvent = {
      tick: this.state.tick,
      victimSessionId: agent.sessionId,
      killerSessionId,
      corpseId: corpse.id,
      causeOfDeath,
    };
    this.broadcast("DEATH_EVENT", deathEvt);

    // Permadeath: delete equipped items from DB
    try {
      await deletePlayerEquipment(agent.playerId);

      // Save raid log
      await saveRaidResult({
        playerId: agent.playerId,
        roomId: this.roomId,
        result: "died",
        lootGained: [],
        durationSeconds: ticksAlive,
      });
    } catch (err) {
      if (!DEV_MODE) throw err;
      console.warn("[DEV_MODE] DB save on death failed, ignoring");
    }

    // Notify client
    const client = this.clients.find(
      (c) => c.sessionId === agent.sessionId,
    );
    if (client) {
      const result: RaidResult = { result: "died", ticksAlive };
      client.send("RAID_RESULT", result);
      // Don't kick manual control players -- they may want to spectate
      if (!agent.manualControlActive) {
        client.leave();
      }
    }
  }

  onLeave(client: Client, code: CloseCode) {
    const agent = this.state.agents.get(client.sessionId);
    if (!agent) return;
    this.clientsBySession.delete(client.sessionId);

    // Mid-combat disconnect = death (permadeath)
    if (agent.state === "alive") {
      this.handleDeath(agent);
    }

    console.log(
      `[RaidRoom] ${client.sessionId} left (code: ${code}, state: ${agent.state})`,
    );
  }

  onDispose() {
    console.log(`[RaidRoom] Room ${this.roomId} disposing...`);
  }
}
