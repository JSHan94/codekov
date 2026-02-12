"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { GameRenderer, type TileHoverInfo } from "./GameRenderer";
import { GameClient } from "./GameClient";
import type { AICognitiveUpdateData, AIReplanStartData, CognitivePerception, CognitiveMemoryEntry, CognitiveWorldState, CognitivePlanData, WorldContextUpdateData, InventoryItemData, DodgeEventData, RecruitmentDialogueData, RecruitmentResultData, ZombieAttackEventData, ZombieDeathEventData } from "./GameClient";
import { InputManager } from "./InputManager";
import { STRATEGY_PRESETS, STRATEGY_COLORS } from "./constants";
import type { Strategy } from "./strategyTypes";
import LobbyScreen from "./LobbyScreen";
import { useAuth } from "@/lib/AuthContext";

const SERVER_URL =
  process.env.NEXT_PUBLIC_GAME_SERVER_URL || "ws://localhost:2567";

interface CognitiveStateData {
  perception: CognitivePerception;
  memory: CognitiveMemoryEntry[];
  worldState: CognitiveWorldState;
  plan: CognitivePlanData;
}

interface AgentDebugInfo {
  sessionId: string;
  strategyName: string;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  state: string;
  currentAction: string;
  equippedArmor: string;
  armorDurability: number;
  aiThinking: boolean;
  avatarUrl: string;
  inventory: InventoryItemData[];
  worldContext?: Omit<WorldContextUpdateData, "agentSessionId">;
  cognitiveState?: CognitiveStateData;
}

interface EventLogEntry {
  id: number;
  tick: number;
  type: "attack" | "death" | "loot" | "heal" | "extract" | "grenade" | "trap" | "smoke" | "ai" | "zombie_attack" | "zombie_kill" | "recruitment";
  message: string;
}

interface KillFeedEntry {
  id: number;
  killerName: string;
  killerColor: string;
  victimName: string;
  victimColor: string;
  weaponId: string;
  causeOfDeath: string;
  timestamp: number;
}

const MAX_LOG_ENTRIES = 20;
const MAX_KILL_FEED = 5;
const KILL_FEED_DURATION = 5000;

const EVENT_COLORS: Record<string, string> = {
  attack: "text-orange-400",
  death: "text-red-400",
  loot: "text-yellow-400",
  heal: "text-green-400",
  extract: "text-purple-400",
  grenade: "text-amber-400",
  trap: "text-red-300",
  smoke: "text-slate-400",
  ai: "text-purple-400",
  zombie_attack: "text-lime-400",
  zombie_kill: "text-lime-300",
  recruitment: "text-cyan-400",
};

const EVENT_BORDER_COLORS: Record<string, string> = {
  attack: "border-orange-500/50",
  death: "border-red-500/50",
  loot: "border-yellow-500/50",
  heal: "border-green-500/50",
  extract: "border-purple-500/50",
  grenade: "border-amber-500/50",
  trap: "border-red-500/50",
  smoke: "border-slate-500/50",
  ai: "border-purple-500/50",
  zombie_attack: "border-lime-500/50",
  zombie_kill: "border-lime-500/50",
  recruitment: "border-cyan-500/50",
};

const EVENT_PREFIXES: Record<string, string> = {
  attack: "[ATK]",
  death: "[KILL]",
  loot: "[LOOT]",
  heal: "[HEAL]",
  extract: "[EXIT]",
  grenade: "[GREN]",
  trap: "[TRAP]",
  smoke: "[SMOKE]",
  ai: "[AI]",
  zombie_attack: "[ZOMB]",
  zombie_kill: "[ZKILL]",
  recruitment: "[ALLY]",
};

type GamePhase = "lobby" | "playing";

