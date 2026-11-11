import { fbCommentAutomationService } from "@chatbotx.io/business"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import type { IntegrationJobVerifyCommentAutomationReply } from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"

const MAX_MESSAGES_CHECKED = 50

/**
 * Runs a few minutes after `processCommentAutomation` dispatched an async
 * reply (flow, AI agent or public text, all sent from other jobs). The reply
 * mark (`FBCommentAutomationReply`) is written at dispatch time so a second
 * comment cannot trigger a duplicate while the first is in flight; if the
 * reply that counts then failed and nothing reached the contact — e.g. the
 * channel token was revoked (code 190) — the mark is removed so the contact is
 * answered once the channel is fixed.
 *
 * Both the public reply and the comment-anchored first DM of a flow are stored
 * in the comment's conversation, so only messages sent there after dispatch
 * are considered. With no recorded failure (still pending, or a reply type
 * that leaves no message row) the mark is kept: it is only ever removed on
 * evidence of a failed send.
 */
export async function verifyCommentAutomationReply(
  data: IntegrationJobVerifyCommentAutomationReply["data"],
): Promise<void> {
  const repo = await createMessageRepository()
  const outgoing = await repo.findManyByConversation(data.conversationId, {
    limit: MAX_MESSAGES_CHECKED,
    messageTypes: ["outgoing"],
    sinceTime: new Date(data.dispatchedAt),
    workspaceId: data.workspaceId,
  })

  const relevant = outgoing.filter((message) =>
    data.deliverable === "public"
      ? message.type === "comment" &&
        message.contentAttributes?.replyToCommentId === data.commentId
      : message.type !== "comment",
  )
  const delivered = relevant.some((message) => Boolean(message.sourceId))
  const failed = relevant.some((message) => Boolean(message.sendError))
  if (delivered || !failed) {
    return
  }

  const revoked = await fbCommentAutomationService.revokeReply({
    automationId: data.automationId,
    contactId: data.contactId,
    postId: data.postId,
  })
  if (revoked) {
    logger.warn(
      {
        automationId: data.automationId,
        commentId: data.commentId,
        postId: data.postId,
        deliverable: data.deliverable,
      },
      "Comment automation reply was not delivered, reply mark removed",
    )
  }
}
