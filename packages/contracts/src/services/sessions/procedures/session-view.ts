import {z} from "zod";

export const PROJECT_WINDOW_LIMIT = 500;

export const ShowProjectPayload = z.object({
  projectPath: z.string().min(1),
  depth: z.number().int().min(1).max(PROJECT_WINDOW_LIMIT),
});

export const HideProjectPayload = z.object({projectPath: z.string().min(1)});

export const LoadMoreProjectPayload = z.object({
  projectPath: z.string().min(1),
  by: z.number().int().min(1).max(PROJECT_WINDOW_LIMIT),
});

export const OpenSessionPayload = z.object({sessionId: z.string().min(1)});

export type OpenSessionPayload = z.infer<typeof OpenSessionPayload>;
export type ShowProjectPayload = z.infer<typeof ShowProjectPayload>;
export type HideProjectPayload = z.infer<typeof HideProjectPayload>;
export type LoadMoreProjectPayload = z.infer<typeof LoadMoreProjectPayload>;
