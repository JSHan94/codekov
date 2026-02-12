import type { Agent, RaidState } from "../rooms/schema/RaidState.js";
import { GAME } from "../config/game.constants.js";
import { PERSONALITIES, type PersonalityType } from "../types/personality.js";
import type { RecruitmentDialogueEvent, RecruitmentResultEvent } from "../types/recruitment-messages.js";

function manhattanDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

export interface ActiveRecruitment {
  playerSessionId: string;
  targetSessionId: string;
  dialogue: RecruitmentDialogueEvent;
  startedAtTick: number;
}

export class RecruitmentSystem {
  private activeRecruitments = new Map<string, ActiveRecruitment>();

  /**
   * Check if a recruitment attempt can be initiated.
   */
  canInitiate(
    player: Agent,
    target: Agent,
    state: RaidState,
  ): { ok: boolean; reason?: string } {
    if (target.allyStatus !== "neutral") {
      return { ok: false, reason: "Target is not neutral" };
    }

    if (target.state !== "alive") {
      return { ok: false, reason: "Target is not alive" };
    }

    const dist = manhattanDistance(player.x, player.y, target.x, target.y);
    if (dist > GAME.RECRUITMENT.PROXIMITY_RANGE) {
      return { ok: false, reason: "Too far away" };
    }

    if (target.recruitmentCooldown > state.tick) {
      return { ok: false, reason: "Target is on cooldown" };
    }

    // Check max allies
    let allyCount = 0;
    state.agents.forEach((agent) => {
      if (agent.allyStatus === "ally" && agent.allyOwnerId === player.sessionId) {
        allyCount++;
      }
    });
    if (allyCount >= GAME.ALLY.MAX_ALLIES) {
      return { ok: false, reason: "Maximum allies reached" };
    }

    // Check if already recruiting
    if (this.activeRecruitments.has(player.sessionId)) {
      return { ok: false, reason: "Already in recruitment" };
    }

    return { ok: true };
  }

  /**
   * Start a recruitment dialogue.
   */
  startRecruitment(
    playerSessionId: string,
    targetSessionId: string,
    dialogue: RecruitmentDialogueEvent,
    tick: number,
  ): void {
    this.activeRecruitments.set(playerSessionId, {
      playerSessionId,
      targetSessionId,
      dialogue,
      startedAtTick: tick,
    });
  }

  /**
   * Process a recruitment choice.
   * Returns the result event.
   */
  processChoice(
    playerSessionId: string,
    choiceIndex: number,
    target: Agent,
    tick: number,
  ): RecruitmentResultEvent | null {
    const recruitment = this.activeRecruitments.get(playerSessionId);
    if (!recruitment) return null;
    if (recruitment.targetSessionId !== target.sessionId) return null;

    const choice = recruitment.dialogue.choices[choiceIndex];
    if (!choice) return null;

    // Determine success based on choice success chance and personality difficulty
    const personality = PERSONALITIES[target.personality as PersonalityType];
    const baseDifficulty = personality?.recruitDifficulty ?? 0.5;
    const effectiveChance = choice.successChance * (1 - baseDifficulty);
    const success = Math.random() < effectiveChance;

    // Clean up
    this.activeRecruitments.delete(playerSessionId);

    // Set cooldown on target if failed
    if (!success) {
      target.recruitmentCooldown = tick + GAME.RECRUITMENT.COOLDOWN_TICKS;
    }

    return {
      tick,
      targetSessionId: target.sessionId,
      success,
      responseLine: success
        ? "Alright, I'm with you. Let's survive this together."
        : "No... I don't think so. Leave me alone.",
    };
  }

  /**
   * Cancel/dismiss a recruitment.
   */
  dismiss(playerSessionId: string): void {
    this.activeRecruitments.delete(playerSessionId);
  }

  getActiveRecruitment(playerSessionId: string): ActiveRecruitment | undefined {
    return this.activeRecruitments.get(playerSessionId);
  }

  hasActiveRecruitment(playerSessionId: string): boolean {
    return this.activeRecruitments.has(playerSessionId);
  }
}
