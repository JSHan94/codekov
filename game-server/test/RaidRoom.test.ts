import assert from "assert";
import { ColyseusTestServer, boot } from "@colyseus/testing";

import appConfig from "../src/app.config.js";
import { RaidState } from "../src/rooms/schema/RaidState.js";
import { GAME } from "../src/config/game.constants.js";
import { generateRandomItems, transferItems, transferAllItems } from "../src/game/LootSystem.js";
import { resolveAttack } from "../src/game/CombatResolver.js";
import { decide } from "../src/game/AgentBrain.js";
import { generateMap, getRandomSpawnCoord } from "../src/game/MapGenerator.js";
import { TileGrid } from "../src/game/TileGrid.js";
import { Agent, MapObject, InventoryItem } from "../src/rooms/schema/RaidState.js";
import { ArraySchema, MapSchema } from "@colyseus/schema";
import type { Strategy } from "../src/types/strategy.js";
import { StrategySchema } from "../src/types/strategy.js";
import { OverrideCommandSchema } from "../src/types/messages.js";

// ─── Unit Tests: Types & Validation ───

describe("Strategy Schema Validation", () => {
  it("should accept a valid strategy", () => {
    const strategy = {
      name: "test_strategy",
      rules: [
        {
          priority: 0,
          conditions: [{ subject: "hp_percent", operator: "lte", value: 20 }],
          action: "HEAL",
        },
      ],
      fallbackAction: "MOVE_TO_RANDOM",
    };
    const result = StrategySchema.safeParse(strategy);
    assert.ok(result.success);
  });

  it("should reject invalid action", () => {
    const strategy = {
      name: "bad",
      rules: [
        {
          priority: 0,
          conditions: [{ subject: "hp_percent", operator: "lte", value: 20 }],
          action: "INVALID_ACTION",
        },
      ],
      fallbackAction: "MOVE_TO_RANDOM",
    };
    const result = StrategySchema.safeParse(strategy);
    assert.ok(!result.success);
  });

  it("should reject empty rules", () => {
    const strategy = {
      name: "empty",
      rules: [] as unknown[],
      fallbackAction: "MOVE_TO_RANDOM",
    };
    const result = StrategySchema.safeParse(strategy);
    assert.ok(!result.success);
  });

  it("should reject invalid operator", () => {
    const strategy = {
      name: "bad_op",
      rules: [
        {
          priority: 0,
          conditions: [{ subject: "hp_percent", operator: "ne", value: 50 }],
          action: "HEAL",
        },
      ],
      fallbackAction: "MOVE_TO_RANDOM",
    };
    const result = StrategySchema.safeParse(strategy);
    assert.ok(!result.success);
  });
});

describe("OverrideCommand Validation", () => {
  it("should accept FLEE", () => {
    assert.ok(OverrideCommandSchema.safeParse({ action: "FLEE" }).success);
  });

  it("should accept HEAL", () => {
    assert.ok(OverrideCommandSchema.safeParse({ action: "HEAL" }).success);
  });

  it("should reject ATTACK_NEAREST", () => {
    assert.ok(!OverrideCommandSchema.safeParse({ action: "ATTACK_NEAREST" }).success);
  });
});

// ─── Unit Tests: MapGenerator ───

describe("MapGenerator", () => {
  it("should generate correct number of loot boxes", () => {
    const { objects } = generateMap();
    // Extraction points are now dynamically spawned, so only loot boxes here
    assert.strictEqual(objects.length, GAME.LOOT_BOX_COUNT);
  });

  it("should only contain loot boxes (extraction spawned dynamically)", () => {
    const { objects } = generateMap();
    for (const obj of objects) {
      assert.strictEqual(obj.objectType, "LOOT_BOX");
    }
  });

  it("should generate loot boxes with items", () => {
    const { objects } = generateMap();
    const lootBoxes = objects.filter((o: MapObject) => o.objectType === "LOOT_BOX");
    assert.strictEqual(lootBoxes.length, GAME.LOOT_BOX_COUNT);
    for (const box of lootBoxes) {
      assert.ok(box.items.length >= 1, "Each loot box should have at least 1 item");
    }
  });

  it("should not generate overlapping coordinates", () => {
    const { objects } = generateMap();
    const coords = new Set<string>();
    for (const obj of objects) {
      const key = `${obj.x},${obj.y}`;
      assert.ok(!coords.has(key), `Duplicate coordinate: ${key}`);
      coords.add(key);
    }
  });

  it("should generate terrain data", () => {
    const { terrain } = generateMap();
    assert.ok(terrain);
    const serialized = terrain.serialize();
    assert.strictEqual(serialized.length, GAME.MAP_WIDTH * GAME.MAP_HEIGHT);
  });

  it("should generate non-overlapping spawn coordinates", () => {
    const occupied = new Set<string>();
    const spawns = [];
    for (let i = 0; i < 10; i++) {
      spawns.push(getRandomSpawnCoord(GAME.MAP_WIDTH, GAME.MAP_HEIGHT, occupied));
    }
    const keys = spawns.map((s) => `${s.x},${s.y}`);
    assert.strictEqual(new Set(keys).size, 10);
  });
});

