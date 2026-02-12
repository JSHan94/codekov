import { ITEM_REGISTRY, isArmor, type ArmorStats } from "../types/items.js";
import type { Agent } from "../rooms/schema/RaidState.js";

export function autoEquipArmor(agent: Agent): void {
  let bestArmorId: string | null = null;
  let bestReduction = 0;
  let bestDurability = 0;

  for (const item of agent.inventory) {
    const def = ITEM_REGISTRY[item.itemId];
    if (def && def.type === "armor" && isArmor(def.stats)) {
      if (def.stats.damageReduction > bestReduction) {
        bestArmorId = def.id;
        bestReduction = def.stats.damageReduction;
        bestDurability = def.stats.maxDurability;
      }
    }
  }

  if (bestArmorId && bestArmorId !== agent.equippedArmor) {
    agent.equippedArmor = bestArmorId;
    agent.armorDurability = bestDurability;
  }
}

export function applyArmorDamageReduction(
  agent: Agent,
  rawDamage: number,
): { finalDamage: number; armorAbsorbed: number } {
  if (!agent.equippedArmor || agent.armorDurability <= 0) {
    return { finalDamage: rawDamage, armorAbsorbed: 0 };
  }

  const def = ITEM_REGISTRY[agent.equippedArmor];
  if (!def || !isArmor(def.stats)) {
    return { finalDamage: rawDamage, armorAbsorbed: 0 };
  }

  const stats = def.stats as ArmorStats;
  const absorbed = Math.round(rawDamage * (stats.damageReduction / 100));
  const finalDamage = Math.max(1, rawDamage - absorbed);

  // Consume durability
  agent.armorDurability -= absorbed;
  if (agent.armorDurability <= 0) {
    agent.armorDurability = 0;
    // Destroy armor - remove from inventory
    for (let i = 0; i < agent.inventory.length; i++) {
      if (agent.inventory[i].itemId === agent.equippedArmor) {
        agent.inventory[i].quantity -= 1;
        if (agent.inventory[i].quantity <= 0) {
          agent.inventory.splice(i, 1);
        }
        break;
      }
    }
    agent.equippedArmor = "";
  }

  return { finalDamage, armorAbsorbed: absorbed };
}
