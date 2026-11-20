import {
  type TriggerEventType,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"

export const EMITTED_EVENT_TYPES = [
  triggerEventTypes.enum.tagApplied,
  triggerEventTypes.enum.tagRemoved,
  triggerEventTypes.enum.customFieldValueChanged,
  triggerEventTypes.enum.contactInfoUpdated,
  triggerEventTypes.enum.conversationTransferredToHuman,
  triggerEventTypes.enum.conversationTransferredToBot,
  triggerEventTypes.enum.newContact,
  triggerEventTypes.enum.contactUnsubscribedFormBroadcast,
  triggerEventTypes.enum.archived,
  triggerEventTypes.enum.followUp,
  triggerEventTypes.enum.conversationAssigned,
  triggerEventTypes.enum.conversationUnassigned,
  triggerEventTypes.enum.subscribedToSequence,
  triggerEventTypes.enum.unsubscribedFromSequence,
  triggerEventTypes.enum.contactReferredANewContact,
  triggerEventTypes.enum.contactReferredExistingContact,
] as const

export const SCANNER_VERIFIED_EVENT_TYPES = [
  triggerEventTypes.enum.dateTimeBasedTrigger,
] as const

// Emitted to outbound webhooks only. One fires per inbound DM, far too often
// to look up automations for each, so the trigger emitter never sees them and
// the trigger editor never offers them.
export const WEBHOOK_ONLY_EVENT_TYPES = [
  triggerEventTypes.enum.messageReceived,
] as const

export type EmittedEventType = (typeof EMITTED_EVENT_TYPES)[number]
export type ScannerVerifiedEventType =
  (typeof SCANNER_VERIFIED_EVENT_TYPES)[number]
export type WebhookOnlyEventType = (typeof WEBHOOK_ONLY_EVENT_TYPES)[number]
export type MatchableEventType = EmittedEventType | ScannerVerifiedEventType
export type WebhookMatchableEventType =
  | MatchableEventType
  | WebhookOnlyEventType

export const EMITTED_EVENT_TYPE_SET: ReadonlySet<TriggerEventType> = new Set(
  EMITTED_EVENT_TYPES,
)

export const WEBHOOK_EMITTED_EVENT_TYPE_SET: ReadonlySet<TriggerEventType> =
  new Set([...EMITTED_EVENT_TYPES, ...WEBHOOK_ONLY_EVENT_TYPES])

const MATCHABLE_EVENT_TYPE_SET: ReadonlySet<TriggerEventType> = new Set([
  ...EMITTED_EVENT_TYPES,
  ...SCANNER_VERIFIED_EVENT_TYPES,
])

const WEBHOOK_MATCHABLE_EVENT_TYPE_SET: ReadonlySet<TriggerEventType> = new Set(
  [...MATCHABLE_EVENT_TYPE_SET, ...WEBHOOK_ONLY_EVENT_TYPES],
)

export function matchableConditionTypesFor(
  eventType: TriggerEventType,
): TriggerEventType[] {
  return MATCHABLE_EVENT_TYPE_SET.has(eventType) ? [eventType] : []
}

export function isWebhookMatchableEventType(
  eventType: TriggerEventType,
): eventType is WebhookMatchableEventType {
  return WEBHOOK_MATCHABLE_EVENT_TYPE_SET.has(eventType)
}
