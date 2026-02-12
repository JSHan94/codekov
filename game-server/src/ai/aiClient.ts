import { StrategySchema, type Strategy } from "../types/strategy.js";
import type { AIProvider, StateSnapshot, CognitiveReplanResult } from "./types.js";
import type { AgentWorldState } from "./cognitiveTypes.js";
import {
  STRATEGY_GENERATION_SYSTEM_PROMPT,
  REPLAN_SYSTEM_PROMPT,
  COGNITIVE_REPLAN_SYSTEM_PROMPT,
  STRATEGY_TOOL_DEFINITION,
  COGNITIVE_TOOL_DEFINITION,
} from "./prompts.js";
import fixtures from "./fixtures.json" with { type: "json" };

// ─── Anthropic Provider (production) ───

class AnthropicProvider implements AIProvider {
  private client: any;
  private initPromise: Promise<void>;

  constructor(apiKey: string) {
    // Lazy import to avoid requiring the SDK when using MockProvider
    this.initPromise = this.init(apiKey);
  }

  private async init(apiKey: string) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    this.client = new Anthropic({ apiKey });
  }

  private async ensureClient(): Promise<any> {
    await this.initPromise;
    return this.client;
  }

  async generateStrategy(description: string): Promise<Strategy> {
    const client = await this.ensureClient();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: [
        {
          type: "text",
          text: STRATEGY_GENERATION_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Create a strategy based on this description: "${description}"`,
        },
      ],
      tools: [STRATEGY_TOOL_DEFINITION],
      tool_choice: { type: "tool", name: "update_strategy" },
    });

    return this.parseResponse(response);
  }

  async replanStrategy(snapshot: StateSnapshot, events: string): Promise<Strategy> {
    const client = await this.ensureClient();
    const stateStr = this.formatSnapshot(snapshot);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: [
        {
          type: "text",
          text: REPLAN_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `State: ${stateStr}\nEvents: ${events}\nUpdate strategy.`,
        },
      ],
      tools: [STRATEGY_TOOL_DEFINITION],
      tool_choice: { type: "tool", name: "update_strategy" },
    });

    return this.parseResponse(response);
  }

  private formatSnapshot(snapshot: StateSnapshot): string {
    return [
      `HP:${snapshot.hp_percent.toFixed(0)}%`,
      `Pos:(${snapshot.position.x},${snapshot.position.y})`,
      `Inv:[${snapshot.inventory.join(",")}]`,
      `Enemies:${snapshot.nearby_enemy_count} [dist:${snapshot.nearest_enemy_distance === Infinity ? "none" : snapshot.nearest_enemy_distance}]`,
      `Loot:${snapshot.nearby_loot_count} [dist:${snapshot.nearest_loot_distance === Infinity ? "none" : snapshot.nearest_loot_distance}]`,
      `Extract dist:${snapshot.distance_to_extract}`,
      `Tick:${snapshot.tick}`,
      `Armor:${snapshot.has_armor}`,
    ].join(" ");
  }

  async cognitiveReplan(
    perception: string,
    memory: string,
    currentState: AgentWorldState | null,
    events: string,
  ): Promise<CognitiveReplanResult> {
    const client = await this.ensureClient();

    const stateContext = currentState
      ? `Previous assessment: threat=${currentState.threat_level}, resources=${currentState.resource_status}, objective="${currentState.objective}", confidence=${currentState.confidence}`
      : "No previous assessment (first replan)";

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 768,
      system: [
        {
          type: "text",
          text: COGNITIVE_REPLAN_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `PERCEPTION:\n${perception}\n\nMEMORY:\n${memory}\n\nCURRENT STATE:\n${stateContext}\n\nRECENT EVENTS:\n${events}\n\nAnalyze and update strategy.`,
        },
      ],
      tools: [COGNITIVE_TOOL_DEFINITION],
      tool_choice: { type: "tool", name: "cognitive_update_strategy" },
    });

    return this.parseCognitiveResponse(response);
  }

  private parseResponse(response: any): Strategy {
    const toolBlock = response.content.find(
      (block: any) => block.type === "tool_use" && block.name === "update_strategy"
    );
    if (!toolBlock) {
      throw new Error("No tool_use block in response");
    }

    const parsed = StrategySchema.safeParse(toolBlock.input);
    if (!parsed.success) {
      throw new Error(`Strategy validation failed: ${parsed.error.message}`);
    }
    return parsed.data;
  }

  private parseCognitiveResponse(response: any): CognitiveReplanResult {
    const toolBlock = response.content.find(
      (block: any) => block.type === "tool_use" && block.name === "cognitive_update_strategy"
    );
    if (!toolBlock) {
      throw new Error("No cognitive tool_use block in response");
    }

    const input = toolBlock.input;

    const parsed = StrategySchema.safeParse({
      name: input.name,
      rules: input.rules,
      fallbackAction: input.fallbackAction,
    });
    if (!parsed.success) {
      throw new Error(`Cognitive strategy validation failed: ${parsed.error.message}`);
    }

    return {
      strategy: parsed.data,
      plan: {
        reasoning: input.reasoning ?? "",
        situation_assessment: input.situation_assessment ?? "",
        chosen_approach: input.chosen_approach ?? "",
      },
      worldState: {
        threat_level: input.threat_level ?? "medium",
        resource_status: input.resource_status ?? "sufficient",
        objective: input.objective ?? "",
        confidence: typeof input.confidence === "number" ? input.confidence : 0.5,
      },
    };
  }
}

// ─── Mock Provider (dev mode) ───

class MockProvider implements AIProvider {
  async generateStrategy(description: string): Promise<Strategy> {
    // Simulate API latency
    await new Promise((resolve) => setTimeout(resolve, 200));

    const lower = description.toLowerCase();
    const gen = fixtures.strategyGeneration;

    let strategy: Strategy;
    if (lower.match(/공격|attack|aggress|fight|kill/)) {
      strategy = gen.aggressive as Strategy;
    } else if (lower.match(/방어|defen|safe|careful|cautious/)) {
      strategy = gen.defensive as Strategy;
    } else if (lower.match(/루팅|loot|collect|gather|item/)) {
      strategy = gen.loot_focused as Strategy;
    } else {
      strategy = gen._default as Strategy;
    }

    console.log(`[MockProvider] generateStrategy: "${description}" → ${strategy.name}`);
    return structuredClone(strategy);
  }

  async replanStrategy(snapshot: StateSnapshot, _events: string): Promise<Strategy> {
    // Simulate API latency
    await new Promise((resolve) => setTimeout(resolve, 100));

    const replan = fixtures.replan;
    let key: string;

    if (snapshot.hp_percent < 30) {
      key = "critical_hp";
    } else if (snapshot.nearby_enemy_count >= 2 && snapshot.hp_percent > 50) {
      key = "enemy_nearby_strong";
    } else if (snapshot.nearby_loot_count > 0 && snapshot.nearby_enemy_count === 0) {
      key = "loot_available_safe";
    } else if (snapshot.distance_to_extract <= 10) {
      key = "near_extract";
    } else {
      key = "_default";
    }

    const strategy = replan[key as keyof typeof replan] as Strategy;
    console.log(`[MockProvider] replan triggered: ${key} → ${strategy.name}`);
    return structuredClone(strategy);
  }

  async cognitiveReplan(
    _perception: string,
    _memory: string,
    _currentState: AgentWorldState | null,
    _events: string,
  ): Promise<CognitiveReplanResult> {
    // Simulate API latency
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Derive key from perception text (simple heuristic)
    const replan = fixtures.replan;
    let key: string;

    const hpMatch = _perception.match(/HP (\d+)%/);
    const hp = hpMatch ? parseInt(hpMatch[1], 10) : 50;
    const hasEnemy = _perception.includes("Enemy");

    if (hp < 30) {
      key = "critical_hp";
    } else if (hasEnemy && hp > 50) {
      key = "enemy_nearby_strong";
    } else if (_perception.includes("LootBox") && !hasEnemy) {
      key = "loot_available_safe";
    } else if (_perception.includes("Extraction")) {
      key = "near_extract";
    } else {
      key = "_default";
    }

    const fixture = replan[key as keyof typeof replan] as any;
    const cognitive = fixture.cognitive;
    const strategy: Strategy = structuredClone({
      name: fixture.name,
      rules: fixture.rules,
      fallbackAction: fixture.fallbackAction,
    });

    console.log(`[MockProvider] cognitive replan: ${key} → ${strategy.name} | reasoning="${cognitive.reasoning.slice(0, 60)}..."`);

    return {
      strategy,
      plan: {
        reasoning: cognitive.reasoning,
        situation_assessment: cognitive.situation_assessment,
        chosen_approach: cognitive.chosen_approach,
      },
      worldState: {
        threat_level: cognitive.threat_level,
        resource_status: cognitive.resource_status,
        objective: cognitive.objective,
        confidence: cognitive.confidence,
      },
    };
  }
}

// ─── Provider selection ───

function createProvider(): AIProvider {
  if (process.env.ANTHROPIC_API_KEY) {
    console.log("[AI] Using AnthropicProvider (API key detected)");
    return new AnthropicProvider(process.env.ANTHROPIC_API_KEY);
  }
  console.log("[AI] Using MockProvider (no ANTHROPIC_API_KEY)");
  return new MockProvider();
}

export const aiProvider: AIProvider = createProvider();
