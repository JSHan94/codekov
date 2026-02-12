import { GAME } from "../config/game.constants.js";
import { ITEM_REGISTRY, isWeapon, type WeaponStats } from "../types/items.js";
import type { Agent, Zombie } from "../rooms/schema/RaidState.js";
import type { TileGrid, TerrainType } from "./TileGrid.js";
import { applyArmorDamageReduction } from "./EquipmentSystem.js";
import { ZOMBIE_CONFIGS, type ZombieType } from "../types/zombie.js";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function manhattanDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

function getEquippedWeaponInfo(agent: Agent): { stats: WeaponStats; id: string } {
  for (const item of agent.inventory) {
    const def = ITEM_REGISTRY[item.itemId];
    if (def && def.type === "weapon" && isWeapon(def.stats)) {
      return { stats: def.stats, id: def.id };
    }
  }
  return { stats: GAME.UNARMED, id: "unarmed" };
}

function isDefenderBehindCover(
  attacker: Agent,
  defender: Agent,
  tileGrid: TileGrid,
): boolean {
  // Check tiles adjacent to defender for COVER between attacker and defender
  const dx = Math.sign(attacker.x - defender.x);
  const dy = Math.sign(attacker.y - defender.y);

  // Check the tile in the direction of the attacker
  if (dx !== 0 && tileGrid.isCover(defender.x + dx, defender.y)) return true;
  if (dy !== 0 && tileGrid.isCover(defender.x, defender.y + dy)) return true;

  return false;
}

export interface AttackResult {
  hit: boolean;
  damage: number;
  killed: boolean;
  weaponId: string;
  armorAbsorbed: number;
}

export function resolveAttack(
  attacker: Agent,
  defender: Agent,
  tileGrid?: TileGrid,
): AttackResult {
  const distance = manhattanDistance(
    attacker.x,
    attacker.y,
    defender.x,
    defender.y,
  );
  const { stats: weapon, id: weaponId } = getEquippedWeaponInfo(attacker);

  // Range check
  if (distance > weapon.range) {
    return { hit: false, damage: 0, killed: false, weaponId, armorAbsorbed: 0 };
  }

  // Hit chance
  let hitChance = weapon.accuracy - distance * GAME.HIT_CHANCE.distancePenalty;

  // Cover reduction
  if (tileGrid && isDefenderBehindCover(attacker, defender, tileGrid)) {
    hitChance -= GAME.TERRAIN.COVER_HIT_REDUCTION;
  }

  hitChance = clamp(hitChance, GAME.HIT_CHANCE.min, GAME.HIT_CHANCE.max);

  if (Math.random() * 100 >= hitChance) {
    return { hit: false, damage: 0, killed: false, weaponId, armorAbsorbed: 0 };
  }

  // Damage with variance
  const variance = 1 + (Math.random() * 2 - 1) * GAME.DAMAGE_VARIANCE;
  const rawDamage = Math.max(1, Math.round(weapon.damage * variance));

  // Apply armor
  const { finalDamage, armorAbsorbed } = applyArmorDamageReduction(defender, rawDamage);

  defender.hp -= finalDamage;
  const killed = defender.hp <= 0;
  if (killed) defender.hp = 0;

  return { hit: true, damage: finalDamage, killed, weaponId, armorAbsorbed };
}

export interface ZombieAttackResult {
  hit: boolean;
  damage: number;
  killed: boolean;
}

/** Zombie attacks a player/ally agent. Uses accuracy-based hit chance. */
export function resolveZombieAttack(zombie: Zombie, defender: Agent): ZombieAttackResult {
  const config = ZOMBIE_CONFIGS[zombie.zombieType as ZombieType];

  // Accuracy check
  const hitChance = config?.accuracy ?? 80;
  if (Math.random() * 100 >= hitChance) {
    return { hit: false, damage: 0, killed: false };
  }

  const baseDamage = config?.damage ?? 8;
  const variance = 1 + (Math.random() * 2 - 1) * GAME.DAMAGE_VARIANCE;
  const rawDamage = Math.max(1, Math.round(baseDamage * variance));

  const { finalDamage } = applyArmorDamageReduction(defender, rawDamage);
  defender.hp -= finalDamage;
  const killed = defender.hp <= 0;
  if (killed) defender.hp = 0;

  return { hit: true, damage: finalDamage, killed };
}

export interface PlayerVsZombieResult {
  hit: boolean;
  damage: number;
  killed: boolean;
  weaponId: string;
}

/** Player/ally attacks a zombie. Zombies have no armor/cover. */
export function resolveAttackOnZombie(attacker: Agent, zombie: Zombie): PlayerVsZombieResult {
  const distance = manhattanDistance(attacker.x, attacker.y, zombie.x, zombie.y);
  const { stats: weapon, id: weaponId } = getEquippedWeaponInfo(attacker);

  if (distance > weapon.range) {
    return { hit: false, damage: 0, killed: false, weaponId };
  }

  let hitChance = weapon.accuracy - distance * GAME.HIT_CHANCE.distancePenalty;
  hitChance = clamp(hitChance, GAME.HIT_CHANCE.min, GAME.HIT_CHANCE.max);

  if (Math.random() * 100 >= hitChance) {
    return { hit: false, damage: 0, killed: false, weaponId };
  }

  const variance = 1 + (Math.random() * 2 - 1) * GAME.DAMAGE_VARIANCE;
  const damage = Math.max(1, Math.round(weapon.damage * variance));

  zombie.hp -= damage;
  const killed = zombie.hp <= 0;
  if (killed) zombie.hp = 0;

  return { hit: true, damage, killed, weaponId };
}