export default function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const eventIdRef = useRef(0);
  const killIdRef = useRef(0);
  const clientRef = useRef<GameClient | null>(null);

  const { user, session } = useAuth();
  const rawAvatar = user?.user_metadata?.avatar_url;
  const avatarUrl = typeof rawAvatar === "string" ? rawAvatar : undefined;
  const rawName = user?.email || user?.user_metadata?.name;
  const userName = typeof rawName === "string" ? rawName : undefined;
  const accessToken = session?.access_token;

  const [gamePhase, setGamePhase] = useState<GamePhase>("lobby");
  const [myStrategy, setMyStrategy] = useState<Strategy>(
    () => structuredClone(STRATEGY_PRESETS[0]) as Strategy
  );
  const [aiMode, setAiMode] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const [hud, setHud] = useState({
    tick: 0,
    phase: "waiting",
    connected: false,
    agentCount: 0,
    maxTicks: 400,
  });
  const [extractionCount, setExtractionCount] = useState(0);
  const [zombieCount, setZombieCount] = useState(0);
  const [zombieKillCount, setZombieKillCount] = useState(0);
  const [waveIntensity, setWaveIntensity] = useState(0);
  const [extractionActive, setExtractionActive] = useState(false);
  const [extractionActivatesTick, setExtractionActivatesTick] = useState(0);
  const [allyCount, setAllyCount] = useState(0);
  const [recruitmentDialogue, setRecruitmentDialogue] = useState<RecruitmentDialogueData | null>(null);
  const [recruitmentResult, setRecruitmentResult] = useState<{success: boolean; message: string} | null>(null);
  const liveObjectsRef = useRef(new Map<string, string>());

  const [agentInfos, setAgentInfos] = useState<
    Record<string, AgentDebugInfo>
  >({});
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [killFeed, setKillFeed] = useState<KillFeedEntry[]>([]);
  const [cognitiveModalAgent, setCognitiveModalAgent] = useState<string | null>(null);
  const [hoveredTile, setHoveredTile] = useState<TileHoverInfo | null>(null);
  const [playerDead, setPlayerDead] = useState(false);
  const [spectatorMode, setSpectatorMode] = useState(false);
  const rendererRef = useRef<GameRenderer | null>(null);
  const inputManagerRef = useRef<InputManager | null>(null);

  const handleStartRaid = useCallback((strategy: Strategy, isAiMode: boolean) => {
    setMyStrategy(strategy);
    setAiMode(isAiMode);
    setGamePhase("playing");
  }, []);

  const handleSpectatorMode = useCallback(() => {
    setSpectatorMode(true);
    setPlayerDead(false);
    rendererRef.current?.setSpectatorMode(true);
    inputManagerRef.current?.disable();
  }, []);

  const handleNewGame = useCallback(() => {
    setPlayerDead(false);
    setSpectatorMode(false);
    setGamePhase("lobby");
  }, []);

  const handleStrategyApply = useCallback((strategy: Strategy) => {
    setMyStrategy(strategy);
    setEditorOpen(false);
    clientRef.current?.sendStrategyUpdate(strategy);
  }, []);

  // Auto-scroll event log (only if near bottom)
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const isNearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [eventLog]);

  // Auto-expire kill feed entries
  useEffect(() => {
    if (killFeed.length === 0) return;
    const oldest = killFeed[0];
    const remaining = KILL_FEED_DURATION - (Date.now() - oldest.timestamp);
    const timeout = setTimeout(() => {
      setKillFeed((prev) => prev.slice(1));
    }, Math.max(0, remaining));
    return () => clearTimeout(timeout);
  }, [killFeed]);

  useEffect(() => {
    if (gamePhase !== "playing") return;

    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let renderer: GameRenderer | null = null;
    let client: GameClient | null = null;
    let inputManager: InputManager | null = null;
    let agentCount = 0;

    // Track rendered entities (idempotent during primary migration)
    const renderedAgents = new Set<string>();
    const renderedObjects = new Set<string>();

    // Cache agent positions for visual effects
    const agentPositions = new Map<string, { x: number; y: number }>();

    const addLogEntry = (
      type: EventLogEntry["type"],
      tick: number,
      message: string
    ) => {
      if (cancelled) return;
      const id = eventIdRef.current++;
      setEventLog((prev) => {
        const next = [...prev, { id, tick, type, message }];
        return next.length > MAX_LOG_ENTRIES
          ? next.slice(-MAX_LOG_ENTRIES)
          : next;
      });
    };

    const addKillEntry = (
      killerSessionId: string | null,
      victimSessionId: string,
      weaponId: string,
      causeOfDeath: string,
    ) => {
      if (cancelled) return;
      const killerStrategy = killerSessionId
        ? client?.getStrategyName(killerSessionId) || "?"
        : causeOfDeath || "?";
      const victimStrategy = client?.getStrategyName(victimSessionId) || "?";
      const killerName = killerSessionId
        ? `${killerSessionId.slice(0, 4)}[${killerStrategy}]`
        : causeOfDeath || "environment";
      const victimName = `${victimSessionId.slice(0, 4)}[${victimStrategy}]`;

      const id = killIdRef.current++;
      setKillFeed((prev) => {
        const next = [
          ...prev,
          {
            id,
            killerName,
            killerColor: killerSessionId
              ? STRATEGY_COLORS[killerStrategy] || "#888"
              : "#ff4444",
            victimName,
            victimColor: STRATEGY_COLORS[victimStrategy] || "#888",
            weaponId,
            causeOfDeath,
            timestamp: Date.now(),
          },
        ];
        return next.length > MAX_KILL_FEED
          ? next.slice(-MAX_KILL_FEED)
          : next;
      });
    };

    const getLabel = (sessionId: string) => {
      const strategy = client?.getStrategyName(sessionId) || "?";
      return `${sessionId.slice(0, 4)}[${strategy}]`;
    };

    async function start() {
      renderer = new GameRenderer();
      client = new GameClient();

      client.setCallbacks({
        onAgentAdd(sessionId, agent) {
          if (cancelled) return;
          // Idempotent: skip if already rendered (happens during migration)
          if (!renderedAgents.has(sessionId)) {
            const index = client!.getAgentIndex(sessionId);
            renderer!.addAgent(sessionId, agent.x, agent.y, index, agent.avatarUrl);
            renderedAgents.add(sessionId);
            agentCount++;
            setHud((prev) => ({ ...prev, agentCount }));
          }
          agentPositions.set(sessionId, { x: agent.x, y: agent.y });
          // Always update debug info
          const strategyName = client!.getStrategyName(sessionId);
          setAgentInfos((prev) => ({
            ...prev,
            [sessionId]: {
              sessionId,
              strategyName,
              hp: agent.hp,
              maxHp: agent.maxHp,
              x: agent.x,
              y: agent.y,
              state: agent.state,
              currentAction: agent.currentAction,
              equippedArmor: agent.equippedArmor,
              armorDurability: agent.armorDurability,
              aiThinking: false,
              avatarUrl: agent.avatarUrl,
              inventory: agent.inventory,
            },
          }));
        },

        onAgentChange(sessionId, agent) {
          if (cancelled) return;
          renderer!.updateAgent(
            sessionId,
            agent.x,
            agent.y,
            agent.hp,
            agent.maxHp,
            agent.state,
            agent.armorDurability
          );
          agentPositions.set(sessionId, { x: agent.x, y: agent.y });
          // Detect player death
          if (sessionId === client!.getMySessionId() && agent.state === "dead") {
            setPlayerDead(true);
          }
          const strategyName = client!.getStrategyName(sessionId);
          setAgentInfos((prev) => ({
            ...prev,
            [sessionId]: {
              sessionId,
              strategyName,
              hp: agent.hp,
              maxHp: agent.maxHp,
              x: agent.x,
              y: agent.y,
              state: agent.state,
              currentAction: agent.currentAction,
              equippedArmor: agent.equippedArmor,
              armorDurability: agent.armorDurability,
              aiThinking: prev[sessionId]?.aiThinking ?? false,
              avatarUrl: agent.avatarUrl,
              inventory: agent.inventory,
              worldContext: prev[sessionId]?.worldContext,
              cognitiveState: prev[sessionId]?.cognitiveState,
            },
          }));
        },

        onAgentRemove(sessionId) {
          if (cancelled) return;
          renderer!.removeAgent(sessionId);
          renderedAgents.delete(sessionId);
          agentPositions.delete(sessionId);
          agentCount = Math.max(0, agentCount - 1);
          setHud((prev) => ({ ...prev, agentCount }));
          setAgentInfos((prev) => {
            const next = { ...prev };
            delete next[sessionId];
            return next;
          });
        },

        onObjectAdd(id, obj) {
          if (cancelled) return;
          liveObjectsRef.current.set(id, obj.objectType);
          if (obj.objectType === "EXTRACTION") {
            setExtractionCount((c) => c + 1);
          }
          if (!renderedObjects.has(id)) {
            renderer!.addObject(id, obj.objectType, obj.x, obj.y);
            renderedObjects.add(id);
          }
        },

        onObjectRemove(id) {
          if (cancelled) return;
          const objType = liveObjectsRef.current.get(id);
          liveObjectsRef.current.delete(id);
          if (objType === "EXTRACTION") {
            setExtractionCount((c) => Math.max(0, c - 1));
          }
          renderer!.removeObject(id);
          renderedObjects.delete(id);
        },

        onStateChange(tick, phase) {
          if (cancelled) return;
          const fields = client!.getStateFields();
          setHud((prev) => ({ ...prev, tick, phase, ...fields }));
          // Update zombie/extraction HUD
          if ('zombieKillCount' in fields) setZombieKillCount(fields.zombieKillCount as number);
          if ('waveIntensity' in fields) setWaveIntensity(fields.waveIntensity as number);
          if ('extractionActive' in fields) setExtractionActive(fields.extractionActive as boolean);
          if ('extractionActivatesTick' in fields) setExtractionActivatesTick(fields.extractionActivatesTick as number);
        },

        onTerrainData(terrain) {
          if (cancelled) return;
          renderer!.setTerrain(terrain);
        },

        onAttackEvent(data) {
          if (cancelled) return;
          // Visual effects
          const atkPos = agentPositions.get(data.attackerSessionId);
          const defPos = agentPositions.get(data.defenderSessionId);
          if (atkPos && defPos) {
            renderer!.showAttackEffect(
              atkPos.x,
              atkPos.y,
              defPos.x,
              defPos.y,
              data.hit,
              data.damage,
              data.armorAbsorbed
            );
          }
          // Log
          const atk = getLabel(data.attackerSessionId);
          const def = getLabel(data.defenderSessionId);
          const hitStr = data.hit ? `${data.damage}dmg` : "miss";
          const armorStr =
            data.armorAbsorbed > 0 ? ` [${data.armorAbsorbed} blocked]` : "";
          addLogEntry(
            "attack",
            data.tick,
            `${atk} -> ${def} (${data.weaponId}, ${hitStr}${armorStr})`
          );
        },

        onDeathEvent(data) {
          if (cancelled) return;
          // Visual effect
          const victimPos = agentPositions.get(data.victimSessionId);
          if (victimPos) {
            renderer!.showDeathEffect(victimPos.x, victimPos.y);
          }
          // Kill feed
          addKillEntry(
            data.killerSessionId,
            data.victimSessionId,
            data.weaponId || "",
            data.causeOfDeath || ""
          );
          // Log
          const victim = getLabel(data.victimSessionId);
          const killer = data.killerSessionId
            ? getLabel(data.killerSessionId)
            : data.causeOfDeath || "disconnect";
          addLogEntry("death", data.tick, `${victim} killed by ${killer}`);
        },

        onLootEvent(data) {
          if (cancelled) return;
          const agent = getLabel(data.agentSessionId);
          const items = data.items.map((i) => i.itemId).join(", ");
          addLogEntry("loot", data.tick, `${agent} looted ${items}`);
        },

        onHealEvent(data) {
          if (cancelled) return;
          // Visual effect
          const pos = agentPositions.get(data.agentSessionId);
          if (pos) {
            renderer!.showHealEffect(pos.x, pos.y, data.healAmount);
          }
          const agent = getLabel(data.agentSessionId);
          addLogEntry(
            "heal",
            data.tick,
            `${agent} healed +${data.healAmount}hp (${data.hpAfter}hp)`
          );
        },

        onExtractEvent(data) {
          if (cancelled) return;
          const agent = getLabel(data.agentSessionId);
          addLogEntry(
            "extract",
            data.tick,
            `${agent} extracted with ${data.itemCount} items`
          );
        },

        onGrenadeEvent(data) {
          if (cancelled) return;
          renderer!.showGrenadeEffect(data.x, data.y, data.radius);
          const thrower = getLabel(data.throwerSessionId);
          const hitCount = data.victims.length;
          addLogEntry(
            "grenade",
            data.tick,
            `${thrower} grenade hit ${hitCount} agent${hitCount !== 1 ? "s" : ""}`
          );
        },

        onTrapTriggerEvent(data) {
          if (cancelled) return;
          const victim = getLabel(data.victimSessionId);
          addLogEntry(
            "trap",
            data.tick,
            `${victim} triggered trap (${data.damage}dmg, ${data.hpAfter}hp)`
          );
        },

        onSmokeEvent(data) {
          if (cancelled) return;
          const thrower = getLabel(data.throwerSessionId);
          addLogEntry(
            "smoke",
            data.tick,
            `${thrower} deployed smoke at (${data.x},${data.y})`
          );
        },

        onWorldContextUpdate(data: WorldContextUpdateData) {
          if (cancelled) return;
          const { agentSessionId, ...ctx } = data;
          setAgentInfos((prev) => {
            const existing = prev[agentSessionId];
            if (!existing) return prev;
            return {
              ...prev,
              [agentSessionId]: { ...existing, worldContext: ctx },
            };
          });
        },

        onAIReplanStart(data: AIReplanStartData) {
          if (cancelled) return;
          setAgentInfos((prev) => {
            const existing = prev[data.agentSessionId];
            if (!existing) return prev;
            return {
              ...prev,
              [data.agentSessionId]: { ...existing, aiThinking: true },
            };
          });
        },

        onAIStrategyUpdate(data) {
          if (cancelled) return;
          const agent = getLabel(data.agentSessionId);
          addLogEntry("ai", data.tick, `${agent} strategy updated: ${data.strategyName}`);
          // Update strategy name in agent info
          setAgentInfos((prev) => {
            const existing = prev[data.agentSessionId];
            if (!existing) return prev;
            return {
              ...prev,
              [data.agentSessionId]: {
                ...existing,
                strategyName: data.strategyName,
                aiThinking: false,
              },
            };
          });
        },

        onAICognitiveUpdate(data: AICognitiveUpdateData) {
          if (cancelled) return;
          const agent = getLabel(data.agentSessionId);
          addLogEntry("ai", data.tick, `${agent} cognitive update: ${data.strategyName}`);
          setAgentInfos((prev) => {
            const existing = prev[data.agentSessionId];
            if (!existing) return prev;
            return {
              ...prev,
              [data.agentSessionId]: {
                ...existing,
                strategyName: data.strategyName,
                aiThinking: false,
                cognitiveState: data.cognitive,
              },
            };
          });
        },

        onDodgeEvent(data: DodgeEventData) {
          if (cancelled) return;
          renderer!.showDodgeEffect(data.x, data.y);
          const agent = getLabel(data.agentSessionId);
          addLogEntry("attack", data.tick, `${agent} dodged!`);
        },

        onZombieAdd(id, zombie) {
          if (cancelled) return;
          renderer!.addZombie(id, zombie.x, zombie.y);
          setZombieCount((c) => c + 1);
        },

        onZombieChange(id, zombie) {
          if (cancelled) return;
          renderer!.updateZombie(id, zombie.x, zombie.y, zombie.hp, zombie.maxHp, zombie.state);
        },

        onZombieRemove(id) {
          if (cancelled) return;
          renderer!.removeZombie(id);
          setZombieCount((c) => Math.max(0, c - 1));
        },

        onZombieAttackEvent(data) {
          if (cancelled) return;
          const victim = getLabel(data.targetSessionId);
          addLogEntry("zombie_attack", data.tick, `Zombie attacked ${victim} for ${data.damage}dmg`);
        },

        onZombieDeathEvent(data) {
          if (cancelled) return;
          const killer = data.killerSessionId ? getLabel(data.killerSessionId) : "unknown";
          addLogEntry("zombie_kill", data.tick, `${killer} killed zombie (${data.zombieId})`);
        },

        onRecruitmentDialogue(data) {
          if (cancelled) return;
          setRecruitmentDialogue(data);
          setRecruitmentResult(null);
        },

        onRecruitmentResult(data) {
          if (cancelled) return;
          setRecruitmentResult({ success: data.success, message: data.responseLine });
          // Auto-close after 2 seconds
          setTimeout(() => {
            setRecruitmentDialogue(null);
            setRecruitmentResult(null);
          }, 2000);
          if (data.success) {
            addLogEntry("recruitment", 0, `Recruited ${data.targetSessionId}!`);
          } else {
            addLogEntry("recruitment", 0, `Failed to recruit ${data.targetSessionId}`);
          }
        },

        onExtractionActivated() {
          if (cancelled) return;
          setExtractionActive(true);
          addLogEntry("extract", 0, "Extraction points are now active!");
        },

        onConnectionChange(connected) {
          if (cancelled) return;
          setHud((prev) => ({ ...prev, connected }));
        },
      });

      await renderer.init(container!);
      if (cancelled) {
        renderer.destroy();
        return;
      }
      rendererRef.current = renderer;

      renderer.setTileHoverCallback((info) => {
        if (cancelled) return;
        setHoveredTile(info);
      });

      clientRef.current = client;

      try {
        // In manual mode, only connect 1 client (server spawns AI bots)
        // In AI mode, connect all strategy presets as separate clients
        const strategies = aiMode
          ? [myStrategy, ...(STRATEGY_PRESETS.slice(1) as Strategy[])]
          : [myStrategy];
        await client.connectMultiple(SERVER_URL, strategies, aiMode, avatarUrl, accessToken, !aiMode);

        // Pass player session ID to renderer for fog of war
        const myId = client.getMySessionId();
        if (myId) {
          renderer!.setPlayerSessionId(myId);
        }

        // Enable manual control input (only in manual mode)
        if (!cancelled && !aiMode) {
          inputManager = new InputManager(client, renderer!, container!);
          inputManager.enable();
          inputManagerRef.current = inputManager;
        }
      } catch (err) {
        console.error("Connection failed:", err);
      }
    }

    start();

    return () => {
      cancelled = true;
      inputManager?.destroy();
      inputManagerRef.current = null;
      client?.disconnect();
      clientRef.current = null;
      renderer?.destroy();
      rendererRef.current = null;
      liveObjectsRef.current.clear();
      setExtractionCount(0);
      setZombieCount(0);
      setZombieKillCount(0);
      setWaveIntensity(0);
      setExtractionActive(false);
      setRecruitmentDialogue(null);
      setRecruitmentResult(null);
      setPlayerDead(false);
      setSpectatorMode(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamePhase]);

  const mySessionId = clientRef.current?.getMySessionId() ?? null;

  const playerCounts = useMemo(() => {
    let alive = 0, dead = 0, extracted = 0;
    for (const agent of Object.values(agentInfos)) {
      if (agent.state === "dead") dead++;
      else if (agent.state === "extracted") extracted++;
      else alive++;
    }
    return { alive, dead, extracted };
  }, [agentInfos]);

  const computedAllyCount = useMemo(() => {
    let count = 0;
    for (const agent of Object.values(agentInfos)) {
      // Check worldContext for ally_count since AgentDebugInfo doesn't have allyStatus directly
      if (agent.worldContext && 'ally_count' in agent.worldContext) {
        return agent.worldContext.ally_count as number;
      }
    }
    return count;
  }, [agentInfos]);

  const sortedAgents = Object.values(agentInfos).sort((a, b) => {
    const aIdx = STRATEGY_PRESETS.findIndex((p) => p.name === a.strategyName);
    const bIdx = STRATEGY_PRESETS.findIndex((p) => p.name === b.strategyName);
    return aIdx - bIdx;
  });

  if (gamePhase === "lobby") {
    return <LobbyScreen onStartRaid={handleStartRaid} avatarUrl={avatarUrl} userName={userName} />;
  }

  return (
    <>
      <div className="flex w-full h-full overflow-hidden bg-[#1a1a2e]">
        {/* Canvas Area */}
        <div className="flex-1 relative min-w-0">
          <div ref={containerRef} className="w-full h-full" />

          {/* HUD Overlay */}
          <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-sm text-white px-4 py-3 rounded-lg font-mono text-xs space-y-2 min-w-[200px] border border-white/10">
            {/* Connection + Phase */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    hud.connected ? "bg-green-400" : "bg-red-400"
                  }`}
                />
                <span className="text-white/70 text-[10px]">{hud.phase.toUpperCase()}</span>
              </div>
            </div>

            {/* Tick Progress */}
            <div>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span>Tick: {hud.tick}/{hud.maxTicks}</span>
                <span className="text-white/40">{((hud.tick / hud.maxTicks) * 100).toFixed(0)}%</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (hud.tick / hud.maxTicks) * 100)}%` }}
                />
              </div>
            </div>

            {/* Player Counts */}
            <div className="flex gap-3 text-[10px]">
              <span className="text-green-400">{playerCounts.alive} alive</span>
              <span className="text-red-400">{playerCounts.dead} dead</span>
              <span className="text-purple-400">{playerCounts.extracted} out</span>
            </div>

            {/* Extractions */}
            {extractionCount > 0 && (
              <div className="text-[10px] text-yellow-400/80">
                Extractions: {extractionCount} active
              </div>
            )}

            {/* Zombie Wave Info */}
            <div className="flex gap-3 text-[10px]">
              <span className="text-lime-400">{zombieKillCount} kills</span>
              <span className="text-lime-300">{zombieCount} active</span>
            </div>

            {/* Wave Intensity Bar */}
            <div>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span>Wave: {(waveIntensity * 100).toFixed(0)}%</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, waveIntensity * 100)}%`,
                    backgroundColor: waveIntensity > 0.7 ? "#ef4444" : waveIntensity > 0.4 ? "#eab308" : "#22c55e",
                  }}
                />
              </div>
            </div>

            {/* Extraction Timer */}
            {!extractionActive && extractionActivatesTick > 0 && (
              <div className="text-[10px] text-purple-400/80">
                Extraction in: {Math.max(0, extractionActivatesTick - hud.tick)} ticks
              </div>
            )}
            {extractionActive && (
              <div className="text-[10px] text-purple-400 animate-pulse">
                Extraction ACTIVE!
              </div>
            )}
          </div>

          {/* Kill Feed (top-right) */}
          <div className="absolute top-4 right-4 flex flex-col gap-1 pointer-events-none">
            {killFeed.map((entry) => (
              <KillFeedLine key={entry.id} entry={entry} />
            ))}
          </div>

          {/* Control Hints (only in manual mode, not spectating) */}
          {!aiMode && !spectatorMode && (
            <div className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none">
              <div className="bg-black/60 text-white font-mono text-[10px] px-3 py-1.5 rounded flex gap-4 flex-wrap justify-center">
                <span><kbd className="px-1 py-0.5 bg-white/20 rounded text-[9px]">WASD</kbd> Move</span>
                <span><kbd className="px-1 py-0.5 bg-white/20 rounded text-[9px]">F</kbd> Loot</span>
                <span><kbd className="px-1 py-0.5 bg-white/20 rounded text-[9px]">Click</kbd> Attack</span>
                <span><kbd className="px-1 py-0.5 bg-white/20 rounded text-[9px]">Space</kbd> Dodge</span>
                <span><kbd className="px-1 py-0.5 bg-cyan-500/30 rounded text-[9px]">E</kbd> Recruit</span>
                <span><kbd className="px-1 py-0.5 bg-lime-500/30 rounded text-[9px]">1</kbd><kbd className="px-1 py-0.5 bg-lime-500/30 rounded text-[9px]">2</kbd><kbd className="px-1 py-0.5 bg-lime-500/30 rounded text-[9px]">3</kbd> Ally Cmd</span>
              </div>
            </div>
          )}

          {/* Tile Info Bar */}
          <div className="absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur-sm text-white font-mono text-xs px-4 py-2 flex items-center gap-4 border-t border-white/10">
            {hoveredTile ? (
              <TileInfoContent info={hoveredTile} />
            ) : (
              <span className="text-white/40">Scroll to zoom | Drag to pan | Hover tiles for info</span>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-72 flex flex-col border-l border-white/10 bg-black/40">
          {/* Agent Debug Cards */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <div className="text-white/50 text-xs font-mono uppercase tracking-wider mb-2">
              Agents
            </div>
            {sortedAgents.map((agent) => {
              const isMyAgent = agent.sessionId === mySessionId;
              return (
                <AgentCard
                  key={agent.sessionId}
                  agent={agent}
                  isMyAgent={isMyAgent}
                  onClick={() => setCognitiveModalAgent(agent.sessionId)}
                />
              );
            })}
            {sortedAgents.length === 0 && (
              <div className="text-white/30 text-xs font-mono text-center py-4">
                Waiting for agents...
              </div>
            )}
          </div>

          {/* Event Log */}
          <div className="border-t border-white/10">
            <div className="text-white/50 text-xs font-mono uppercase tracking-wider px-3 pt-2 pb-1">
              Event Log
            </div>
            <div
              ref={logRef}
              className="h-48 overflow-y-auto px-3 pb-2 space-y-0.5"
            >
              {eventLog.map((entry) => (
                <EventLogLine key={entry.id} entry={entry} />
              ))}
              {eventLog.length === 0 && (
                <div className="text-white/20 text-xs font-mono text-center py-4">
                  No events yet
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {editorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setEditorOpen(false)}
        >
          <div
            className="rounded-xl border border-white/10 bg-[#1a1a2e] p-5 font-mono"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 text-xs text-white/50">Switch Strategy</div>
            <div className="flex gap-2">
              {STRATEGY_PRESETS.map((preset, i) => {
                const color = STRATEGY_COLORS[preset.name] ?? "#888";
                const active = preset.name === myStrategy.name;
                return (
                  <button
                    key={preset.name}
                    onClick={() => handleStrategyApply(STRATEGY_PRESETS[i] as Strategy)}
                    className={`w-24 rounded-lg border p-2.5 text-left text-xs transition-all ${
                      active
                        ? "border-white/30 bg-white/10"
                        : "border-white/5 bg-white/[0.02] hover:bg-white/5"
                    }`}
                    style={{ borderBottom: `3px solid ${active ? color : "transparent"}` }}
                  >
                    <div className="font-bold" style={active ? { color } : { color: "rgba(255,255,255,0.5)" }}>
                      {preset.name}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {cognitiveModalAgent && agentInfos[cognitiveModalAgent] && (
        <AgentInfoModal
          agent={agentInfos[cognitiveModalAgent]}
          onClose={() => setCognitiveModalAgent(null)}
        />
      )}

      {/* Death Modal */}
      {playerDead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="rounded-xl border border-red-500/30 bg-gray-900/95 backdrop-blur p-8 font-mono text-center max-w-sm">
            <div className="text-red-500 text-4xl font-bold mb-2">YOU DIED</div>
            <p className="text-white/50 text-sm mb-6">Your agent has been eliminated.</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleSpectatorMode}
                className="rounded-lg bg-white/10 border border-white/20 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/20 transition-colors"
              >
                Spectate
              </button>
              <button
                onClick={handleNewGame}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition-colors"
              >
                New Game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spectator Mode Indicator */}
      {spectatorMode && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 bg-black/80 border border-white/20 rounded-lg px-4 py-2 font-mono text-xs text-white/70 flex items-center gap-3">
          <span>SPECTATOR MODE</span>
          <button
            onClick={handleNewGame}
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            New Game
          </button>
        </div>
      )}

      {/* Recruitment Dialogue */}
      {recruitmentDialogue && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 bg-gray-900/95 border border-cyan-500/30 rounded-xl px-6 py-4 font-mono max-w-md w-full backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-cyan-400 font-bold text-sm">{recruitmentDialogue.displayName}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-900/50 text-cyan-300">
              {recruitmentDialogue.personality}
            </span>
          </div>
          {recruitmentDialogue.dialogueLines.map((line, i) => (
            <p key={i} className="text-white/80 text-sm mb-2 italic">&quot;{line}&quot;</p>
          ))}
          {recruitmentResult ? (
            <div className={`text-center py-2 font-bold ${recruitmentResult.success ? "text-green-400" : "text-red-400"}`}>
              {recruitmentResult.message}
            </div>
          ) : (
            <div className="flex gap-2 mt-3">
              {recruitmentDialogue.choices.map((choice, i) => (
                <button
                  key={i}
                  onClick={() => clientRef.current?.sendRecruitmentChoice(recruitmentDialogue!.targetSessionId, i)}
                  className="flex-1 rounded-lg border border-cyan-500/30 bg-cyan-900/20 px-3 py-2 text-xs text-cyan-200 hover:bg-cyan-800/30 transition-colors"
                >
                  {choice.text}
                  <span className="block text-[10px] text-white/40 mt-0.5">{(choice.successChance * 100).toFixed(0)}% chance</span>
                </button>
              ))}
              <button
                onClick={() => {
                  clientRef.current?.sendDismissRecruitment(recruitmentDialogue!.targetSessionId);
                  setRecruitmentDialogue(null);
                }}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/50 hover:bg-white/10 transition-colors"
              >
                Leave
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

const TERRAIN_INFO: Record<number, { icon: string; name: string; colorClass: string; description: string }> = {
  0: { icon: "\u00b7", name: "Floor", colorClass: "text-white/50", description: "Passable ground tile" },
  1: { icon: "#", name: "Wall", colorClass: "text-red-400", description: "Impassable \u2014 blocks movement" },
  2: { icon: "+", name: "Cover", colorClass: "text-blue-400", description: "Passable \u2014 reduces hit chance by 15%" },
  3: { icon: "~", name: "Bush", colorClass: "text-green-400", description: "Passable \u2014 reduces enemy detection range by 5" },
};

const OBJECT_LABELS: Record<string, string> = {
  LOOT_BOX: "Loot Box",
  CORPSE: "Corpse (lootable)",
  EXTRACTION: "Extraction Point (1-use)",
  SMOKE: "Smoke Cloud",
  TRAP: "Trap",
};

function TileInfoContent({ info }: { info: TileHoverInfo }) {
  const terrain = TERRAIN_INFO[info.terrainType] ?? TERRAIN_INFO[0];
  return (
    <>
      <span className="text-white/50">({info.tileX}, {info.tileY})</span>
      <span className={terrain.colorClass}>
        {terrain.icon} {terrain.name}
      </span>
      <span className="text-white/60">{terrain.description}</span>
      {info.objectType && (
        <span className="text-yellow-400">| {OBJECT_LABELS[info.objectType] ?? info.objectType}</span>
      )}
      {info.agentSessionId && (
        <span className="text-purple-400">| Agent {info.agentSessionId.slice(0, 6)}</span>
      )}
    </>
  );
}

function AgentCard({
  agent,
  isMyAgent = false,
  onClick,
}: {
  agent: AgentDebugInfo;
  isMyAgent?: boolean;
  onClick?: () => void;
}) {
  const color = STRATEGY_COLORS[agent.strategyName] || "#888";
  const hpPercent = agent.maxHp > 0 ? (agent.hp / agent.maxHp) * 100 : 0;
  const isDead = agent.state === "dead";
  const isExtracted = agent.state === "extracted";

  return (
    <div
      className={`rounded-lg p-2.5 font-mono text-xs cursor-pointer hover:bg-white/10 ${
        isDead
          ? "bg-red-950/40 opacity-60"
          : isExtracted
            ? "bg-green-950/40 opacity-60"
            : "bg-white/5"
      } ${isMyAgent ? "ring-1 ring-blue-500/50" : ""}`}
      style={{ borderLeft: `3px solid ${color}` }}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-bold" style={{ color }}>
          {agent.strategyName}
          {isMyAgent && (
            <span className="ml-1 text-[10px] text-blue-400 font-normal">(YOU)</span>
          )}
        </span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded ${
            isDead
              ? "bg-red-900/50 text-red-400"
              : isExtracted
                ? "bg-green-900/50 text-green-400"
                : "bg-white/10 text-white/70"
          }`}
        >
          {agent.state.toUpperCase()}
        </span>
      </div>

      {/* HP Bar */}
      <div className="h-1.5 bg-white/10 rounded-full mb-1 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${hpPercent}%`,
            backgroundColor:
              hpPercent > 50
                ? "#22c55e"
                : hpPercent > 25
                  ? "#eab308"
                  : "#ef4444",
          }}
        />
      </div>

      {/* Armor Bar */}
      {agent.armorDurability > 0 && (
        <div className="h-1 bg-white/10 rounded-full mb-1 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300 bg-blue-500"
            style={{
              width: `${Math.min(100, agent.armorDurability)}%`,
            }}
          />
        </div>
      )}

      {/* Info */}
      <div className="flex justify-between text-white/50">
        <span>
          HP: {agent.hp}/{agent.maxHp}
        </span>
        <span>
          ({agent.x}, {agent.y})
        </span>
      </div>
      {agent.equippedArmor && (
        <div className="text-blue-400/70 mt-0.5 truncate text-[10px]">
          Armor: {agent.equippedArmor} ({agent.armorDurability})
        </div>
      )}
      <div className="text-white/40 mt-0.5 truncate">
        Action: {agent.currentAction}
      </div>

      {/* Inventory summary */}
      {agent.inventory.length > 0 && (
        <div className="text-yellow-400/70 mt-0.5 text-[10px] truncate">
          Inv: {agent.inventory.length} items ({agent.inventory.reduce((s, i) => s + i.quantity, 0)} total)
        </div>
      )}

      {/* WorldContext: nearby threats/loot */}
      {agent.worldContext && !isDead && !isExtracted && (
        <div className="mt-1 pt-1 border-t border-white/5 space-y-0.5 text-[10px]">
          <div className="flex gap-2">
            {agent.worldContext.has_cover ? <span className="text-blue-400">Cover</span> : null}
          </div>
          <div className="flex gap-3 text-white/50">
            <span>
              <span className="text-red-400">{agent.worldContext.nearby_enemy_count}</span> enemies
              {agent.worldContext.nearest_enemy_distance < 9999 && (
                <span className="text-white/30"> ({agent.worldContext.nearest_enemy_distance}t)</span>
              )}
            </span>
            <span>
              <span className="text-yellow-400">{agent.worldContext.nearby_loot_count}</span> loot
            </span>
          </div>
          <div className="flex gap-3 text-white/50">
            <span>
              <span className="text-lime-400">{agent.worldContext.nearby_zombie_count ?? 0}</span> zombies
              {(agent.worldContext.nearest_zombie_distance ?? 9999) < 9999 && (
                <span className="text-white/30"> ({agent.worldContext.nearest_zombie_distance}t)</span>
              )}
            </span>
            <span>
              <span className="text-cyan-400">{agent.worldContext.ally_count ?? 0}</span> allies
            </span>
          </div>
        </div>
      )}

      {agent.aiThinking && (
        <div className="text-purple-400 mt-0.5 text-[10px] animate-pulse">
          AI Thinking...
        </div>
      )}
      {agent.strategyName.startsWith("AI-") && !agent.aiThinking && (
        <div className="text-purple-400/50 mt-0.5 text-[10px]">
          AI Mode
        </div>
      )}
      <div className="text-white/30 mt-0.5 truncate text-[10px]">
        {agent.sessionId.slice(0, 8)}
      </div>
    </div>
  );
}

