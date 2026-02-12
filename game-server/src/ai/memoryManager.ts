import type { MemoryEntry } from "./cognitiveTypes.js";

const MAX_BUFFER_SIZE = 20;
const DEFAULT_LLM_COUNT = 10;

export class MemoryManager {
  private memories = new Map<string, MemoryEntry[]>();

  record(agentSessionId: string, entry: MemoryEntry): void {
    let buffer = this.memories.get(agentSessionId);
    if (!buffer) {
      buffer = [];
      this.memories.set(agentSessionId, buffer);
    }
    buffer.push(entry);
    if (buffer.length > MAX_BUFFER_SIZE) {
      buffer.splice(0, buffer.length - MAX_BUFFER_SIZE);
    }
  }

  getRecent(agentSessionId: string, count: number = DEFAULT_LLM_COUNT): MemoryEntry[] {
    const buffer = this.memories.get(agentSessionId);
    if (!buffer || buffer.length === 0) return [];
    return buffer.slice(-count);
  }

  clear(agentSessionId: string): void {
    this.memories.delete(agentSessionId);
  }

  serializeForLLM(agentSessionId: string): string {
    const recent = this.getRecent(agentSessionId, DEFAULT_LLM_COUNT);
    if (recent.length === 0) return "No memories yet.";
    return recent
      .map((m) => `T${m.tick} [${m.type}] ${m.summary}`)
      .join("\n");
  }
}
