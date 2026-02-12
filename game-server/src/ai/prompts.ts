export const STRATEGY_GENERATION_SYSTEM_PROMPT = `You are a strategy generator for CODEKOV, a tactical raid simulation game.

GAME RULES:
- 50x50 grid map with up to 10 agents
- Agents collect loot, fight enemies, and try to extract alive
- Each tick (300ms), agents evaluate strategy rules in priority order
- First matching rule executes; fallback action if none match
- Permadeath: dying loses all items

AVAILABLE CONDITION SUBJECTS:
- hp_percent (0-100)
- nearby_enemy_count (0+)
- nearest_enemy_distance (0+, Infinity if none)
- nearby_loot_count (0+)
- nearest_loot_distance (0+, Infinity if none)
- inventory_count (0+)
- distance_to_extract (0+)
- tick (0+)
- has_cover (0 or 1)
- has_armor (0 or 1)
- armor_durability (0+)
- has_grenade (0+)
- has_smoke (0+)
- has_trap (0+)
- extraction_available (0=no extraction points, 1=extraction points exist)

OPERATORS: lt, lte, gt, gte, eq

AVAILABLE ACTIONS:
- MOVE_TO_NEAREST_LOOT: Move toward closest loot box
- MOVE_TO_EXTRACT: Move toward nearest dynamic extraction point
- MOVE_TO_RANDOM: Wander randomly
- ATTACK_NEAREST: Move toward and attack closest enemy
- LOOT: Pick up items at current position
- FLEE: Run away from nearest enemy
- HEAL: Use consumable to restore HP
- EXTRACT: Extract at extraction point (1-use, point is consumed)
- USE_GRENADE: Throw grenade at nearest enemy
- USE_SMOKE: Deploy smoke at current position
- PLACE_TRAP: Place trap at current position

STRATEGY JSON SCHEMA:
- name: string (1-64 chars, descriptive name)
- rules: array of {priority: int (0=highest), conditions: [{subject, operator, value}], action: string}
- fallbackAction: string (action when no rules match)

GUIDELINES:
- Create 3-6 rules with clear priority ordering
- Always include a HEAL rule for low HP
- Make rules practical and effective`;

export const REPLAN_SYSTEM_PROMPT = `You are a tactical AI for CODEKOV raid game. Update the agent's strategy based on current situation.

GAME RULES:
- 50x50 grid, agents collect loot, fight, extract to survive
- Strategy rules evaluated each tick in priority order
- First matching rule executes; fallback if none match

CONDITION SUBJECTS: hp_percent, nearby_enemy_count, nearest_enemy_distance, nearby_loot_count, nearest_loot_distance, inventory_count, distance_to_extract, tick, has_cover, has_armor, armor_durability, has_grenade, has_smoke, has_trap, extraction_available

OPERATORS: lt, lte, gt, gte, eq

ACTIONS: MOVE_TO_NEAREST_LOOT, MOVE_TO_EXTRACT, MOVE_TO_RANDOM, ATTACK_NEAREST, LOOT, FLEE, HEAL, EXTRACT, USE_GRENADE, USE_SMOKE, PLACE_TRAP

Create an optimal strategy (3-6 rules) for the current situation. Prioritize survival.`;

export const COGNITIVE_REPLAN_SYSTEM_PROMPT = `You are a tactical AI agent in CODEKOV, a raid simulation game. You think through your decisions step by step.

You will receive:
1. PERCEPTION: What you currently observe (threats, opportunities, environment, self-status)
2. MEMORY: Your recent experiences and observations
3. CURRENT STATE: Your previous world assessment (if any)
4. EVENTS: Recent game events affecting you

Your job: Analyze the situation, reason about the best approach, and output an updated strategy.

THINK STEP BY STEP:
1. Assess the situation based on perception and memory
2. Evaluate threat level and resource status
3. Decide on an objective and approach
4. Create strategy rules that implement your chosen approach

CONDITION SUBJECTS: hp_percent, nearby_enemy_count, nearest_enemy_distance, nearby_loot_count, nearest_loot_distance, inventory_count, distance_to_extract, tick, has_cover, has_armor, armor_durability, has_grenade, has_smoke, has_trap, extraction_available

OPERATORS: lt, lte, gt, gte, eq

ACTIONS: MOVE_TO_NEAREST_LOOT, MOVE_TO_EXTRACT, MOVE_TO_RANDOM, ATTACK_NEAREST, LOOT, FLEE, HEAL, EXTRACT, USE_GRENADE, USE_SMOKE, PLACE_TRAP

Create an optimal strategy (3-6 rules) with your reasoning. Prioritize survival.`;