// ─── Unit Tests: LootSystem ───

describe("LootSystem", () => {
  it("should generate items with valid properties", () => {
    const items = generateRandomItems(5);
    assert.ok(items.length > 0);
    for (const item of items) {
      assert.ok(item.itemId);
      assert.ok(item.itemType);
      assert.ok(item.quantity >= 1);
    }
  });

  it("should merge duplicate items when generating", () => {
    // Generate a large number to increase chance of duplicates
    const items = generateRandomItems(50);
    const ids = items.map((i) => i.itemId);
    const uniqueIds = new Set(ids);
    assert.strictEqual(ids.length, uniqueIds.size, "No duplicate item IDs in result");
  });

  it("should transfer items from source to target", () => {
    const source = new MapObject();
    const item = new InventoryItem();
    item.itemId = "ak47";
    item.itemType = "weapon";
    item.quantity = 1;
    source.items.push(item);

    const target = new Agent();
    transferItems(source, target);

    assert.strictEqual(source.items.length, 0);
    assert.strictEqual(target.inventory.length, 1);
    assert.strictEqual(target.inventory[0].itemId, "ak47");
  });

  it("should merge quantities on transfer", () => {
    const source = new MapObject();
    const srcItem = new InventoryItem();
    srcItem.itemId = "bandage";
    srcItem.itemType = "consumable";
    srcItem.quantity = 2;
    source.items.push(srcItem);

    const target = new Agent();
    const existing = new InventoryItem();
    existing.itemId = "bandage";
    existing.itemType = "consumable";
    existing.quantity = 1;
    target.inventory.push(existing);

    transferItems(source, target);

    assert.strictEqual(target.inventory.length, 1);
    assert.strictEqual(target.inventory[0].quantity, 3);
  });

  it("should transfer all items from agent to corpse", () => {
    const agent = new Agent();
    const item1 = new InventoryItem();
    item1.itemId = "ak47";
    item1.itemType = "weapon";
    item1.quantity = 1;
    agent.inventory.push(item1);

    const item2 = new InventoryItem();
    item2.itemId = "bandage";
    item2.itemType = "consumable";
    item2.quantity = 3;
    agent.inventory.push(item2);

    const corpse = new MapObject();
    transferAllItems(agent, corpse);

    assert.strictEqual(agent.inventory.length, 0);
    assert.strictEqual(corpse.items.length, 2);
  });
});

// ─── Unit Tests: CombatResolver ───

