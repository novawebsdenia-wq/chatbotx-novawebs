import { z } from "zod"
import { accountIdsSchema } from "./fb-comment-automation"

export const igStoryAutomationTypes = z.enum(["instagram", "instagramFacebook"])
export type IgStoryAutomationType = z.infer<typeof igStoryAutomationTypes>

export const igStoryTargetSchema = z.object({
  type: z.enum(["all", "storyIds"]),
  value: z.array(z.string()),
  // Same as on comment automations: limit it to replies to these accounts.
  igIds: accountIdsSchema,
})
export type IgStoryTarget = z.infer<typeof igStoryTargetSchema>
