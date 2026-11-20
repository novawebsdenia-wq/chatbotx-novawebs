import { beforeEach, describe, expect, test, vi } from "vitest"

// A workspace with no active webhook used to hit the database on every event.
// With messageReceived that would be one read per inbound DM, so the empty
// result is now remembered in RAM for ramTTL (and only there).

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(async (): Promise<unknown[]> => []),
  redisGet: vi.fn(async (): Promise<string | null> => null),
  redisSetex: vi.fn(async () => "OK"),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { webhookModel: { findMany: mocks.findMany } } },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  getRedisConnection: () => ({ get: mocks.redisGet, setex: mocks.redisSetex }),
}))

const { hasActiveWebhooks } = await import("../src/webhook/cache")

describe("hasActiveWebhooks — workspace without webhooks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("reads the database once and answers later events from RAM", async () => {
    await expect(
      hasActiveWebhooks("ws-empty", ["messageReceived"]),
    ).resolves.toBe(false)
    await expect(
      hasActiveWebhooks("ws-empty", ["messageReceived"]),
    ).resolves.toBe(false)

    expect(mocks.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.redisSetex).not.toHaveBeenCalled()
  })

  test("a workspace with webhooks is still cached in Redis", async () => {
    mocks.findMany.mockResolvedValueOnce([
      { conditions: [{ type: "messageReceived", sourceId: null }] },
    ])

    await expect(
      hasActiveWebhooks("ws-full", ["messageReceived"]),
    ).resolves.toBe(true)

    expect(mocks.redisSetex).toHaveBeenCalledWith(
      "webhook:active:ws-full",
      3600,
      JSON.stringify({ messageReceived: ["*"] }),
    )
  })
})