function EventLogLine({ entry }: { entry: EventLogEntry }) {
  return (
    <div
      className={`text-[11px] font-mono leading-tight border-l-2 pl-1.5 ${EVENT_COLORS[entry.type] || "text-white/50"} ${EVENT_BORDER_COLORS[entry.type] || "border-white/20"}`}
    >
      <span className="text-white/30 mr-1">T{entry.tick}</span>
      <span className="mr-1">{EVENT_PREFIXES[entry.type]}</span>
      {entry.message}
    </div>
  );
}

function KillFeedLine({ entry }: { entry: KillFeedEntry }) {
  return (
    <div className="bg-black/80 backdrop-blur-sm px-3 py-1.5 rounded font-mono text-xs flex items-center gap-1.5 animate-[fadeIn_0.2s_ease-out]">
      <span className="font-bold" style={{ color: entry.killerColor }}>
        {entry.killerName}
      </span>
      <span className="text-white/40">
        {entry.weaponId ? `\u2500[${entry.weaponId}]\u2192` : "\u2500\u2192"}
      </span>
      <span className="font-bold" style={{ color: entry.victimColor }}>
        {entry.victimName}
      </span>
    </div>
  );
}

// ─── Threat level bar colors ───
const THREAT_COLORS: Record<string, string> = {
  low: "#22c55e",
  medium: "#eab308",
  high: "#f97316",
  critical: "#ef4444",
};