describe("CombatResolver", () => {
  function createArmedAgent(x: number, y: number): Agent {
    const agent = new Agent();
    agent.x = x;
    agent.y = y;
    agent.hp = 100;
    agent.maxHp = 100;
    agent.state = "alive";
    const weapon = new InventoryItem();
    weapon.itemId = "ak47";
    weapon.itemType = "weapon";
    weapon.quantity = 1;
    agent.inventory.push(weapon);
    return agent;
  }

  it("should miss if target is out of range", () => {
    const attacker = createArmedAgent(0, 0);
    const defender = createArmedAgent(20, 20); // way out of range
    const result = resolveAttack(attacker, defender);
    assert.strictEqual(result.hit, false);
    assert.strictEqual(result.damage, 0);
    assert.strictEqual(defender.hp, 100);
  });

  it("should apply damage when hit", () => {
    // Run multiple attempts since it's random
    let hitCount = 0;
    for (let i = 0; i < 100; i++) {
      const attacker = createArmedAgent(0, 0);
      const defender = createArmedAgent(1, 0); // distance=1, high hit chance
      const result = resolveAttack(attacker, defender);
      if (result.hit) {
        hitCount++;
        assert.ok(result.damage > 0);
        assert.ok(defender.hp < 100);
      }
    }
    // With ak47 (accuracy=70, range=5, distance=1), hit chance is ~65%
    assert.ok(hitCount > 20, `Expected hits, got ${hitCount}/100`);
  });

  it("should kill target when HP reaches 0", () => {
    let killedCount = 0;
    for (let i = 0; i < 200; i++) {
      const attacker = createArmedAgent(0, 0);
      const defender = createArmedAgent(1, 0);
      defender.hp = 1; // 1 HP left
      const result = resolveAttack(attacker, defender);
      if (result.hit) {
        assert.strictEqual(result.killed, true);
        assert.strictEqual(defender.hp, 0);
        killedCount++;
      }
    }
    assert.ok(killedCount > 0, "Should have killed at least once");
  });

  it("should use unarmed stats when no weapon", () => {
    const attacker = new Agent();
    attacker.x = 0;
    attacker.y = 0;
    attacker.hp = 100;
    attacker.maxHp = 100;
    attacker.state = "alive";
    // No weapon in inventory

    const defender = new Agent();
    defender.x = 1;
    defender.y = 0;
    defender.hp = 100;
    defender.maxHp = 100;
    defender.state = "alive";

    // Unarmed range is 2, so distance=1 should be in range
    let hitAny = false;
    for (let i = 0; i < 100; i++) {
      defender.hp = 100;
      const result = resolveAttack(attacker, defender);
      if (result.hit) hitAny = true;
    }
    assert.ok(hitAny, "Unarmed attack should be able to hit");
  });
});

// ─── Unit Tests: AgentBrain ───