export const COGNITIVE_TOOL_DEFINITION = {
  name: "cognitive_update_strategy",
  description: "Update the agent's strategy with reasoning about the current situation",
  input_schema: {
    type: "object" as const,
    properties: {
      reasoning: {
        type: "string",
        description: "Your step-by-step thought process about the current situation (2-3 sentences)",
      },
      situation_assessment: {
        type: "string",
        description: "Brief assessment of the current situation",
      },
      chosen_approach: {
        type: "string",
        description: "The approach you chose and why",
      },
      threat_level: {
        type: "string",
        enum: ["low", "medium", "high", "critical"],
        description: "Current threat level assessment",
      },
      resource_status: {
        type: "string",
        enum: ["abundant", "sufficient", "scarce", "depleted"],
        description: "Current resource/inventory status",
      },
      objective: {
        type: "string",
        description: "Current primary objective (natural language)",
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confidence in chosen strategy (0-1)",
      },
      name: {
        type: "string",
        description: "Strategy name (1-64 chars)",
        minLength: 1,
        maxLength: 64,
      },
      rules: {
        type: "array",
        items: {
          type: "object",
          properties: {
            priority: {
              type: "integer",
              minimum: 0,
              description: "Rule priority (0 = highest priority)",
            },
            conditions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  subject: {
                    type: "string",
                    enum: [
                      "hp_percent", "nearby_enemy_count", "nearest_enemy_distance",
                      "nearby_loot_count", "nearest_loot_distance", "inventory_count",
                      "distance_to_extract", "tick", "has_cover", "has_armor",
                      "armor_durability", "has_grenade", "has_smoke", "has_trap",
                      "extraction_available",
                    ],
                  },
                  operator: { type: "string", enum: ["lt", "lte", "gt", "gte", "eq"] },
                  value: { type: "number" },
                },
                required: ["subject", "operator", "value"],
              },
              minItems: 1,
            },
            action: {
              type: "string",
              enum: [
                "MOVE_TO_NEAREST_LOOT", "MOVE_TO_EXTRACT", "MOVE_TO_RANDOM",
                "ATTACK_NEAREST", "LOOT", "FLEE", "HEAL", "EXTRACT",
                "USE_GRENADE", "USE_SMOKE", "PLACE_TRAP",
              ],
            },
          },
          required: ["priority", "conditions", "action"],
        },
        minItems: 1,
      },
      fallbackAction: {
        type: "string",
        enum: [
          "MOVE_TO_NEAREST_LOOT", "MOVE_TO_EXTRACT", "MOVE_TO_RANDOM",
          "ATTACK_NEAREST", "LOOT", "FLEE", "HEAL", "EXTRACT",
          "USE_GRENADE", "USE_SMOKE", "PLACE_TRAP",
        ],
      },
    },
    required: [
      "reasoning", "situation_assessment", "chosen_approach",
      "threat_level", "resource_status", "objective", "confidence",
      "name", "rules", "fallbackAction",
    ],
  },
};

export const STRATEGY_TOOL_DEFINITION = {
  name: "update_strategy",
  description: "Update the agent's strategy with new rules based on current game state",
  input_schema: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Strategy name (1-64 chars)",
        minLength: 1,
        maxLength: 64,
      },
      rules: {
        type: "array",
        items: {
          type: "object",
          properties: {
            priority: {
              type: "integer",
              minimum: 0,
              description: "Rule priority (0 = highest priority)",
            },
            conditions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  subject: {
                    type: "string",
                    enum: [
                      "hp_percent", "nearby_enemy_count", "nearest_enemy_distance",
                      "nearby_loot_count", "nearest_loot_distance", "inventory_count",
                      "distance_to_extract", "tick", "has_cover", "has_armor",
                      "armor_durability", "has_grenade", "has_smoke", "has_trap",
                      "extraction_available",
                    ],
                  },
                  operator: { type: "string", enum: ["lt", "lte", "gt", "gte", "eq"] },
                  value: { type: "number" },
                },
                required: ["subject", "operator", "value"],
              },
              minItems: 1,
            },
            action: {
              type: "string",
              enum: [
                "MOVE_TO_NEAREST_LOOT", "MOVE_TO_EXTRACT", "MOVE_TO_RANDOM",
                "ATTACK_NEAREST", "LOOT", "FLEE", "HEAL", "EXTRACT",
                "USE_GRENADE", "USE_SMOKE", "PLACE_TRAP",
              ],
            },
          },
          required: ["priority", "conditions", "action"],
        },
        minItems: 1,
      },
      fallbackAction: {
        type: "string",
        enum: [
          "MOVE_TO_NEAREST_LOOT", "MOVE_TO_EXTRACT", "MOVE_TO_RANDOM",
          "ATTACK_NEAREST", "LOOT", "FLEE", "HEAL", "EXTRACT",
          "USE_GRENADE", "USE_SMOKE", "PLACE_TRAP",
        ],
      },
    },
    required: ["name", "rules", "fallbackAction"],
  },
};
