import { Client, Room } from "@colyseus/sdk";
import { Callbacks } from "@colyseus/schema";
import type { Strategy } from "./strategyTypes";
import { validateStrategy } from "./strategyValidation";

export interface InventoryItemData {
  itemId: string;
  itemType: string;
  quantity: number;
}

export interface AgentData {
  sessionId: string;
  playerId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: string;
  currentAction: string;
  equippedArmor: string;
  armorDurability: number;
  avatarUrl: string;
  inventory: InventoryItemData[];
  allyStatus: string;
  personality: string;
  allyCommand: string;
}

export interface MapObjectData {
  id: string;
  objectType: string;
  x: number;
  y: number;
}

export interface AttackEventData {
  tick: number;
  attackerSessionId: string;
  defenderSessionId: string;
  weaponId: string;
  hit: boolean;
  damage: number;
  defenderHpAfter: number;
  armorAbsorbed: number;
}

export interface DeathEventData {
  tick: number;
  victimSessionId: string;
  killerSessionId: string | null;
  corpseId: string;
  weaponId?: string;
  causeOfDeath?: string;
}

export interface LootEventData {
  tick: number;
  agentSessionId: string;
  objectId: string;
  items: Array<{ itemId: string; quantity: number }>;
}

export interface HealEventData {
  tick: number;
  agentSessionId: string;
  itemId: string;
  healAmount: number;
  hpAfter: number;
}

export interface ExtractEventData {
  tick: number;
  agentSessionId: string;
  itemCount: number;
}

export interface GrenadeEventData {
  tick: number;
  throwerSessionId: string;
  x: number;
  y: number;
  radius: number;
  victims: Array<{ sessionId: string; damage: number; hpAfter: number }>;
}

export interface TrapTriggerEventData {
  tick: number;
  victimSessionId: string;
  x: number;
  y: number;
  damage: number;
  hpAfter: number;
}

export interface SmokeEventData {
  tick: number;
  throwerSessionId: string;
  x: number;
  y: number;
  radius: number;
  objectId: string;
}

export interface DodgeEventData {
  tick: number;
  agentSessionId: string;
  x: number;
  y: number;
}

export interface ZombieData {
  id: string;
  zombieType: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: string;
}

export interface ZombieAttackEventData {
  tick: number;
  zombieId: string;
  targetSessionId: string;
  damage: number;
  targetHpAfter: number;
}

export interface ZombieDeathEventData {
  tick: number;
  zombieId: string;
  killerSessionId: string | null;
  x: number;
  y: number;
}

export interface RecruitmentDialogueData {
  tick: number;
  targetSessionId: string;
  personality: string;
  displayName: string;
  dialogueLines: string[];
  choices: Array<{ text: string; successChance: number }>;
}

export interface RecruitmentResultData {
  tick: number;
  targetSessionId: string;
  success: boolean;
  responseLine: string;
}

export interface WorldContextUpdateData {
  agentSessionId: string;
  hp_percent: number;
  nearby_enemy_count: number;
  nearest_enemy_distance: number;
  nearby_loot_count: number;
  nearest_loot_distance: number;
  inventory_count: number;
  distance_to_extract: number;
  tick: number;
  has_cover: number;
  has_armor: number;
  armor_durability: number;
  has_grenade: number;
  has_smoke: number;
  has_trap: number;
  extraction_available: number;
  nearby_zombie_count: number;
  nearest_zombie_distance: number;
  ally_count: number;
  wave_intensity: number;
}

export interface AIStrategyUpdateData {
  tick: number;
  agentSessionId: string;
  strategyName: string;
}

export interface CognitivePerception {
  threats: Array<{ distance: number; direction: string }>;
  opportunities: Array<{ type: string; distance: number; direction: string }>;
  environment: { terrain_cover: boolean };
  self: { hp_percent: number; armor: boolean; inventory_summary: string };
}

export interface CognitiveMemoryEntry {
  tick: number;
  type: "combat" | "loot" | "movement" | "observation";
  summary: string;
}

export interface CognitiveWorldState {
  threat_level: "low" | "medium" | "high" | "critical";
  resource_status: "abundant" | "sufficient" | "scarce" | "depleted";
  objective: string;
  confidence: number;
}

export interface CognitivePlanData {
  reasoning: string;
  situation_assessment: string;
  chosen_approach: string;
}

