export type ZombieType = "basic";

export interface ZombieConfig {
  type: ZombieType;
  hp: number;
  damage: number;
  speed: number; // tiles per tick (1 = move every tick)
  attackRange: number; // manhattan distance to attack
  detectionRange: number; // manhattan distance to detect targets
  accuracy: number; // hit chance percentage (0-100)
}

export const ZOMBIE_CONFIGS: Record<ZombieType, ZombieConfig> = {
  basic: {
    type: "basic",
    hp: 40,
    damage: 8,
    speed: 1,
    attackRange: 1,
    detectionRange: 6,
    accuracy: 80,
  },
};