describe("AgentBrain", () => {
  function createTestState(): RaidState {
    const state = new RaidState();
    state.mapWidth = GAME.MAP_WIDTH;
    state.mapHeight = GAME.MAP_HEIGHT;
    state.tick = 10;
    state.phase = "active";
    return state;
  }

  function createTestAgent(
    sessionId: string,
    x: number,
    y: number,
    strategy: Strategy,
  ): Agent {
    const agent = new Agent();
    agent.sessionId = sessionId;
    agent.x = x;
    agent.y = y;
    agent.hp = 100;
    agent.maxHp = 100;
    agent.state = "alive";
    agent.strategy = strategy;
    return agent;
  }

  it("should return fallback action when no rule matches", () => {
    const strategy: Strategy = {
      name: "test",
      rules: [
        {
          priority: 0,
          conditions: [{ subject: "hp_percent", operator: "lte", value: 0 }],
          action: "HEAL",
        },
      ],
      fallbackAction: "MOVE_TO_RANDOM",
    };
    const state = createTestState();
    const agent = createTestAgent("a1", 25, 25, strategy);
    state.agents.set("a1", agent);

    const result = decide(agent, state);
    assert.strictEqual(result.action, "MOVE_TO_RANDOM");
  });

  it("should match first matching rule by priority", () => {
    const strategy: Strategy = {
      name: "test",
      rules: [
        {
          priority: 0,
          conditions: [{ subject: "hp_percent", operator: "lte", value: 100 }],
          action: "HEAL",
        },
        {
          priority: 1,
          conditions: [{ subject: "hp_percent", operator: "lte", value: 100 }],
          action: "FLEE",
        },
      ],
      fallbackAction: "MOVE_TO_RANDOM",
    };
    const state = createTestState();
    const agent = createTestAgent("a1", 25, 25, strategy);
    const bandage = new InventoryItem();
    bandage.itemId = "bandage";
    bandage.itemType = "consumable";
    bandage.quantity = 1;
    agent.inventory.push(bandage);
    state.agents.set("a1", agent);

    const result = decide(agent, state);
    assert.strictEqual(result.action, "HEAL");
  });

  it("should detect nearby enemies", () => {
    const strategy: Strategy = {
      name: "test",
      rules: [
        {
          priority: 0,
          conditions: [{ subject: "nearby_enemy_count", operator: "gte", value: 1 }],
          action: "ATTACK_NEAREST",
        },
      ],
      fallbackAction: "MOVE_TO_RANDOM",
    };
    const state = createTestState();

    const agent = createTestAgent("a1", 25, 25, strategy);
    state.agents.set("a1", agent);

    // Enemy within detection range
    const enemy = createTestAgent("enemy", 28, 25, strategy);
    state.agents.set("enemy", enemy);

    const result = decide(agent, state);
    assert.strictEqual(result.action, "ATTACK_NEAREST");
    assert.strictEqual(result.targetSessionId, "enemy");
    // Should also move toward enemy
    assert.strictEqual(result.targetX, 26);
    assert.strictEqual(result.targetY, 25);
  });

  it("should move toward nearest loot", () => {
    const strategy: Strategy = {
      name: "test",
      rules: [
        {
          priority: 0,
          conditions: [{ subject: "nearby_loot_count", operator: "gte", value: 1 }],
          action: "MOVE_TO_NEAREST_LOOT",
        },
      ],
      fallbackAction: "MOVE_TO_RANDOM",
    };
    const state = createTestState();
    const agent = createTestAgent("a1", 10, 10, strategy);
    state.agents.set("a1", agent);

    const loot = new MapObject();
    loot.id = "loot_0";
    loot.objectType = "LOOT_BOX";
    loot.x = 15;
    loot.y = 10;
    const item = new InventoryItem();
    item.itemId = "gold_coin";
    item.itemType = "valuable";
    item.quantity = 1;
    loot.items.push(item);
    state.objects.set("loot_0", loot);

    const result = decide(agent, state);
    assert.strictEqual(result.action, "MOVE_TO_NEAREST_LOOT");
    // Should move 1 step toward (15, 10) → x increases
    assert.strictEqual(result.targetX, 11);
    assert.strictEqual(result.targetY, 10);
  });

  it("should auto-loot when arriving at loot position", () => {
    const strategy: Strategy = {
      name: "test",
      rules: [
        {
          priority: 0,
          conditions: [{ subject: "nearby_loot_count", operator: "gte", value: 1 }],
          action: "MOVE_TO_NEAREST_LOOT",
        },
      ],
      fallbackAction: "MOVE_TO_RANDOM",
    };
    const state = createTestState();
    const agent = createTestAgent("a1", 15, 10, strategy);
    state.agents.set("a1", agent);

    const loot = new MapObject();
    loot.id = "loot_0";
    loot.objectType = "LOOT_BOX";
    loot.x = 15;
    loot.y = 10;
    const item = new InventoryItem();
    item.itemId = "gold_coin";
    item.itemType = "valuable";
    item.quantity = 1;
    loot.items.push(item);
    state.objects.set("loot_0", loot);

    const result = decide(agent, state);
    // Should switch to LOOT when already at loot position
    assert.strictEqual(result.action, "LOOT");
    assert.strictEqual(result.targetX, 15);
    assert.strictEqual(result.targetY, 10);
  });

  it("should honor pending override command", () => {
    const strategy: Strategy = {
      name: "test",
      rules: [
        {
          priority: 0,
          conditions: [{ subject: "hp_percent", operator: "lte", value: 100 }],
          action: "ATTACK_NEAREST",
        },
      ],
      fallbackAction: "MOVE_TO_RANDOM",
    };
    const state = createTestState();
    const agent = createTestAgent("a1", 25, 25, strategy);
    agent.pendingCommand = "FLEE";
    state.agents.set("a1", agent);

    const result = decide(agent, state);
    // Should use override instead of strategy
    assert.strictEqual(result.action, "FLEE");
    // Pending command should be cleared
    assert.strictEqual(agent.pendingCommand, null);
  });

  it("should move consistently toward waypoint on consecutive ticks", () => {
    const strategy: Strategy = {
      name: "test",
      rules: [
        {
          priority: 0,
          conditions: [{ subject: "hp_percent", operator: "lte", value: 0 }],
          action: "HEAL",
        },
      ],
      fallbackAction: "MOVE_TO_RANDOM",
    };
    const state = createTestState();
    const agent = createTestAgent("a1", 5, 5, strategy);
    state.agents.set("a1", agent);

    const result1 = decide(agent, state);
    assert.strictEqual(result1.action, "MOVE_TO_RANDOM");
    // Agent should now have a waypoint
    assert.ok(agent.wanderTargetX !== null);
    assert.ok(agent.wanderTargetY !== null);
    const wpX = agent.wanderTargetX!;
    const wpY = agent.wanderTargetY!;

    // Simulate agent moved to the returned position
    agent.x = result1.targetX!;
    agent.y = result1.targetY!;

    const result2 = decide(agent, state);
    assert.strictEqual(result2.action, "MOVE_TO_RANDOM");
    // Waypoint should remain the same (not arrived yet, not stuck)
    assert.strictEqual(agent.wanderTargetX, wpX);
    assert.strictEqual(agent.wanderTargetY, wpY);
  });

  it("should detect stuck agent and pick new waypoint", () => {
    const strategy: Strategy = {
      name: "test",
      rules: [
        {
          priority: 0,
          conditions: [{ subject: "hp_percent", operator: "lte", value: 0 }],
          action: "HEAL",
        },
      ],
      fallbackAction: "MOVE_TO_RANDOM",
    };
    const state = createTestState();
    const agent = createTestAgent("a1", 0, 0, strategy);
    state.agents.set("a1", agent);

    // Set waypoint and fill history with same position (stuck)
    agent.wanderTargetX = 49;
    agent.wanderTargetY = 49;
    agent.recentPositions = Array.from({ length: GAME.WANDER.historySize }, () => ({ x: 0, y: 0 }));

    const result = decide(agent, state);
    assert.strictEqual(result.action, "MOVE_TO_RANDOM");
    // Should have picked a new waypoint (history was cleared)
    assert.strictEqual(agent.recentPositions.length, 0);
  });

  it("should pick new waypoint when arriving at current one", () => {
    const strategy: Strategy = {
      name: "test",
      rules: [
        {
          priority: 0,
          conditions: [{ subject: "hp_percent", operator: "lte", value: 0 }],
          action: "HEAL",
        },
      ],
      fallbackAction: "MOVE_TO_RANDOM",
    };
    const state = createTestState();
    const agent = createTestAgent("a1", 25, 25, strategy);
    state.agents.set("a1", agent);

    // Set waypoint 1 tile away (should trigger new waypoint)
    agent.wanderTargetX = 26;
    agent.wanderTargetY = 25;

    const result = decide(agent, state);
    assert.strictEqual(result.action, "MOVE_TO_RANDOM");
    // New waypoint should have been chosen (not the old one at 26,25)
    const newDist =
      Math.abs(agent.wanderTargetX! - agent.x) +
      Math.abs(agent.wanderTargetY! - agent.y);
    assert.ok(newDist >= GAME.WANDER.minDist, `New waypoint should be at least ${GAME.WANDER.minDist} away, got ${newDist}`);
  });

  it("should clear wander state when non-random action is chosen", () => {
    const strategy: Strategy = {
      name: "test",
      rules: [
        {
          priority: 0,
          conditions: [{ subject: "nearby_enemy_count", operator: "gte", value: 1 }],
          action: "ATTACK_NEAREST",
        },
      ],
      fallbackAction: "MOVE_TO_RANDOM",
    };
    const state = createTestState();
    const agent = createTestAgent("a1", 25, 25, strategy);
    agent.wanderTargetX = 40;
    agent.wanderTargetY = 40;
    state.agents.set("a1", agent);

    // Add enemy in range to trigger ATTACK_NEAREST
    const enemy = createTestAgent("enemy", 27, 25, strategy);
    state.agents.set("enemy", enemy);

    const result = decide(agent, state);
    assert.strictEqual(result.action, "ATTACK_NEAREST");
    assert.strictEqual(agent.wanderTargetX, null);
    assert.strictEqual(agent.wanderTargetY, null);
  });

  it("should fall back to wandering when HEAL has no consumables", () => {
    const strategy: Strategy = {
      name: "test",
      rules: [
        {
          priority: 0,
          conditions: [{ subject: "hp_percent", operator: "lte", value: 50 }],
          action: "HEAL",
        },
      ],
      fallbackAction: "MOVE_TO_RANDOM",
    };
    const state = createTestState();
    const agent = createTestAgent("a1", 25, 25, strategy);
    agent.hp = 30; // Triggers HEAL rule, but no consumables in inventory
    state.agents.set("a1", agent);

    const result = decide(agent, state);
    // Should NOT be HEAL (no consumables), should fall back to movement
    assert.strictEqual(result.action, "MOVE_TO_RANDOM");
    assert.ok(result.targetX !== undefined);
    assert.ok(result.targetY !== undefined);
  });

  it("should move toward extraction point", () => {
    const strategy: Strategy = {
      name: "test",
      rules: [
        {
          priority: 0,
          conditions: [{ subject: "distance_to_extract", operator: "gt", value: 0 }],
          action: "MOVE_TO_EXTRACT",
        },
      ],
      fallbackAction: "MOVE_TO_RANDOM",
    };
    const state = createTestState();
    const agent = createTestAgent("a1", 45, 49, strategy);
    state.agents.set("a1", agent);

    // Add an extraction point for the agent to move toward
    const ext = new MapObject();
    ext.id = "extraction_0";
    ext.objectType = "EXTRACTION";
    ext.x = 49;
    ext.y = 49;
    state.objects.set(ext.id, ext);

    const result = decide(agent, state);
    assert.strictEqual(result.action, "MOVE_TO_EXTRACT");
    assert.strictEqual(result.targetX, 46);
    assert.strictEqual(result.targetY, 49);
  });
});