export interface AIReplanStartData {
  tick: number;
  agentSessionId: string;
}

export interface AICognitiveUpdateData {
  tick: number;
  agentSessionId: string;
  strategyName: string;
  cognitive: {
    perception: CognitivePerception;
    memory: CognitiveMemoryEntry[];
    worldState: CognitiveWorldState;
    plan: CognitivePlanData;
  };
}

export interface GameCallbacks {
  onAgentAdd: (sessionId: string, agent: AgentData) => void;
  onAgentChange: (sessionId: string, agent: AgentData) => void;
  onAgentRemove: (sessionId: string) => void;
  onObjectAdd: (id: string, obj: MapObjectData) => void;
  onObjectRemove: (id: string) => void;
  onStateChange: (tick: number, phase: string) => void;
  onTerrainData: (terrain: string) => void;
  onAttackEvent: (data: AttackEventData) => void;
  onDeathEvent: (data: DeathEventData) => void;
  onLootEvent: (data: LootEventData) => void;
  onHealEvent: (data: HealEventData) => void;
  onExtractEvent: (data: ExtractEventData) => void;
  onGrenadeEvent: (data: GrenadeEventData) => void;
  onTrapTriggerEvent: (data: TrapTriggerEventData) => void;
  onSmokeEvent: (data: SmokeEventData) => void;
  onWorldContextUpdate?: (data: WorldContextUpdateData) => void;
  onAIStrategyUpdate?: (data: AIStrategyUpdateData) => void;
  onAIReplanStart?: (data: AIReplanStartData) => void;
  onAICognitiveUpdate?: (data: AICognitiveUpdateData) => void;
  onDodgeEvent?: (data: DodgeEventData) => void;
  onZombieAdd?: (id: string, zombie: ZombieData) => void;
  onZombieChange?: (id: string, zombie: ZombieData) => void;
  onZombieRemove?: (id: string) => void;
  onZombieAttackEvent?: (data: ZombieAttackEventData) => void;
  onZombieDeathEvent?: (data: ZombieDeathEventData) => void;
  onRecruitmentDialogue?: (data: RecruitmentDialogueData) => void;
  onRecruitmentResult?: (data: RecruitmentResultData) => void;
  onExtractionActivated?: (data: { tick: number }) => void;
  onConnectionChange: (connected: boolean) => void;
}

export class GameClient {
  private clients: Client[] = [];
  private rooms: Room[] = [];
  private activeRooms = new Set<number>();
  private primaryIndex = -1;
  private myRoom: Room | null = null;
  private inputAckHandler: ((seq: number) => void) | null = null;

  private callbacks: GameCallbacks | null = null;
  private agentCounter = 0;
  private agentIndices = new Map<string, number>();
  private strategyMap = new Map<string, string>();

  setCallbacks(cb: GameCallbacks) {
    this.callbacks = cb;
  }

  setInputAckHandler(cb: (seq: number) => void): void {
    this.inputAckHandler = cb;
  }

  getStrategyName(sessionId: string): string {
    return this.strategyMap.get(sessionId) ?? "";
  }

  getAgentIndex(sessionId: string): number {
    return this.agentIndices.get(sessionId) ?? 0;
  }

