import { z } from "zod";
import { StrategySchema } from "./strategy.js";

// Shared envelope for sequenced manual inputs
const ManualInputEnvelope = {
  seq: z.number().int().nonnegative().optional(),
  ts: z.number().int().nonnegative().optional(),
};

export const OverrideCommandSchema = z.object({
  action: z.enum(["FLEE", "HEAL"]),
});
export type OverrideCommand = z.infer<typeof OverrideCommandSchema>;

export const PlayerMoveSchema = z.object({
  dx: z.number().int().min(-1).max(1),
  dy: z.number().int().min(-1).max(1),
  ...ManualInputEnvelope,
});

export const PlayerLootSchema = z.object({
  ...ManualInputEnvelope,
});

export const PlayerAttackSchema = z.object({
  targetSessionId: z.string().min(1),
  ...ManualInputEnvelope,
});

export const PlayerDodgeSchema = z.object({
  dx: z.number().int().min(-1).max(1),
  dy: z.number().int().min(-1).max(1),
  ...ManualInputEnvelope,
});

export const PlayerAttackZombieSchema = z.object({
  zombieId: z.string().min(1),
  ...ManualInputEnvelope,
});

export const UpdateStrategySchema = z.object({
  strategy: StrategySchema,
});
export type UpdateStrategy = z.infer<typeof UpdateStrategySchema>;

export interface RaidResult {
  result: "survived" | "died";
  ticksAlive: number;
}

// ─── Server → Client Broadcast Events ───

export interface AttackEvent {
  tick: number;
  attackerSessionId: string;
  defenderSessionId: string;
  weaponId: string;     // "ak47" | "pistol" | "unarmed"
  hit: boolean;
  damage: number;       // 0 if miss
  defenderHpAfter: number;
  armorAbsorbed: number;
}

export interface DeathEvent {
  tick: number;
  victimSessionId: string;
  killerSessionId: string | null; // null if disconnect death
  corpseId: string;
  weaponId?: string;
  causeOfDeath?: string; // "combat" | "grenade" | "trap" | "disconnect"
}

export interface LootEvent {
  tick: number;
  agentSessionId: string;
  objectId: string;
  items: Array<{ itemId: string; quantity: number }>;
}

export interface HealEvent {
  tick: number;
  agentSessionId: string;
  itemId: string;
  healAmount: number;
  hpAfter: number;
}

export interface ExtractEvent {
  tick: number;
  agentSessionId: string;
  itemCount: number;
}

export interface GrenadeEvent {
  tick: number;
  throwerSessionId: string;
  x: number;
  y: number;
  radius: number;
  victims: Array<{ sessionId: string; damage: number; hpAfter: number }>;
}

export interface TrapTriggerEvent {
  tick: number;
  victimSessionId: string;
  x: number;
  y: number;
  damage: number;
  hpAfter: number;
}

export interface SmokeEvent {
  tick: number;
  throwerSessionId: string;
  x: number;
  y: number;
  radius: number;
  objectId: string;
}

export interface DodgeEvent {
  tick: number;
  agentSessionId: string;
  x: number;
  y: number;
}
