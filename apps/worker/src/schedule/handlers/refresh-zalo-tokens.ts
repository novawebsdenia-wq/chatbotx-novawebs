import { zaloIntegrationService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import {
  calculateExpiresAt,
  refreshAccessToken,
  type ZaloAuthValue,
} from "@chatbotx.io/integration-zalo"
import { distributedLock } from "@chatbotx.io/redis"
import { logger } from "../../lib/logger"
import { runJobWithAuditContext } from "../../lib/run-job-with-audit-context"
import {
  recordTokenRefreshFailure,
  refreshInBatches,
  summarizeRefreshError,
} from "./token-refresh-failure"

const REFRESH_SOURCE = "schedule:refreshChannelTokens"
// Must outlive the OAuth client's 30s HTTP timeout: the Zalo refresh token is
// single-use, so if the lock expired mid-call another process could consume
// the same refresh token concurrently and clobber the rotated tokens.
const REFRESH_LOCK_TIMEOUT_SECONDS = 60

async function refreshOne(integration: {
  id: string
  workspaceId: string
}): Promise<void> {
  await runJobWithAuditContext(
    { workspaceId: integration.workspaceId, source: REFRESH_SOURCE },
    () =>
      distributedLock
        .runExclusive({
          key: `auth:refresh:zalo:${integration.id}`,
          timeoutInSeconds: REFRESH_LOCK_TIMEOUT_SECONDS,
          fn: () => refreshWithLockHeld(integration),
        })
        .catch((error) => {
          // A failed lock acquisition (another process already refreshing,
          // redis hiccup) must not reject the whole batch and abort the
          // remaining integrations for the day.
          logger.error(
            { integrationId: integration.id, ...summarizeRefreshError(error) },
            `[refreshZaloTokens] id=${integration.id} lock failed`,
          )
        }),
  )
}

async function refreshWithLockHeld(integration: {
  id: string
  workspaceId: string
}): Promise<void> {
  try {
    const current = await zaloIntegrationService.findById({
      id: integration.id,
      workspaceId: integration.workspaceId,
    })
    const auth = current.auth as ZaloAuthValue
    if (!auth.tokens.refreshToken) {
      logger.warn(
        `[refreshZaloTokens] id=${integration.id} skipped: no refreshToken`,
      )
      return
    }

    const newTokens = await refreshAccessToken(auth, auth.tokens.refreshToken)

    await zaloIntegrationService.updateAuth(integration.id, {
      ...auth,
      tokens: {
        ...auth.tokens,
        accessToken: newTokens.access_token,
        refreshToken: newTokens.refresh_token,
        expiresAt: calculateExpiresAt(newTokens.expires_in),
      },
    })

    await auditService.record({
      action: "refresh",
      detail: "auto-refreshed the Zalo channel permissions",
      workspaceId: integration.workspaceId,
      source: REFRESH_SOURCE,
    })
  } catch (error) {
    await recordTokenRefreshFailure({
      tag: "refreshZaloTokens",
      integrationId: integration.id,
      error,
      markTokenRefreshError: (id, message) =>
        zaloIntegrationService.markTokenRefreshError(id, message),
    })
  }
}

export async function refreshZaloTokens(): Promise<void> {
  const integrations = await zaloIntegrationService.findAll()

  await refreshInBatches("refreshZaloTokens", integrations, refreshOne)
}
