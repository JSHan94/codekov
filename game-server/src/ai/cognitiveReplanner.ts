import { aiProvider } from "./aiClient.js";
import type { CognitiveReplanResult } from "./types.js";
import type { AgentWorldState } from "./cognitiveTypes.js";

export async function cognitiveReplan(
  perception: string,
  memory: string,
  currentState: AgentWorldState | null,
  events: string,
): Promise<CognitiveReplanResult> {
  return aiProvider.cognitiveReplan(perception, memory, currentState, events);
}
