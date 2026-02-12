import { z } from "zod";

// Client → Server
export const InitiateRecruitmentSchema = z.object({
  targetSessionId: z.string().min(1),
});
export type InitiateRecruitment = z.infer<typeof InitiateRecruitmentSchema>;

export const RecruitmentChoiceSchema = z.object({
  targetSessionId: z.string().min(1),
  choiceIndex: z.number().int().min(0).max(2),
});
export type RecruitmentChoice = z.infer<typeof RecruitmentChoiceSchema>;

export const DismissRecruitmentSchema = z.object({
  targetSessionId: z.string().min(1),
});
export type DismissRecruitment = z.infer<typeof DismissRecruitmentSchema>;

// Server → Client
export interface RecruitmentDialogueEvent {
  tick: number;
  targetSessionId: string;
  personality: string;
  displayName: string;
  dialogueLines: string[];
  choices: Array<{
    text: string;
    successChance: number; // 0-1, shown as hint
  }>;
}

export interface RecruitmentResultEvent {
  tick: number;
  targetSessionId: string;
  success: boolean;
  responseLine: string; // NPC's response to your choice
}
