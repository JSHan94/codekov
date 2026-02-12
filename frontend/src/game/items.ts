// Frontend mirror of game-server/src/types/items.ts (display data only)

export type ItemType = "weapon" | "consumable" | "valuable" | "armor" | "utility";

export interface ItemInfo {
  id: string;
  type: ItemType;
  name: string;
  buyPrice: number | null;
  sellPrice: number;
  stats: Record<string, unknown>;
}

export const ITEM_DATA: Record<string, ItemInfo> = {
  ak47: {
    id: "ak47",
    type: "weapon",
    name: "AK-47",
    buyPrice: 500,
    sellPrice: 200,
    stats: { damage: 25, accuracy: 70, range: 5 },
  },
  pistol: {
    id: "pistol",
    type: "weapon",
    name: "Pistol",
    buyPrice: 200,
    sellPrice: 80,
    stats: { damage: 12, accuracy: 85, range: 4 },
  },
  bandage: {
    id: "bandage",
    type: "consumable",
    name: "Bandage",
    buyPrice: 50,
    sellPrice: 20,
    stats: { healAmount: 20 },
  },
  medkit: {
    id: "medkit",
    type: "consumable",
    name: "Medkit",
    buyPrice: 150,
    sellPrice: 60,
    stats: { healAmount: 50 },
  },
  gold_coin: {
    id: "gold_coin",
    type: "valuable",
    name: "Gold Coin",
    buyPrice: null,
    sellPrice: 100,
    stats: { value: 100 },
  },
  diamond: {
    id: "diamond",
    type: "valuable",
    name: "Diamond",
    buyPrice: null,
    sellPrice: 500,
    stats: { value: 500 },
  },
  helmet: {
    id: "helmet",
    type: "armor",
    name: "Helmet",
    buyPrice: 300,
    sellPrice: 120,
    stats: { damageReduction: 15, maxDurability: 50 },
  },
  body_armor: {
    id: "body_armor",
    type: "armor",
    name: "Body Armor",
    buyPrice: 600,
    sellPrice: 240,
    stats: { damageReduction: 30, maxDurability: 100 },
  },
  grenade: {
    id: "grenade",
    type: "utility",
    name: "Grenade",
    buyPrice: 200,
    sellPrice: 80,
    stats: { damage: 40, radius: 1 },
  },
  smoke_grenade: {
    id: "smoke_grenade",
    type: "utility",
    name: "Smoke Grenade",
    buyPrice: 150,
    sellPrice: 60,
    stats: { radius: 2, duration: 10 },
  },
  trap: {
    id: "trap",
    type: "utility",
    name: "Trap",
    buyPrice: 180,
    sellPrice: 70,
    stats: { damage: 35, duration: 100 },
  },
};

export function getItemInfo(itemId: string): ItemInfo | undefined {
  return ITEM_DATA[itemId];
}

export function formatStats(stats: Record<string, unknown>): string[] {
  const lines: string[] = [];
  if ("damage" in stats) lines.push(`Damage: ${stats.damage}`);
  if ("accuracy" in stats) lines.push(`Accuracy: ${stats.accuracy}%`);
  if ("range" in stats) lines.push(`Range: ${stats.range}`);
  if ("healAmount" in stats) lines.push(`Heal: +${stats.healAmount} HP`);
  if ("value" in stats) lines.push(`Value: ${stats.value}g`);
  if ("damageReduction" in stats) lines.push(`DR: ${stats.damageReduction}%`);
  if ("maxDurability" in stats) lines.push(`Durability: ${stats.maxDurability}`);
  if ("radius" in stats) lines.push(`Radius: ${stats.radius}`);
  if ("duration" in stats) lines.push(`Duration: ${stats.duration}t`);
  return lines;
}

const TYPE_COLORS: Record<ItemType, string> = {
  weapon: "text-red-400",
  consumable: "text-green-400",
  valuable: "text-yellow-400",
  armor: "text-blue-400",
  utility: "text-purple-400",
};

export function getTypeColor(type: ItemType): string {
  return TYPE_COLORS[type] ?? "text-white/50";
}

const TYPE_LABELS: Record<ItemType, string> = {
  weapon: "Weapon",
  consumable: "Consumable",
  valuable: "Valuable",
  armor: "Armor",
  utility: "Utility",
};

export function getTypeLabel(type: ItemType): string {
  return TYPE_LABELS[type] ?? type;
}