  async connectMultiple(
    serverUrl: string,
    strategies: Strategy[],
    aiMode: boolean = false,
    avatarUrl?: string,
    accessToken?: string,
    manualControl: boolean = false,
  ): Promise<void> {
    if (strategies.length === 0) {
      throw new Error("[GameClient] connectMultiple requires at least 1 strategy");
    }

    let roomId: string | null = null;

    for (let i = 0; i < strategies.length; i++) {
      const strategy = strategies[i];
      const strategyError = validateStrategy(strategy);
      if (strategyError) {
        const message = `[GameClient] Invalid strategy "${strategy.name}": ${strategyError}`;
        if (i === 0) {
          throw new Error(message);
        }
        console.warn(`${message}. Skipping this agent.`);
        continue;
      }

      try {
        const client = new Client(serverUrl);
        const opts: Record<string, unknown> = {
          accessToken: accessToken ?? "dev",
          strategy,
          aiMode: i === 0 ? aiMode : false,
          manualControl: i === 0 ? manualControl : false,
          avatarUrl: i === 0 ? avatarUrl : undefined,
        };

        // First client creates the room; others join by ID to avoid
        // matchmaking delays that cause "seat reservation expired".
        if (i > 0 && !roomId) {
          console.error(`[GameClient] Skipping ${strategy.name}: primary room not created`);
          continue;
        }
        const room: Room =
          i === 0
            ? await client.joinOrCreate("raid", opts)
            : await client.joinById(roomId!, opts);

        if (i === 0) {
          roomId = room.roomId;
          this.myRoom = room;
          // Immediately activate manual control on the server
          if (manualControl) {
            room.send("ACTIVATE_MANUAL", {});
          }
        }

        const roomIndex = this.rooms.length;
        this.clients.push(client);
        this.rooms.push(room);
        this.activeRooms.add(roomIndex);
        this.strategyMap.set(room.sessionId, strategy.name);

        room.onLeave(() => {
          console.log(
            `[GameClient] ${strategy.name} (${room.sessionId.slice(0, 6)}) left room`
          );
          this.activeRooms.delete(roomIndex);
          if (roomIndex === this.primaryIndex) {
            this.migratePrimary();
          }
        });

        room.onError((code: number, msg?: string) => {
          if (code === 524) {
            console.warn(`[GameClient] ${strategy.name} room closed (${code})`);
            return;
          }
          console.error(
            `[GameClient] ${strategy.name} error ${code}: ${msg}`
          );
        });

        // First room becomes primary with all listeners
        if (this.primaryIndex === -1) {
          this.primaryIndex = roomIndex;
          this.setupStateListeners(room);
          this.setupMessageListeners(room);
          this.callbacks?.onConnectionChange(true);
        }
      } catch (err) {
        const code = (err as { code?: unknown }).code;
        const message = (err as { message?: string }).message;
        console.error(
          `[GameClient] Failed to connect ${strategy.name}: code=${code} message=${message}`,
          err
        );
        if (i === 0) throw err;
      }
    }
  }

  private migratePrimary() {
    for (const idx of this.activeRooms) {
      console.log(`[GameClient] Migrating primary to room index ${idx}`);
      this.primaryIndex = idx;
      this.setupStateListeners(this.rooms[idx]);
      this.setupMessageListeners(this.rooms[idx]);
      return;
    }
    console.log("[GameClient] All rooms disconnected");
    this.callbacks?.onConnectionChange(false);
  }

  private setupStateListeners(room: Room) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const $: any = Callbacks.get(room as any);

    // Agent collection listeners
    // onAdd fires immediately for existing agents (important during migration)
    $.onAdd("agents", (agent: any, sessionId: string) => {
      if (!this.agentIndices.has(sessionId)) {
        const index = this.agentCounter++;
        this.agentIndices.set(sessionId, index);
      }

      const readAgent = (): AgentData => ({
        sessionId: agent.sessionId,
        playerId: agent.playerId,
        x: agent.x,
        y: agent.y,
        hp: agent.hp,
        maxHp: agent.maxHp,
        state: agent.state,
        currentAction: agent.currentAction,
        equippedArmor: agent.equippedArmor ?? "",
        armorDurability: agent.armorDurability ?? 0,
        avatarUrl: agent.avatarUrl ?? "",
        inventory: Array.from(agent.inventory ?? []).map((item: any) => ({
          itemId: item.itemId,
          itemType: item.itemType,
          quantity: item.quantity,
        })),
        allyStatus: agent.allyStatus ?? "neutral",
        personality: agent.personality ?? "brave",
        allyCommand: agent.allyCommand ?? "follow",
      });

      this.callbacks?.onAgentAdd(sessionId, readAgent());

      // Per-agent property change listener
      $.onChange(agent, () => {
        this.callbacks?.onAgentChange(sessionId, readAgent());
      });
    });

    $.onRemove("agents", (_agent: any, sessionId: string) => {
      this.callbacks?.onAgentRemove(sessionId);
      this.agentIndices.delete(sessionId);
    });

    // Map object collection listeners
    $.onAdd("objects", (obj: any, id: string) => {
      this.callbacks?.onObjectAdd(id, {
        id: obj.id,
        objectType: obj.objectType,
        x: obj.x,
        y: obj.y,
      });
    });

    $.onRemove("objects", (_obj: any, id: string) => {
      this.callbacks?.onObjectRemove(id);
    });