// ─── Unit Tests: TileGrid ───

import { TerrainType } from "../src/game/TileGrid.js";

describe("TileGrid", () => {
  it("should initialize all tiles as FLOOR", () => {
    const grid = new TileGrid(10, 10);
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        assert.strictEqual(grid.get(x, y), TerrainType.FLOOR);
      }
    }
  });

  it("should treat out-of-bounds as WALL", () => {
    const grid = new TileGrid(10, 10);
    assert.strictEqual(grid.get(-1, 0), TerrainType.WALL);
    assert.strictEqual(grid.get(10, 0), TerrainType.WALL);
    assert.strictEqual(grid.get(0, -1), TerrainType.WALL);
    assert.strictEqual(grid.get(0, 10), TerrainType.WALL);
  });

  it("should correctly report passable, cover, bush", () => {
    const grid = new TileGrid(10, 10);
    grid.set(1, 1, TerrainType.WALL);
    grid.set(2, 2, TerrainType.COVER);
    grid.set(3, 3, TerrainType.BUSH);

    assert.strictEqual(grid.isPassable(0, 0), true);  // FLOOR
    assert.strictEqual(grid.isPassable(1, 1), false);  // WALL
    assert.strictEqual(grid.isPassable(2, 2), true);   // COVER is passable
    assert.strictEqual(grid.isPassable(3, 3), true);   // BUSH is passable

    assert.strictEqual(grid.isCover(2, 2), true);
    assert.strictEqual(grid.isCover(0, 0), false);

    assert.strictEqual(grid.isBush(3, 3), true);
    assert.strictEqual(grid.isBush(0, 0), false);
  });

  it("should serialize to correct length string", () => {
    const grid = new TileGrid(5, 5);
    grid.set(0, 0, TerrainType.WALL);
    grid.set(1, 0, TerrainType.COVER);
    const s = grid.serialize();
    assert.strictEqual(s.length, 25);
    assert.strictEqual(s[0], "1"); // WALL
    assert.strictEqual(s[1], "2"); // COVER
    assert.strictEqual(s[2], "0"); // FLOOR
  });
});

