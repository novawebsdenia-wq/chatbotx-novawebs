import { instagramIntegrationService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import {
  type InstagramAuthValue,
  integration as integrationInstagramFacebook,
} from "@chatbotx.io/integration-instagram-facebook"
import { distributedLock } from "@chatbotx.io/redis"
import { logger } from "../../lib/logger"
import { runJobWithAuditContext } from "../../lib/run-job-with-audit-context"
import {
  recordTokenRefreshFailure,
  refreshInBatches,
} from "./token-refresh-failure"

const REFRESH_LOCK_TIMEOUT_SECONDS = 10
const REFRESH_SOURCE = "schedule:refreshChannelTokens"

async function refreshOne(integration: {
  id: string
  workspaceId: string
}): Promise<void> {
  if (!integrationInstagramFacebook.refreshAuth) {
    return
  }

  await runJobWithAuditContext(
    { workspaceId: integration.workspaceId, source: REFRESH_SOURCE },
    () =>
      distributedLock.runExclusive({
        key: `auth:refresh:instagramFacebook:${integration.id}`,
        timeoutInSeconds: REFRESH_LOCK_TIMEOUT_SECONDS,
        fn: async () => {
          try {
            const current =
              await instagramIntegrationService.findByIdForWorkspace({
                id: integration.id,
                workspaceId: integration.workspaceId,
              })
            if (!current) {
              return
            }

            const auth = current.auth as InstagramAuthValue
            const newAuth = await integrationInstagramFacebook.refreshAuth?.({
              auth,
            })

            await instagramIntegrationService.updateAuth({
              id: integration.id,
              workspaceId: integration.workspaceId,
              auth: newAuth as InstagramAuthValue,
            })

            await auditService.record({
              action: "refresh",
              detail: "auto-refreshed the Instagram channel token",
              workspaceId: integration.workspaceId,
              source: REFRESH_SOURCE,
            })
          } catch (error) {
            await recordTokenRefreshFailure({
              tag: "refreshInstagramFacebookTokens",
              integrationId: integration.id,
              error,
              markTokenRefreshError: (id, message) =>
                instagramIntegrationService.markTokenRefreshError(id, message),
            })
          }
        },
      }),
  )
}

export async function refreshInstagramFacebookTokens(): Promise<void> {
  if (!integrationInstagramFacebook.refreshAuth) {
    logger.warn(
      "[refreshInstagramFacebookTokens] integration does not support refresh",
    )
    return
  }

  const integrations =
    await instagramIntegrationService.findFacebookForTokenRefresh()

  await refreshInBatches(
    "refreshInstagramFacebookTokens",
    integrations,
    refreshOne,
  )
}
