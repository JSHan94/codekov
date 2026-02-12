import type { ReplanState, StateSnapshot } from "./types.js";

const REPLAN_TIMER_TICKS = 30;
const HP_CRITICAL_THRESHOLD = 30;
const EXTRACT_CLOSE_DISTANCE = 5;
const EXTRACT_MIN_TICKS_BETWEEN = 10;
const MAX_REPLANS_PER_MINUTE = 3;

export function shouldReplan(
  snapshot: StateSnapshot,
  replanState: ReplanState,
  currentTick: number,
): boolean {
  // Async call in progress — don't trigger another
  if (replanState.pendingReplan) return false;

  // Rate limit: max N replans per minute (60s / 0.3s per tick ≈ 200 ticks)
  const currentMinute = Math.floor(currentTick / 200);
  if (currentMinute === replanState.lastReplanMinute && replanState.replanCount >= MAX_REPLANS_PER_MINUTE) {
    return false;
  }

  const ticksSinceReplan = currentTick - replanState.lastReplanTick;

  // Timer trigger: replan every N ticks
  if (ticksSinceReplan >= REPLAN_TIMER_TICKS) return true;

  // HP critical trigger: HP dropped below threshold
  if (snapshot.hp_percent <= HP_CRITICAL_THRESHOLD && replanState.lastHp > HP_CRITICAL_THRESHOLD) return true;

  // New enemy detected trigger
  if (snapshot.nearby_enemy_count > replanState.lastEnemyCount) return true;

  // Loot depleted trigger
  if (snapshot.nearby_loot_count === 0 && replanState.lastLootCount > 0) return true;

  // Extraction proximity trigger (with cooldown)
  if (snapshot.distance_to_extract <= EXTRACT_CLOSE_DISTANCE && ticksSinceReplan >= EXTRACT_MIN_TICKS_BETWEEN) return true;

  return false;
}