// ─── Unit Tests: EquipmentSystem ───

import { autoEquipArmor, applyArmorDamageReduction } from "../src/game/EquipmentSystem.js";

describe("EquipmentSystem", () => {
  it("should auto-equip best armor from inventory", () => {
    const agent = new Agent();
    const helmet = new InventoryItem();
    helmet.itemId = "helmet";
    helmet.itemType = "armor";
    helmet.quantity = 1;
    agent.inventory.push(helmet);

    const bodyArmor = new InventoryItem();
    bodyArmor.itemId = "body_armor";
    bodyArmor.itemType = "armor";
    bodyArmor.quantity = 1;
    agent.inventory.push(bodyArmor);

    autoEquipArmor(agent);

    // body_armor has higher damageReduction (30 vs 15)
    assert.strictEqual(agent.equippedArmor, "body_armor");
    assert.strictEqual(agent.armorDurability, 100);
  });

  it("should not change armor if already best equipped", () => {
    const agent = new Agent();
    agent.equippedArmor = "body_armor";
    agent.armorDurability = 80;

    const bodyArmor = new InventoryItem();
    bodyArmor.itemId = "body_armor";
    bodyArmor.itemType = "armor";
    bodyArmor.quantity = 1;
    agent.inventory.push(bodyArmor);

    autoEquipArmor(agent);
    // Should keep existing durability
    assert.strictEqual(agent.equippedArmor, "body_armor");
    assert.strictEqual(agent.armorDurability, 80);
  });

  it("should reduce damage with armor equipped", () => {
    const agent = new Agent();
    agent.equippedArmor = "body_armor"; // 30% reduction
    agent.armorDurability = 100;

    const result = applyArmorDamageReduction(agent, 20);

    // 30% of 20 = 6 absorbed, 14 final (min 1)
    assert.strictEqual(result.armorAbsorbed, 6);
    assert.strictEqual(result.finalDamage, 14);
    assert.strictEqual(agent.armorDurability, 94); // 100 - 6
  });

  it("should deal full damage with no armor", () => {
    const agent = new Agent();
    const result = applyArmorDamageReduction(agent, 25);
    assert.strictEqual(result.finalDamage, 25);
    assert.strictEqual(result.armorAbsorbed, 0);
  });

  it("should destroy armor when durability reaches 0", () => {
    const agent = new Agent();
    agent.equippedArmor = "helmet"; // 15% reduction, 50 durability
    agent.armorDurability = 3;      // Almost broken

    const helmet = new InventoryItem();
    helmet.itemId = "helmet";
    helmet.itemType = "armor";
    helmet.quantity = 1;
    agent.inventory.push(helmet);

    const result = applyArmorDamageReduction(agent, 25);
    // 15% of 25 = 3.75 → rounded 4, but durability is 3, armor breaks
    assert.strictEqual(agent.equippedArmor, "");
    assert.strictEqual(agent.armorDurability, 0);
    assert.strictEqual(agent.inventory.length, 0); // helmet removed
  });
});

