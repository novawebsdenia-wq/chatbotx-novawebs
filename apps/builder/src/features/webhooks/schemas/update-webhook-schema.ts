import z from "zod"
import { webhookConditions } from "../../conditions/schemas"

export const updateWebhookRequest = z.object({
  conditions: z.array(z.union(Object.values(webhookConditions))),
  url: z.url().max(1000),
})
export type UpdateWebhookSchema = z.infer<typeof updateWebhookRequest>

export const updateWebhookSettingsRequest = z.object({
  name: z.optional(z.string().trim().min(1).max(255)),
  active: z.optional(z.boolean()),
})

export type UpdateWebhookSettingsRequest = z.infer<
  typeof updateWebhookSettingsRequest
>
