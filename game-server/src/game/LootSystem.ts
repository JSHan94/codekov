import { ArraySchema } from "@colyseus/schema";
import {
  ITEM_REGISTRY,
  TOTAL_LOOT_WEIGHT,
  type ItemDefinition,
} from "../types/items.js";
import { InventoryItem, Agent, MapObject } from "../rooms/schema/RaidState.js";

function pickWeightedItem(): ItemDefinition {
  let roll = Math.random() * TOTAL_LOOT_WEIGHT;
  for (const item of Object.values(ITEM_REGISTRY)) {
    roll -= item.lootWeight;
    if (roll <= 0) return item;
  }
  // Fallback (should not happen)
  return Object.values(ITEM_REGISTRY)[0];
}

export function generateRandomItems(count: number): InventoryItem[] {
  const merged = new Map<string, InventoryItem>();

  for (let i = 0; i < count; i++) {
    const def = pickWeightedItem();
    const existing = merged.get(def.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      const item = new InventoryItem();
      item.itemId = def.id;
      item.itemType = def.type;
      item.quantity = 1;
      merged.set(def.id, item);
    }
  }

  return Array.from(merged.values());
}

export function transferItems(source: MapObject, target: Agent): void {
  for (const srcItem of source.items) {
    const existing = target.inventory.find(
      (inv) => inv.itemId === srcItem.itemId,
    );
    if (existing) {
      existing.quantity += srcItem.quantity;
    } else {
      const item = new InventoryItem();
      item.itemId = srcItem.itemId;
      item.itemType = srcItem.itemType;
      item.quantity = srcItem.quantity;
      target.inventory.push(item);
    }
  }
  source.items.clear();
}

export function generateFilteredItems(count: number, allowedItemIds?: string[]): InventoryItem[] {
  if (!allowedItemIds || allowedItemIds.length === 0) {
    return generateRandomItems(count);
  }

  const filteredEntries = Object.values(ITEM_REGISTRY).filter(
    (item) => allowedItemIds.includes(item.id),
  );
  if (filteredEntries.length === 0) return generateRandomItems(count);

  const totalWeight = filteredEntries.reduce((sum, item) => sum + item.lootWeight, 0);
  const merged = new Map<string, InventoryItem>();

  for (let i = 0; i < count; i++) {
    let roll = Math.random() * totalWeight;
    let picked: ItemDefinition = filteredEntries[0];
    for (const item of filteredEntries) {
      roll -= item.lootWeight;
      if (roll <= 0) { picked = item; break; }
    }
    const existing = merged.get(picked.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      const item = new InventoryItem();
      item.itemId = picked.id;
      item.itemType = picked.type;
      item.quantity = 1;
      merged.set(picked.id, item);
    }
  }

  return Array.from(merged.values());
}

export function transferAllItems(agent: Agent, corpse: MapObject): void {
  for (const invItem of agent.inventory) {
    const item = new InventoryItem();
    item.itemId = invItem.itemId;
    item.itemType = invItem.itemType;
    item.quantity = invItem.quantity;
    corpse.items.push(item);
  }
  agent.inventory.clear();
}
