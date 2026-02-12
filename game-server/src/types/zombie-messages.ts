export interface ZombieSpawnEvent {
  tick: number;
  zombieId: string;
  zombieType: string;
  x: number;
  y: number;
}

export interface ZombieAttackEvent {
  tick: number;
  zombieId: string;
  targetSessionId: string;
  damage: number;
  targetHpAfter: number;
}

export interface ZombieDeathEvent {
  tick: number;
  zombieId: string;
  killerSessionId: string | null;
  x: number;
  y: number;
}
