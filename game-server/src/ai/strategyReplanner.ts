import { aiProvider } from "./aiClient.js";
import type { Strategy } from "../types/strategy.js";
import type { StateSnapshot } from "./types.js";

export async function replanStrategy(
  snapshot: StateSnapshot,
  recentEvents: string,
): Promise<Strategy> {
  return aiProvider.replanStrategy(snapshot, recentEvents);
}
