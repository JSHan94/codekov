import { ArraySchema } from "@colyseus/schema";
import { Agent, InventoryItem } from "../rooms/schema/RaidState.js";
import { GAME } from "../config/game.constants.js";
import { ITEM_REGISTRY } from "../types/items.js";
import type { BotSpawnConfig } from "../config/solo.stages.js";
import { getStrategyForDifficulty } from "../config/solo.strategies.js";

let botIdCounter = 0;

export function createBotAgent(
  config: BotSpawnConfig,
  spawnX: number,
  spawnY: number,
): Agent {
  const agent = new Agent();
  agent.sessionId = `bot_${botIdCounter++}_${Math.random().toString(36).slice(2, 8)}`;
  agent.playerId = agent.sessionId;
  agent.hp = config.hp;
  agent.maxHp = config.hp;
  agent.state = "alive";
  agent.currentAction = "IDLE";
  agent.strategy = getStrategyForDifficulty(config.difficulty);
  agent.joinedAtTick = 0;
  agent.x = spawnX;
  agent.y = spawnY;

  // Equip armor if specified
  if (config.equippedArmor && ITEM_REGISTRY[config.equippedArmor]) {
    agent.equippedArmor = config.equippedArmor;
    agent.armorDurability = config.armorDurability ?? 0;
    // Add armor to inventory
    const armorItem = new InventoryItem();
    armorItem.itemId = config.equippedArmor;
    armorItem.itemType = "armor";
    armorItem.quantity = 1;
    agent.inventory.push(armorItem);
  }

  // Add start items
  if (config.startItems) {
    for (const si of config.startItems) {
      if (!ITEM_REGISTRY[si.itemId]) continue;
      const existing = Array.from(agent.inventory).find((i) => i.itemId === si.itemId);
      if (existing) {
        existing.quantity += si.quantity;
      } else {
        const item = new InventoryItem();
        item.itemId = si.itemId;
        item.itemType = ITEM_REGISTRY[si.itemId].type;
        item.quantity = si.quantity;
        agent.inventory.push(item);
      }
    }
  }

  return agent;
}

export function resetBotIdCounter(): void {
  botIdCounter = 0;
}
