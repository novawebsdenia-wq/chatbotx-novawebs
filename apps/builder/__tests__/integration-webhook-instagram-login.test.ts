// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const findDecryptedPlatform = vi.fn()
const findLoginTypeByIgId = vi.fn()
const integrationQueueAdd = vi.fn()
const instagramHandleRequest = vi.fn()
const instagramFacebookHandleRequest = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  customDomainService: { findActiveByDomain: vi.fn() },
  instagramIntegrationService: { findLoginTypeByIgId },
  platformCredentialService: {
    findDecryptedPlatform,
    findDecryptedForUser: vi.fn(),
  },
  resolveWorkspaceFreezeReason: vi.fn(),
  tenantService: { findById: vi.fn() },
  userQuotaService: { getAccessState: vi.fn() },
  workspaceService: { find: vi.fn() },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { update: vi.fn() },
  eq: vi.fn(),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  inboxStatuses: { enum: { disconnected: "disconnected" } },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  inboxModel: {},
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  integrationQueue: { add: integrationQueueAdd },
}))

vi.mock("@/env", () => ({
  isCloud: () => false,
}))

vi.mock("@/features/integration-telegram/queries", () => ({
  findIntegrationTelegramByBotId: vi.fn(),
}))

vi.mock("@/features/integration-tiktok/queries", () => ({
  findIntegrationTiktokByOpenId: vi.fn(),
}))

vi.mock("@/integration", () => ({
  integrations: {
    instagram: { name: "instagram", handleRequest: instagramHandleRequest },
    instagramFacebook: {
      name: "instagram-facebook",
      handleRequest: instagramFacebookHandleRequest,
    },
  },
}))

vi.mock("@/lib/log", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock("@/lib/oauth-broker", () => ({
  isBrokerHost: () => false,
}))

const { handleWebhook } = await import(
  "../src/app/integrations/[...integration]/webhook"
)

const IG_ID = "17841479379066985"

const request = (path: string) => {
  const url = `http://localhost/integrations/${path}/webhook`
  const req = new Request(url, { method: "POST", body: "{}" })
  return Object.assign(req, { nextUrl: new URL(url) }) as never
}

const commentJob = {
  type: "incomingComment",
  data: { integrationIdentifier: IG_ID, commentData: { commentId: "c-1" } },
}

/** Makes the integration handler enqueue one comment, like a real webhook. */
const enqueueOneComment = ({
  queue,
}: {
  queue: { add: (name: string, payload: unknown) => Promise<unknown> }
}) => queue.add("incomingComment", commentJob).then(() => "ok")

beforeEach(() => {
  vi.clearAllMocks()
  findDecryptedPlatform.mockResolvedValue({ config: {} })
  integrationQueueAdd.mockResolvedValue(undefined)
  instagramHandleRequest.mockImplementation(enqueueOneComment)
  instagramFacebookHandleRequest.mockImplementation(enqueueOneComment)
})

describe("instagram webhook login guard", () => {
  test("Instagram Login account: the Instagram Login path enqueues", async () => {
    findLoginTypeByIgId.mockResolvedValue("instagram")

    await handleWebhook("instagram", request("instagram"))

    expect(findLoginTypeByIgId).toHaveBeenCalledWith(IG_ID)
    expect(integrationQueueAdd).toHaveBeenCalledWith(
      "incomingComment",
      commentJob,
      undefined,
    )
  })

  test("Instagram Login account: the Facebook Login copy is dropped", async () => {
    findLoginTypeByIgId.mockResolvedValue("instagram")

    const response = await handleWebhook(
      "instagramFacebook",
      request("instagram-facebook"),
    )

    expect(await response.text()).toBe("ok")
    expect(integrationQueueAdd).not.toHaveBeenCalled()
  })

  test("Facebook Login account: only the Facebook Login path enqueues", async () => {
    findLoginTypeByIgId.mockResolvedValue("facebook")

    await handleWebhook("instagram", request("instagram"))
    expect(integrationQueueAdd).not.toHaveBeenCalled()

    await handleWebhook("instagramFacebook", request("instagram-facebook"))
    expect(integrationQueueAdd).toHaveBeenCalledTimes(1)
  })

  test("an account that is not connected keeps today's behaviour", async () => {
    findLoginTypeByIgId.mockResolvedValue(undefined)

    await handleWebhook("instagramFacebook", request("instagram-facebook"))

    expect(integrationQueueAdd).toHaveBeenCalledTimes(1)
  })
})
