import { integrationWhatsappService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import {
  integration as integrationWhatsapp,
  type WhatsappAuthValue,
} from "@chatbotx.io/integration-whatsapp"
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
  if (!integrationWhatsapp.refreshAuth) {
    return
  }

  await runJobWithAuditContext(
    { workspaceId: integration.workspaceId, source: REFRESH_SOURCE },
    () =>
      distributedLock.runExclusive({
        key: `auth:refresh:whatsapp:${integration.id}`,
        timeoutInSeconds: REFRESH_LOCK_TIMEOUT_SECONDS,
        fn: async () => {
          try {
            const current =
              await integrationWhatsappService.findByIdForWorkspace({
                id: integration.id,
                workspaceId: integration.workspaceId,
              })
            if (!current) {
              return
            }

            const auth = current.auth as WhatsappAuthValue
            if (auth.metadata.isManual) {
              return
            }

            const newAuth = await integrationWhatsapp.refreshAuth?.({ auth })

            await integrationWhatsappService.updateAuth({
              id: integration.id,
              workspaceId: integration.workspaceId,
              auth: newAuth as WhatsappAuthValue,
            })

            await auditService.record({
              action: "refresh",
              detail: "auto-refreshed the WhatsApp channel token",
              workspaceId: integration.workspaceId,
              source: REFRESH_SOURCE,
            })
          } catch (error) {
            await recordTokenRefreshFailure({
              tag: "refreshWhatsappTokens",
              integrationId: integration.id,
              error,
              markTokenRefreshError: (id, message) =>
                integrationWhatsappService.markTokenRefreshError(id, message),
            })
          }
        },
      }),
  )
}

export async function refreshWhatsappTokens(): Promise<void> {
  if (!integrationWhatsapp.refreshAuth) {
    logger.warn("[refreshWhatsappTokens] integration does not support refresh")
    return
  }

  const integrations = await integrationWhatsappService.findAllForTokenRefresh()

  await refreshInBatches("refreshWhatsappTokens", integrations, refreshOne)
}
