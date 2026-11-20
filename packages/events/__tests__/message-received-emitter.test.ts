import { beforeEach, describe, expect, test, vi } from "vitest"

// messageReceived fires on every inbound DM, so it must reach only the webhook
// queue: the trigger emitter has to drop it before any cache lookup.

const mocks = vi.hoisted(() => ({
  webhookQueueAdd: vi.fn(async () => undefined),
  triggerQueueAdd: vi.fn(async () => undefined),
  hasActiveWebhooks: vi.fn(async () => true),
  hasActiveTriggers: vi.fn(async () => true),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  webhookQueue: { add: (...args: unknown[]) => mocks.webhookQueueAdd(...args) },
  triggerQueue: { add: (...args: unknown[]) => mocks.triggerQueueAdd(...args) },
}))

vi.mock("../src/webhook/cache", () => ({
  hasActiveWebhooks: (...args: unknown[]) => mocks.hasActiveWebhooks(...args),
}))

vi.mock("../src/trigger/cache", () => ({
  hasActiveTriggers: (...args: unknown[]) => mocks.hasActiveTriggers(...args),
}))

const { emitMessageReceived } = await import("../src/event-dispatcher")
const { runWithWebhookExecutionContext } = await import(
  "../src/webhook/context"
)

const message = {
  conversationId: "conv-1",
  inboxId: "inbox-1",
  channel: "instagram",
  messageId: "msg-1",
  text: "hola",
}

describe("emitMessageReceived", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hasActiveWebhooks.mockResolvedValue(true)
  })

  test("queues the webhook job with the message as eventData", async () => {
    await runWithWebhookExecutionContext({ source: "webhook" }, () =>
      emitMessageReceived("ws-1", "contact-1", message),
    )

    expect(mocks.hasActiveWebhooks).toHaveBeenCalledWith(
      "ws-1",
      ["messageReceived"],
      undefined,
    )
    expect(mocks.webhookQueueAdd).toHaveBeenCalledTimes(1)
    const [, job] = mocks.webhookQueueAdd.mock.calls[0] as unknown as [
      string,
      {
        data: {
          eventType: string
          contactId: string
          eventData: Record<string, unknown>
        }
      },
    ]
    expect(job.data).toEqual(
      expect.objectContaining({
        eventType: "messageReceived",
        contactId: "contact-1",
        eventData: message,
      }),
    )
  })

  test("never reaches the trigger cache or queue", async () => {
    await runWithWebhookExecutionContext({ source: "webhook" }, () =>
      emitMessageReceived("ws-1", "contact-1", message),
    )

    expect(mocks.hasActiveTriggers).not.toHaveBeenCalled()
    expect(mocks.triggerQueueAdd).not.toHaveBeenCalled()
  })

  test("queues nothing when no webhook listens to it", async () => {
    mocks.hasActiveWebhooks.mockResolvedValue(false)

    await runWithWebhookExecutionContext({ source: "webhook" }, () =>
      emitMessageReceived("ws-1", "contact-1", message),
    )

    expect(mocks.webhookQueueAdd).not.toHaveBeenCalled()
  })
})
