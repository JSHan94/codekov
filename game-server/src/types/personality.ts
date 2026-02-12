export type PersonalityType = "brave" | "coward" | "greedy" | "loyal" | "veteran";

export interface AIPersonality {
  type: PersonalityType;
  displayName: string;
  traits: string[];
  recruitDifficulty: number; // 0-1, higher = harder to recruit
  dialogueStyle: string; // description for LLM prompt
  combatBehavior: {
    aggressiveness: number; // 0-1
    fleeThreshold: number; // HP % to flee
    followDistance: number; // tiles to maintain from player
  };
}

export const PERSONALITIES: Record<PersonalityType, AIPersonality> = {
  brave: {
    type: "brave",
    displayName: "Brave",
    traits: ["fearless", "direct", "impatient"],
    recruitDifficulty: 0.3,
    dialogueStyle: "Bold, straightforward, eager to fight. Short sentences. Challenges the player to prove themselves.",
    combatBehavior: {
      aggressiveness: 0.8,
      fleeThreshold: 15,
      followDistance: 3,
    },
  },
  coward: {
    type: "coward",
    displayName: "Coward",
    traits: ["fearful", "cautious", "nervous"],
    recruitDifficulty: 0.2,
    dialogueStyle: "Nervous, stuttering, easily scared. Wants reassurance and protection. Uses ellipses and question marks a lot.",
    combatBehavior: {
      aggressiveness: 0.2,
      fleeThreshold: 50,
      followDistance: 1,
    },
  },
  greedy: {
    type: "greedy",
    displayName: "Greedy",
    traits: ["materialistic", "calculating", "opportunistic"],
    recruitDifficulty: 0.5,
    dialogueStyle: "Transactional, always asking what's in it for them. Mentions loot, rewards, and survival odds.",
    combatBehavior: {
      aggressiveness: 0.4,
      fleeThreshold: 35,
      followDistance: 2,
    },
  },
  loyal: {
    type: "loyal",
    displayName: "Loyal",
    traits: ["dependable", "warm", "trusting"],
    recruitDifficulty: 0.15,
    dialogueStyle: "Warm, friendly, wants to help. Once convinced, fully committed. Speaks about teamwork and sticking together.",
    combatBehavior: {
      aggressiveness: 0.5,
      fleeThreshold: 20,
      followDistance: 2,
    },
  },
  veteran: {
    type: "veteran",
    displayName: "Veteran",
    traits: ["experienced", "strategic", "skeptical"],
    recruitDifficulty: 0.6,
    dialogueStyle: "Gruff, experienced, uses military jargon. Needs to see competence before joining. Evaluates the player critically.",
    combatBehavior: {
      aggressiveness: 0.6,
      fleeThreshold: 25,
      followDistance: 3,
    },
  },
};

export function getRandomPersonality(): PersonalityType {
  const types: PersonalityType[] = ["brave", "coward", "greedy", "loyal", "veteran"];
  return types[Math.floor(Math.random() * types.length)];
}