// ─── Unit Tests: AI ReplanTrigger ───

import { shouldReplan } from "../src/ai/replanTrigger.js";
import { createReplanState } from "../src/ai/types.js";
import type { StateSnapshot } from "../src/ai/types.js";

describe("AI ReplanTrigger", () => {
  function makeSnapshot(overrides: Partial<StateSnapshot> = {}): StateSnapshot {
    return {
      hp_percent: 80,
      position: { x: 25, y: 25 },
      inventory: ["ak47"],
      nearby_enemy_count: 0,
      nearest_enemy_distance: Infinity,
      nearby_loot_count: 1,
      nearest_loot_distance: 5,
      distance_to_extract: 50,
      extraction_available: true,
      tick: 50,
      has_armor: false,
      ...overrides,
    };
  }

  it("should trigger on timer (30 ticks since last replan)", () => {
    const state = createReplanState();
    state.lastReplanTick = 0;
    const snap = makeSnapshot();
    assert.strictEqual(shouldReplan(snap, state, 30), true);
  });

  it("should NOT trigger before timer expires", () => {
    const state = createReplanState();
    state.lastReplanTick = 10;
    const snap = makeSnapshot();
    assert.strictEqual(shouldReplan(snap, state, 20), false);
  });

  it("should trigger on HP critical drop", () => {
    const state = createReplanState();
    state.lastReplanTick = 45;
    state.lastHp = 50; // Was above 30%
    const snap = makeSnapshot({ hp_percent: 25 }); // Now critical
    assert.strictEqual(shouldReplan(snap, state, 50), true);
  });

  it("should trigger on new enemy detected", () => {
    const state = createReplanState();
    state.lastReplanTick = 45;
    state.lastEnemyCount = 0;
    const snap = makeSnapshot({ nearby_enemy_count: 1 });
    assert.strictEqual(shouldReplan(snap, state, 50), true);
  });

  it("should trigger on loot depleted", () => {
    const state = createReplanState();
    state.lastReplanTick = 45;
    state.lastLootCount = 2;
    const snap = makeSnapshot({ nearby_loot_count: 0 });
    assert.strictEqual(shouldReplan(snap, state, 50), true);
  });

  it("should trigger on extraction proximity", () => {
    const state = createReplanState();
    state.lastReplanTick = 35; // 15 ticks ago (> 10 cooldown)
    const snap = makeSnapshot({ distance_to_extract: 3 });
    assert.strictEqual(shouldReplan(snap, state, 50), true);
  });

  it("should NOT trigger when pending replan in progress", () => {
    const state = createReplanState();
    state.pendingReplan = true;
    state.lastReplanTick = 0; // Timer expired
    const snap = makeSnapshot();
    assert.strictEqual(shouldReplan(snap, state, 50), false);
  });

  it("should respect rate limit (max 3 per minute)", () => {
    const state = createReplanState();
    state.lastReplanTick = 0;
    state.replanCount = 3;
    state.lastReplanMinute = 0; // Same minute
    const snap = makeSnapshot();
    assert.strictEqual(shouldReplan(snap, state, 30), false); // Rate limited
  });
});

