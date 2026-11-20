import type { ConditionInput, WebhookConditionInput } from "./schemas"

export const toConditionColumns = (
  condition: ConditionInput | WebhookConditionInput,
) => ({
  type: condition.type,
  sourceId: "sourceId" in condition ? condition.sourceId : null,
  operator: "operator" in condition ? condition.operator : null,
  value:
    "value" in condition && condition.value !== null ? condition.value : null,
})
