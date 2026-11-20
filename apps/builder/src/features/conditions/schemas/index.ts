import z from "zod"
import { contactInfoUpdated } from "./contact-info-updated"
import { customFieldValueChanged } from "./custom-field-value-changed"
import { dateTimeBasedTrigger } from "./date-time-based-trigger"
import {
  archived,
  contactReferredANewContact,
  contactReferredExistingContact,
  contactUnsubscribedFormBroadcast,
  conversationAssigned,
  conversationTransferredToBot,
  conversationTransferredToHuman,
  conversationUnassigned,
  followUp,
  messageReceived,
  newContact,
  subscribedToSequence,
  unsubscribedFromSequence,
} from "./simple-conditions"
import { tagApplied } from "./tag-applied"
import { tagRemoved } from "./tag-removed"

export const allConditions = {
  tagApplied,
  tagRemoved,
  customFieldValueChanged,
  contactInfoUpdated,
  dateTimeBasedTrigger,
  conversationTransferredToHuman,
  conversationTransferredToBot,
  newContact,
  contactUnsubscribedFormBroadcast,
  archived,
  followUp,
  conversationAssigned,
  conversationUnassigned,
  subscribedToSequence,
  unsubscribedFromSequence,
  contactReferredANewContact,
  contactReferredExistingContact,
}

export const conditionSchema = z.union(Object.values(allConditions))
export type ConditionInput = z.infer<typeof conditionSchema>

// Webhooks also accept the webhook-only events, which no trigger can fire on
// (see WEBHOOK_ONLY_EVENT_TYPES in @chatbotx.io/events).
export const webhookConditions = { ...allConditions, messageReceived }

export const webhookConditionSchema = z.union(Object.values(webhookConditions))
export type WebhookConditionInput = z.infer<typeof webhookConditionSchema>