const THREAT_PERCENTS: Record<string, number> = {
  low: 25,
  medium: 50,
  high: 75,
  critical: 100,
};

const RESOURCE_COLORS: Record<string, string> = {
  abundant: "#22c55e",
  sufficient: "#eab308",
  scarce: "#f97316",
  depleted: "#ef4444",
};

const RESOURCE_PERCENTS: Record<string, number> = {
  abundant: 100,
  sufficient: 66,
  scarce: 33,
  depleted: 10,
};

const MEMORY_COLORS: Record<string, string> = {
  combat: "text-red-400",
  loot: "text-yellow-400",
  movement: "text-blue-400",
  observation: "text-slate-400",
};

function AgentInfoModal({
  agent,
  onClose,
}: {
  agent: AgentDebugInfo;
  onClose: () => void;
}) {
  const cog = agent.cognitiveState;
  const color = STRATEGY_COLORS[agent.strategyName] || "#888";
  const hpPercent = agent.maxHp > 0 ? (agent.hp / agent.maxHp) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="rounded-xl border border-white/10 bg-gray-900/95 backdrop-blur p-5 font-mono max-w-lg w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-white font-bold text-sm">
              {agent.sessionId.slice(0, 8)} - {cog ? "Cognitive State" : "Agent Info"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white text-lg leading-none px-1"
          >
            x
          </button>
        </div>

        {cog ? (
          <>
            {/* AI Agent: Full Cognitive Info */}
            <Section title="Situation Assessment">
              <p className="text-white/80 text-sm">{cog.plan.situation_assessment}</p>
            </Section>

            <Section title="AI Reasoning">
              <p className="text-purple-300 text-sm italic leading-relaxed">{cog.plan.reasoning}</p>
            </Section>

            <Section title="Chosen Approach">
              <p className="text-cyan-300 text-sm">{cog.plan.chosen_approach}</p>
            </Section>

            <Section title="World State">
              <div className="space-y-2">
                <BarIndicator
                  label="Threat"
                  value={cog.worldState.threat_level.toUpperCase()}
                  percent={THREAT_PERCENTS[cog.worldState.threat_level] ?? 50}
                  color={THREAT_COLORS[cog.worldState.threat_level] ?? "#888"}
                />
                <BarIndicator
                  label="Resources"
                  value={cog.worldState.resource_status.toUpperCase()}
                  percent={RESOURCE_PERCENTS[cog.worldState.resource_status] ?? 50}
                  color={RESOURCE_COLORS[cog.worldState.resource_status] ?? "#888"}
                />
                <BarIndicator
                  label="Confidence"
                  value={(cog.worldState.confidence * 100).toFixed(0) + "%"}
                  percent={cog.worldState.confidence * 100}
                  color={cog.worldState.confidence > 0.7 ? "#22c55e" : cog.worldState.confidence > 0.4 ? "#eab308" : "#ef4444"}
                />
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">Objective:</span>
                  <span className="text-white/80">{cog.worldState.objective}</span>
                </div>
              </div>
            </Section>

            <Section title="Perception">
              <div className="space-y-1 text-xs">
                <div className="text-white/50">
                  Threats:{" "}
                  <span className="text-red-400">
                    {cog.perception.threats.length > 0
                      ? cog.perception.threats.map((t) => `Enemy ${t.distance} tiles ${t.direction}`).join(", ")
                      : "None"}
                  </span>
                </div>
                <div className="text-white/50">
                  Opportunities:{" "}
                  <span className="text-yellow-400">
                    {cog.perception.opportunities.length > 0
                      ? cog.perception.opportunities.slice(0, 4).map((o) => `${o.type} ${o.distance} tiles ${o.direction}`).join(", ")
                      : "None"}
                  </span>
                </div>
                <div className="text-white/50">
                  Self: HP {cog.perception.self.hp_percent}% | Armor: {cog.perception.self.armor ? "Yes" : "No"} | Inv: {cog.perception.self.inventory_summary}
                </div>
              </div>
            </Section>

            <Section title={`Memory (${cog.memory.length})`}>
              <div className="space-y-0.5 max-h-32 overflow-y-auto">
                {cog.memory.length > 0 ? (
                  [...cog.memory].reverse().map((m, i) => (
                    <div key={i} className={`text-xs ${MEMORY_COLORS[m.type] ?? "text-white/50"}`}>
                      <span className="text-white/30 mr-1">T{m.tick}</span>
                      <span className="mr-1">[{m.type}]</span>
                      {m.summary}
                    </div>
                  ))
                ) : (
                  <div className="text-white/30 text-xs">No memories yet</div>
                )}
              </div>
            </Section>

            {/* Raw WorldContext debug */}
            {agent.worldContext && (
              <Section title="WorldContext (Raw)">
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
                  <span className="text-white/40">Enemies Nearby:</span>
                  <span className="text-red-400">{agent.worldContext.nearby_enemy_count} ({agent.worldContext.nearest_enemy_distance < 9999 ? `${agent.worldContext.nearest_enemy_distance}t` : "none"})</span>
                  <span className="text-white/40">Loot Nearby:</span>
                  <span className="text-yellow-400">{agent.worldContext.nearby_loot_count} ({agent.worldContext.nearest_loot_distance < 9999 ? `${agent.worldContext.nearest_loot_distance}t` : "none"})</span>
                  <span className="text-white/40">Extract Dist:</span>
                  <span className="text-purple-400">{agent.worldContext.distance_to_extract < 9999 ? `${agent.worldContext.distance_to_extract}t` : "N/A"}</span>
                  <span className="text-white/40">Cover:</span>
                  <span className={agent.worldContext.has_cover ? "text-blue-400" : "text-white/30"}>{agent.worldContext.has_cover ? "Yes" : "No"}</span>
                  <span className="text-white/40">Inventory:</span>
                  <span className="text-white/60">{agent.worldContext.inventory_count} items</span>
                  <span className="text-white/40">Utilities:</span>
                  <span className="text-white/60">
                    {[agent.worldContext.has_grenade && "Grenade", agent.worldContext.has_smoke && "Smoke", agent.worldContext.has_trap && "Trap"].filter(Boolean).join(", ") || "None"}
                  </span>
                </div>
              </Section>
            )}
          </>
        ) : (
          <>
            {/* Non-AI Agent: Basic Info */}
            <Section title="Agent Status">
              <div className="space-y-2">
                <BarIndicator
                  label="HP"
                  value={`${agent.hp}/${agent.maxHp}`}
                  percent={hpPercent}
                  color={hpPercent > 50 ? "#22c55e" : hpPercent > 25 ? "#eab308" : "#ef4444"}
                />
                {agent.equippedArmor && (
                  <BarIndicator
                    label="Armor"
                    value={`${agent.equippedArmor} (${agent.armorDurability})`}
                    percent={Math.min(100, agent.armorDurability)}
                    color="#3b82f6"
                  />
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">Position:</span>
                  <span className="text-white/80">({agent.x}, {agent.y})</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">State:</span>
                  <span className="text-white/80">{agent.state.toUpperCase()}</span>
                </div>
              </div>
            </Section>

            <Section title="Current Action">
              <p className="text-cyan-300 text-sm">{agent.currentAction}</p>
            </Section>

            <Section title="Strategy">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-sm" style={{ color }}>{agent.strategyName}</span>
              </div>
            </Section>

            {/* Tactical Awareness */}
            {agent.worldContext && (
              <Section title="Tactical Awareness">
                <div className="space-y-2">
                  {/* Nearby enemies */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-white/50 w-20">Enemies:</span>
                    <span className="text-red-400">{agent.worldContext.nearby_enemy_count} nearby</span>
                    {agent.worldContext.nearest_enemy_distance < 9999 && (
                      <span className="text-white/30">(nearest: {agent.worldContext.nearest_enemy_distance}t)</span>
                    )}
                  </div>
                  {/* Nearby loot */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-white/50 w-20">Loot:</span>
                    <span className="text-yellow-400">{agent.worldContext.nearby_loot_count} nearby</span>
                    {agent.worldContext.nearest_loot_distance < 9999 && (
                      <span className="text-white/30">(nearest: {agent.worldContext.nearest_loot_distance}t)</span>
                    )}
                  </div>
                  {/* Cover */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-white/50 w-20">Cover:</span>
                    <span className={agent.worldContext.has_cover ? "text-blue-400" : "text-white/30"}>
                      {agent.worldContext.has_cover ? "In Cover" : "Exposed"}
                    </span>
                  </div>
                  {/* Extraction */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-white/50 w-20">Extract:</span>
                    <span className={agent.worldContext.extraction_available ? "text-purple-400" : "text-white/30"}>
                      {agent.worldContext.extraction_available
                        ? `Available (${agent.worldContext.distance_to_extract < 9999 ? `${agent.worldContext.distance_to_extract}t` : "?"})`
                        : "N/A"}
                    </span>
                  </div>
                </div>
              </Section>
            )}

            {/* Inventory Detail */}
            {agent.inventory.length > 0 && (
              <Section title={`Inventory (${agent.inventory.length} items)`}>
                <div className="space-y-1">
                  {/* Utility badges */}
                  {(() => {
                    const utilities = agent.inventory.filter(
                      (i) => ["grenade", "smoke_grenade", "trap"].includes(i.itemType)
                    );
                    return utilities.length > 0 ? (
                      <div className="flex gap-1 flex-wrap mb-1">
                        {utilities.map((u, idx) => (
                          <span
                            key={idx}
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              u.itemType === "grenade" ? "bg-amber-900/50 text-amber-400" :
                              u.itemType === "smoke_grenade" ? "bg-slate-700/50 text-slate-300" :
                              "bg-red-900/50 text-red-400"
                            }`}
                          >
                            {u.itemId} x{u.quantity}
                          </span>
                        ))}
                      </div>
                    ) : null;
                  })()}
                  {/* Full item list */}
                  <div className="space-y-0.5 max-h-24 overflow-y-auto">
                    {agent.inventory.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-[10px]">
                        <span className="text-white/60">{item.itemId}</span>
                        <span className="text-white/40">{item.itemType} x{item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>
            )}
          </>
        )}

        {/* Footer */}
        <div className="mt-3 pt-3 border-t border-white/10 flex justify-between text-xs text-white/40">
          <span>Strategy: <span style={{ color }}>{agent.strategyName}</span></span>
          <span>Action: {agent.currentAction}</span>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1 border-b border-white/5 pb-0.5">
        {title}
      </div>
      {children}
    </div>
  );
}

function BarIndicator({
  label,
  value,
  percent,
  color,
}: {
  label: string;
  value: string;
  percent: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-white/50 w-20">{label}:</span>
      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${Math.min(100, percent)}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-white/70 w-20 text-right" style={{ color }}>
        {value}
      </span>
    </div>
  );
}
