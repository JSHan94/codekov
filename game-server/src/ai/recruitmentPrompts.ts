import type { PersonalityType, AIPersonality } from "../types/personality.js";
import { PERSONALITIES } from "../types/personality.js";

export function buildRecruitmentSystemPrompt(personality: AIPersonality): string {
  return `You are an NPC in a zombie survival game. Your personality type is "${personality.displayName}".

PERSONALITY TRAITS: ${personality.traits.join(", ")}
DIALOGUE STYLE: ${personality.dialogueStyle}

CONTEXT:
- The world is overrun with zombies
- A player is trying to recruit you as an ally
- You are currently neutral - not fighting zombies, just trying to survive alone
- If recruited, you'll follow the player's commands (Follow/Hold/Attack)

YOUR TASK:
Generate a short recruitment dialogue interaction. Output a JSON object with:
1. "dialogueLines": Array of 1-2 short lines of dialogue (your character speaking)
2. "choices": Array of exactly 3 response options the player can choose, each with:
   - "text": The choice text (keep it short, 5-15 words)
   - "successChance": A number 0-1 representing how likely this choice convinces you

GUIDELINES:
- Stay in character based on your personality
- Make the dialogue feel natural and brief (this is real-time gameplay)
- One choice should be clearly good (0.7-0.9 success), one medium (0.4-0.6), one risky (0.1-0.3)
- The good choice should align with what your personality type values
- Keep dialogue lines under 60 characters each
- The total interaction should feel like 5-10 seconds of reading

Example output format:
{
  "dialogueLines": ["Hey... you looking for trouble?", "I've been watching you fight."],
  "choices": [
    {"text": "We're stronger together. Join me.", "successChance": 0.8},
    {"text": "I have supplies to share.", "successChance": 0.5},
    {"text": "Follow me or get out of my way.", "successChance": 0.2}
  ]
}`;
}

export function buildRecruitmentUserPrompt(
  personalityType: PersonalityType,
  zombieCount: number,
  playerHp: number,
  playerAllyCount: number,
): string {
  const personality = PERSONALITIES[personalityType];
  return `Generate a recruitment dialogue for a ${personality.displayName} NPC.
Current situation: ${zombieCount} zombies nearby, player has ${playerHp}% HP and ${playerAllyCount} allies.
Respond ONLY with the JSON object, no other text.`;
}
