import { SdkException } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  findAllForTokenRefresh: vi.fn(),
  findByIdForWorkspace: vi.fn(),
  updateAuth: vi.fn(),
  markTokenRefreshError: vi.fn(),
  refreshAuth: vi.fn(),
  runExclusive: vi.fn(),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.loggerError, info: vi.fn(), warn: vi.fn() },
}))

vi.mock("../src/lib/run-job-with-audit-context", () => ({
  runJobWithAuditContext: (_params: unknown, fn: () => Promise<unknown>) =>
    fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  messengerIntegrationService: {
    findAllForTokenRefresh: mocks.findAllForTokenRefresh,
    findByIdForWorkspace: mocks.findByIdForWorkspace,
    updateAuth: mocks.updateAuth,
    markTokenRefreshError: mocks.markTokenRefreshError,
  },
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: vi.fn().mockResolvedValue(undefined) },
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  integration: { refreshAuth: mocks.refreshAuth },
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
}))

const { recordTokenRefreshFailure, refreshInBatches, summarizeRefreshError } =
  await import("../src/schedule/handlers/token-refresh-failure")
const { refreshMessengerTokens } = await import(
  "../src/schedule/handlers/refresh-messenger-tokens"
)

/** Shaped like the Messenger exception: the raw HTTP error rides along. */
function revokedTokenError() {
  const error = new SdkException(
    "Error validating access token: The session has been invalidated",
    190,
    400,
    460,
    "OAuthException",
  )
  error.setOriginError({
    request: { url: "https://graph.facebook.com/oauth?client_secret=s3cret" },
    response: { status: 400 },
  })
  return error
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.markTokenRefreshError.mockResolvedValue(undefined)
  mocks.updateAuth.mockResolvedValue(undefined)
  mocks.runExclusive.mockImplementation(
    ({ fn }: { fn: () => Promise<unknown> }) => fn(),
  )
})

describe("summarizeRefreshError", () => {
  test("keeps only message, code and subCode of an SdkException", () => {
    expect(summarizeRefreshError(revokedTokenError())).toEqual({
      message:
        "Error validating access token: The session has been invalidated",
      code: 190,
      subCode: 460,
    })
  })

  test("falls back to the message of plain errors and to String()", () => {
    expect(summarizeRefreshError(new Error("boom"))).toEqual({
      message: "boom",
    })
    expect(summarizeRefreshError("nope")).toEqual({ message: "nope" })
  })
})

describe("recordTokenRefreshFailure", () => {
  test("persists tokenRefreshError before logging, and never logs the error object", async () => {
    const order: string[] = []
    mocks.markTokenRefreshError.mockImplementation(() => {
      order.push("mark")
      return Promise.resolve()
    })
    mocks.loggerError.mockImplementation(() => {
      order.push("log")
    })

    await recordTokenRefreshFailure({
      tag: "refreshMessengerTokens",
      integrationId: "integration-1",
      error: revokedTokenError(),
      markTokenRefreshError: mocks.markTokenRefreshError,
    })

    expect(order).toEqual(["mark", "log"])
    expect(mocks.markTokenRefreshError).toHaveBeenCalledWith(
      "integration-1",
      "Error validating access token: The session has been invalidated",
    )
    const [logged] = mocks.loggerError.mock.calls[0] ?? []
    expect(logged).toEqual({
      integrationId: "integration-1",
      message:
        "Error validating access token: The session has been invalidated",
      code: 190,
      subCode: 460,
    })
    expect(JSON.stringify(mocks.loggerError.mock.calls)).not.toContain(
      "client_secret",
    )
  })

  test("still logs and resolves when persisting the error fails", async () => {
    mocks.markTokenRefreshError.mockRejectedValue(new Error("db down"))

    await expect(
      recordTokenRefreshFailure({
        tag: "refreshMessengerTokens",
        integrationId: "integration-1",
        error: revokedTokenError(),
        markTokenRefreshError: mocks.markTokenRefreshError,
      }),
    ).resolves.toBeUndefined()

    expect(mocks.loggerError).toHaveBeenCalledTimes(2)
  })
})

describe("refreshInBatches", () => {
  test("a rejected integration does not stop the others", async () => {
    const refreshed: string[] = []
    const refreshOne = vi.fn((integration: { id: string }) => {
      if (integration.id === "b") {
        return Promise.reject(new Error("lock not acquired"))
      }
      refreshed.push(integration.id)
      return Promise.resolve()
    })

    await expect(
      refreshInBatches(
        "refreshTest",
        [{ id: "a" }, { id: "b" }, { id: "c" }],
        refreshOne,
      ),
    ).resolves.toBeUndefined()

    expect(refreshed).toEqual(["a", "c"])
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { integrationId: "b", message: "lock not acquired" },
      "[refreshTest] id=b refresh aborted",
    )
  })
})

describe("refreshMessengerTokens", () => {
  test("writes tokenRefreshError for a revoked page and still refreshes the next one", async () => {
    mocks.findAllForTokenRefresh.mockResolvedValue([
      { id: "page-revoked", workspaceId: "workspace-1" },
      { id: "page-ok", workspaceId: "workspace-1" },
    ])
    mocks.findByIdForWorkspace.mockImplementation(({ id }: { id: string }) =>
      Promise.resolve({ id, auth: { tokens: { accessToken: id } } }),
    )
    mocks.refreshAuth.mockImplementation(
      ({ auth }: { auth: { tokens: { accessToken: string } } }) =>
        auth.tokens.accessToken === "page-revoked"
          ? Promise.reject(revokedTokenError())
          : Promise.resolve(auth),
    )

    await refreshMessengerTokens()

    expect(mocks.markTokenRefreshError).toHaveBeenCalledWith(
      "page-revoked",
      "Error validating access token: The session has been invalidated",
    )
    expect(mocks.updateAuth).toHaveBeenCalledWith(
      expect.objectContaining({ id: "page-ok" }),
    )
    expect(mocks.updateAuth).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: "page-revoked" }),
    )
  })
})
