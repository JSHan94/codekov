export type ItemType = "weapon" | "consumable" | "valuable" | "armor" | "utility";

export interface WeaponStats {
  damage: number;
  accuracy: number;
  range: number;
}

export interface ConsumableStats {
  healAmount: number;
}

export interface ValuableStats {
  value: number;
}

export interface ArmorStats {
  damageReduction: number; // percentage (e.g. 15 = 15%)
  maxDurability: number;
}

export interface UtilityStats {
  utilityType: "grenade" | "smoke_grenade" | "trap";
  damage?: number;
  radius?: number;
  duration?: number; // in ticks
}

export interface ItemDefinition {
  id: string;
  type: ItemType;
  name: string;
  stats: WeaponStats | ConsumableStats | ValuableStats | ArmorStats | UtilityStats;
  lootWeight: number;
  buyPrice: number | null; // null = not purchasable
  sellPrice: number;
}

export const ITEM_REGISTRY: Record<string, ItemDefinition> = {
  ak47: {
    id: "ak47",
    type: "weapon",
    name: "AK-47",
    stats: { damage: 25, accuracy: 70, range: 5 } as WeaponStats,
    lootWeight: 10,
    buyPrice: 500,
    sellPrice: 200,
  },
  pistol: {
    id: "pistol",
    type: "weapon",
    name: "Pistol",
    stats: { damage: 12, accuracy: 85, range: 4 } as WeaponStats,
    lootWeight: 20,
    buyPrice: 200,
    sellPrice: 80,
  },
  bandage: {
    id: "bandage",
    type: "consumable",
    name: "Bandage",
    stats: { healAmount: 20 } as ConsumableStats,
    lootWeight: 40,
    buyPrice: 50,
    sellPrice: 20,
  },
  medkit: {
    id: "medkit",
    type: "consumable",
    name: "Medkit",
    stats: { healAmount: 50 } as ConsumableStats,
    lootWeight: 10,
    buyPrice: 150,
    sellPrice: 60,
  },
  gold_coin: {
    id: "gold_coin",
    type: "valuable",
    name: "Gold Coin",
    stats: { value: 100 } as ValuableStats,
    lootWeight: 30,
    buyPrice: null,
    sellPrice: 100,
  },
  diamond: {
    id: "diamond",
    type: "valuable",
    name: "Diamond",
    stats: { value: 500 } as ValuableStats,
    lootWeight: 5,
    buyPrice: null,
    sellPrice: 500,
  },
  helmet: {
    id: "helmet",
    type: "armor",
    name: "Helmet",
    stats: { damageReduction: 15, maxDurability: 50 } as ArmorStats,
    lootWeight: 12,
    buyPrice: 300,
    sellPrice: 120,
  },
  body_armor: {
    id: "body_armor",
    type: "armor",
    name: "Body Armor",
    stats: { damageReduction: 30, maxDurability: 100 } as ArmorStats,
    lootWeight: 6,
    buyPrice: 600,
    sellPrice: 240,
  },
  grenade: {
    id: "grenade",
    type: "utility",
    name: "Grenade",
    stats: { utilityType: "grenade", damage: 40, radius: 1 } as UtilityStats,
    lootWeight: 8,
    buyPrice: 200,
    sellPrice: 80,
  },
  smoke_grenade: {
    id: "smoke_grenade",
    type: "utility",
    name: "Smoke Grenade",
    stats: { utilityType: "smoke_grenade", radius: 2, duration: 10 } as UtilityStats,
    lootWeight: 10,
    buyPrice: 150,
    sellPrice: 60,
  },
  trap: {
    id: "trap",
    type: "utility",
    name: "Trap",
    stats: { utilityType: "trap", damage: 35, duration: 100 } as UtilityStats,
    lootWeight: 8,
    buyPrice: 180,
    sellPrice: 70,
  },
};

export const TOTAL_LOOT_WEIGHT = Object.values(ITEM_REGISTRY).reduce(
  (sum, item) => sum + item.lootWeight,
  0,
);

export function isWeapon(
  stats: WeaponStats | ConsumableStats | ValuableStats | ArmorStats | UtilityStats,
): stats is WeaponStats {
  return "damage" in stats && "accuracy" in stats;
}

export function isConsumable(
  stats: WeaponStats | ConsumableStats | ValuableStats | ArmorStats | UtilityStats,
): stats is ConsumableStats {
  return "healAmount" in stats;
}

export function isArmor(
  stats: WeaponStats | ConsumableStats | ValuableStats | ArmorStats | UtilityStats,
): stats is ArmorStats {
  return "damageReduction" in stats;
}

export function isUtility(
  stats: WeaponStats | ConsumableStats | ValuableStats | ArmorStats | UtilityStats,
): stats is UtilityStats {
  return "utilityType" in stats;
}
