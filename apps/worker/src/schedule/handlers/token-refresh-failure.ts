import { SdkException } from "@chatbotx.io/sdk"
import { logger } from "../../lib/logger"

const BATCH_SIZE = 50

type RefreshErrorSummary = {
  message: string
  code?: string | number
  subCode?: string | number | null
}

/**
 * The only fields of a refresh failure worth logging. Never log the error
 * object itself: a Messenger `MessengerAPIException` carries the raw ky
 * `HTTPError` as `originError` (request, response and the token-exchange URL
 * with the app secret), and serialising it exhausted the schedule worker heap
 * (exit 134) before `tokenRefreshError` was written — the job then stalled and
 * re-ran on every restart.
 */
export function summarizeRefreshError(error: unknown): RefreshErrorSummary {
  if (error instanceof SdkException) {
    return { message: error.message, code: error.code, subCode: error.subCode }
  }
  if (error instanceof Error) {
    return { message: error.message }
  }
  return { message: String(error) }
}

/**
 * Persists `tokenRefreshError` first (it is what makes the UI ask for a
 * reconnect), then logs the compact summary. Never throws, so one broken
 * integration cannot abort the refresh of the others.
 */
export async function recordTokenRefreshFailure(props: {
  tag: string
  integrationId: string
  error: unknown
  markTokenRefreshError: (id: string, message: string) => Promise<void>
}): Promise<void> {
  const { tag, integrationId, error, markTokenRefreshError } = props
  const summary = summarizeRefreshError(error)

  try {
    await markTokenRefreshError(integrationId, summary.message)
  } catch (markError) {
    logger.error(
      { integrationId, ...summarizeRefreshError(markError) },
      `[${tag}] id=${integrationId} could not persist tokenRefreshError`,
    )
  }

  logger.error(
    { integrationId, ...summary },
    `[${tag}] id=${integrationId} failed`,
  )
}

/**
 * Runs `refreshOne` over the integrations in batches. A rejection (lock not
 * acquired, audit context failure…) is logged for that integration only and
 * never stops the remaining ones.
 */
export async function refreshInBatches<T extends { id: string }>(
  tag: string,
  integrations: T[],
  refreshOne: (integration: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < integrations.length; i += BATCH_SIZE) {
    const batch = integrations.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(batch.map(refreshOne))
    for (const [index, result] of results.entries()) {
      if (result.status === "rejected") {
        const integrationId = batch[index]?.id
        logger.error(
          { integrationId, ...summarizeRefreshError(result.reason) },
          `[${tag}] id=${integrationId} refresh aborted`,
        )
      }
    }
  }
}