    // Zombie collection listeners
    $.onAdd("zombies", (zombie: any, id: string) => {
      const readZombie = (): ZombieData => ({
        id: zombie.id,
        zombieType: zombie.zombieType,
        x: zombie.x,
        y: zombie.y,
        hp: zombie.hp,
        maxHp: zombie.maxHp,
        state: zombie.state,
      });

      this.callbacks?.onZombieAdd?.(id, readZombie());

      $.onChange(zombie, () => {
        this.callbacks?.onZombieChange?.(id, readZombie());
      });
    });

    $.onRemove("zombies", (_zombie: any, id: string) => {
      this.callbacks?.onZombieRemove?.(id);
    });

    // Root state property listeners
    $.listen("tick", (currentTick: number) => {
      const state = room.state as any;
      this.callbacks?.onStateChange(currentTick, state.phase);
    });

    $.listen("phase", (_currentPhase: string) => {
      const state = room.state as any;
      this.callbacks?.onStateChange(state.tick, state.phase);
    });

    // Terrain data (one-time sync)
    $.listen("terrain", (terrain: string) => {
      if (terrain) {
        this.callbacks?.onTerrainData(terrain);
      }
    });

    $.listen("maxTicks", () => {});
  }

  private setupMessageListeners(room: Room) {
    room.onMessage("ATTACK_EVENT", (data) => {
      this.callbacks?.onAttackEvent(data as AttackEventData);
    });

    room.onMessage("DEATH_EVENT", (data) => {
      this.callbacks?.onDeathEvent(data as DeathEventData);
    });

    room.onMessage("LOOT_EVENT", (data) => {
      this.callbacks?.onLootEvent(data as LootEventData);
    });

    room.onMessage("HEAL_EVENT", (data) => {
      this.callbacks?.onHealEvent(data as HealEventData);
    });

    room.onMessage("EXTRACT_EVENT", (data) => {
      this.callbacks?.onExtractEvent(data as ExtractEventData);
    });

    room.onMessage("GRENADE_EVENT", (data) => {
      this.callbacks?.onGrenadeEvent(data as GrenadeEventData);
    });

    room.onMessage("TRAP_TRIGGER_EVENT", (data) => {
      this.callbacks?.onTrapTriggerEvent(data as TrapTriggerEventData);
    });

    room.onMessage("SMOKE_EVENT", (data) => {
      this.callbacks?.onSmokeEvent(data as SmokeEventData);
    });

    room.onMessage("WORLD_CONTEXT_UPDATE", (data) => {
      this.callbacks?.onWorldContextUpdate?.(data as WorldContextUpdateData);
    });

    room.onMessage("AI_STRATEGY_UPDATE", (data) => {
      const aiData = data as AIStrategyUpdateData;
      this.strategyMap.set(aiData.agentSessionId, aiData.strategyName);
      this.callbacks?.onAIStrategyUpdate?.(aiData);
    });

    room.onMessage("AI_REPLAN_START", (data) => {
      this.callbacks?.onAIReplanStart?.(data as AIReplanStartData);
    });

    room.onMessage("AI_COGNITIVE_UPDATE", (data) => {
      const cogData = data as AICognitiveUpdateData;
      this.strategyMap.set(cogData.agentSessionId, cogData.strategyName);
      this.callbacks?.onAICognitiveUpdate?.(cogData);
    });

    room.onMessage("DODGE_EVENT", (data) => {
      this.callbacks?.onDodgeEvent?.(data as DodgeEventData);
    });

    room.onMessage("ZOMBIE_ATTACK_EVENT", (data) => {
      this.callbacks?.onZombieAttackEvent?.(data as ZombieAttackEventData);
    });

    room.onMessage("ZOMBIE_DEATH_EVENT", (data) => {
      this.callbacks?.onZombieDeathEvent?.(data as ZombieDeathEventData);
    });

    room.onMessage("RECRUITMENT_DIALOGUE", (data) => {
      this.callbacks?.onRecruitmentDialogue?.(data as RecruitmentDialogueData);
    });

    room.onMessage("RECRUITMENT_RESULT", (data) => {
      this.callbacks?.onRecruitmentResult?.(data as RecruitmentResultData);
    });

    room.onMessage("EXTRACTION_ACTIVATED", (data) => {
      this.callbacks?.onExtractionActivated?.(data as { tick: number });
    });

    room.onMessage("RAID_RESULT", () => {});

    room.onMessage("INPUT_ACK", (data) => {
      const seq = (data as { seq?: number }).seq;
      if (typeof seq === "number") {
        this.inputAckHandler?.(seq);
      }
    });
  }

  getMySessionId(): string | null {
    return this.myRoom?.sessionId ?? null;
  }

  getStateFields(): { maxTicks: number; extractionActive: boolean; extractionActivatesTick: number; zombieKillCount: number; waveIntensity: number } {
    if (!this.rooms[this.primaryIndex]) return { maxTicks: 900, extractionActive: false, extractionActivatesTick: 0, zombieKillCount: 0, waveIntensity: 0 };
    const state = this.rooms[this.primaryIndex].state as any;
    return {
      maxTicks: state.maxTicks ?? 900,
      extractionActive: state.extractionActive ?? false,
      extractionActivatesTick: state.extractionActivatesTick ?? 0,
      zombieKillCount: state.zombieKillCount ?? 0,
      waveIntensity: state.waveIntensity ?? 0,
    };
  }

  sendStrategyUpdate(strategy: Strategy): void {
    if (!this.myRoom) return;
    this.myRoom.send("UPDATE_STRATEGY", { strategy });
  }

  sendPlayerMove(dx: number, dy: number, seq?: number, ts?: number): void {
    if (!this.myRoom) return;
    const payload: Record<string, unknown> = { dx, dy };
    if (seq !== undefined) payload.seq = seq;
    if (ts !== undefined) payload.ts = ts;
    this.myRoom.send("PLAYER_MOVE", payload);
  }

  sendPlayerLoot(seq?: number, ts?: number): void {
    if (!this.myRoom) return;
    const payload: Record<string, unknown> = {};
    if (seq !== undefined) payload.seq = seq;
    if (ts !== undefined) payload.ts = ts;
    this.myRoom.send("PLAYER_LOOT", payload);
  }

  sendPlayerAttack(targetSessionId: string, seq?: number, ts?: number): void {
    if (!this.myRoom) return;
    const payload: Record<string, unknown> = { targetSessionId };
    if (seq !== undefined) payload.seq = seq;
    if (ts !== undefined) payload.ts = ts;
    this.myRoom.send("PLAYER_ATTACK", payload);
  }

  sendPlayerAttackZombie(zombieId: string, seq?: number, ts?: number): void {
    if (!this.myRoom) return;
    const payload: Record<string, unknown> = { zombieId };
    if (seq !== undefined) payload.seq = seq;
    if (ts !== undefined) payload.ts = ts;
    this.myRoom.send("PLAYER_ATTACK_ZOMBIE", payload);
  }

  sendPlayerDodge(dx: number, dy: number, seq?: number, ts?: number): void {
    if (!this.myRoom) return;
    const payload: Record<string, unknown> = { dx, dy };
    if (seq !== undefined) payload.seq = seq;
    if (ts !== undefined) payload.ts = ts;
    this.myRoom.send("PLAYER_DODGE", payload);
  }

  sendInitiateRecruitment(targetSessionId?: string): void {
    if (!this.myRoom) return;
    this.myRoom.send("INITIATE_RECRUITMENT", { targetSessionId });
  }

  sendRecruitmentChoice(targetSessionId: string, choiceIndex: number): void {
    if (!this.myRoom) return;
    this.myRoom.send("RECRUITMENT_CHOICE", { targetSessionId, choiceIndex });
  }

  sendDismissRecruitment(targetSessionId: string): void {
    if (!this.myRoom) return;
    this.myRoom.send("DISMISS_RECRUITMENT", { targetSessionId });
  }

  sendAllyCommand(command: string): void {
    if (!this.myRoom) return;
    this.myRoom.send("ALLY_COMMAND", { command });
  }

  disconnect() {
    for (const room of this.rooms) {
      try {
        room.leave();
      } catch {
        // Room may already be disconnected
      }
    }
    this.rooms = [];
    this.clients = [];
    this.activeRooms.clear();
    this.strategyMap.clear();
    this.agentIndices.clear();
    this.agentCounter = 0;
    this.primaryIndex = -1;
    this.myRoom = null;
  }
}