// ─── Unit Tests: AI SnapshotBuilder ───

import { buildStateSnapshot, buildPerception, serializePerception, summarizeEventLog } from "../src/ai/snapshotBuilder.js";
import type { EventLogEntry } from "../src/ai/snapshotBuilder.js";

describe("AI SnapshotBuilder", () => {
  function createTestState(): RaidState {
    const state = new RaidState();
    state.mapWidth = GAME.MAP_WIDTH;
    state.mapHeight = GAME.MAP_HEIGHT;
    state.tick = 50;
    state.phase = "active";
    return state;
  }

  it("should build correct state snapshot", () => {
    const state = createTestState();
    const agent = new Agent();
    agent.sessionId = "a1";
    agent.x = 10;
    agent.y = 10;
    agent.hp = 75;
    agent.maxHp = 100;
    state.agents.set("a1", agent);

    // Add enemy nearby
    const enemy = new Agent();
    enemy.sessionId = "e1";
    enemy.x = 13;
    enemy.y = 10;
    enemy.state = "alive";
    state.agents.set("e1", enemy);

    const snap = buildStateSnapshot(agent, state);
    assert.strictEqual(snap.hp_percent, 75);
    assert.strictEqual(snap.position.x, 10);
    assert.strictEqual(snap.position.y, 10);
    assert.strictEqual(snap.nearby_enemy_count, 1);
    assert.strictEqual(snap.nearest_enemy_distance, 3);
    assert.strictEqual(snap.tick, 50);
  });

  it("should build perception with threats and opportunities", () => {
    const state = createTestState();
    const agent = new Agent();
    agent.sessionId = "a1";
    agent.x = 25;
    agent.y = 25;
    agent.hp = 60;
    agent.maxHp = 100;
    state.agents.set("a1", agent);

    // Enemy to the east
    const enemy = new Agent();
    enemy.sessionId = "e1";
    enemy.x = 30;
    enemy.y = 25;
    enemy.state = "alive";
    state.agents.set("e1", enemy);

    // Loot to the west
    const loot = new MapObject();
    loot.id = "loot_0";
    loot.objectType = "LOOT_BOX";
    loot.x = 20;
    loot.y = 25;
    const item = new InventoryItem();
    item.itemId = "gold_coin";
    item.itemType = "valuable";
    item.quantity = 1;
    loot.items.push(item);
    state.objects.set("loot_0", loot);

    const perception = buildPerception(agent, state);
    assert.strictEqual(perception.threats.length, 1);
    assert.strictEqual(perception.threats[0].distance, 5);
    assert.strictEqual(perception.threats[0].direction, "E");
    assert.ok(perception.opportunities.length >= 1);
    assert.strictEqual(perception.self.hp_percent, 60);
  });

  it("should serialize perception to compact string", () => {
    const perception = {
      threats: [{ distance: 5, direction: "E" }],
      opportunities: [{ type: "LootBox", distance: 3, direction: "W" }],
      environment: { terrain_cover: false },
      self: { hp_percent: 80, armor: false, inventory_summary: "ak47, bandage" },
    };
    const str = serializePerception(perception);
    assert.ok(str.includes("HP 80%"));
    assert.ok(str.includes("Enemy 5 tiles E"));
    assert.ok(str.includes("LootBox 3 tiles W"));
  });

  it("should summarize recent event log", () => {
    const events: EventLogEntry[] = [
      { tick: 40, agentSessionId: "a1", type: "attack", message: "dealt 15dmg to e1" },
      { tick: 45, agentSessionId: "a1", type: "loot", message: "looted bandage" },
      { tick: 42, agentSessionId: "a2", type: "attack", message: "dealt 10dmg to a1" }, // different agent
    ];
    const summary = summarizeEventLog(events, "a1", 15, 50);
    assert.ok(summary.includes("dealt 15dmg"));
    assert.ok(summary.includes("looted bandage"));
    assert.ok(!summary.includes("a2")); // Filtered out
  });

  it("should return 'No recent events' for empty log", () => {
    const summary = summarizeEventLog([], "a1", 10, 50);
    assert.strictEqual(summary, "No recent events");
  });
});
