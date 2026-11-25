import {
  aiAgentService,
  contactInboxService,
  conversationService,
  workspaceService,
} from "@chatbotx.io/business"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import type {
  AIAgentModel,
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { getLastCommentedPostText } from "@chatbotx.io/variables"
import type { IntegrationJobCommentAIReply } from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"
import { integrationService } from "../../../services/integrations"
import { generateAIReplyText } from "../automated-response/replies"
import { hasLink } from "./hide-comments"
import {
  PRIVATE_REPLY_TEXT_SENDERS,
  type PrivateReplyAuth,
} from "./private-reply"
import { postPublicCommentReply } from "./public-reply"

/** Whole AI budget for a public reply; past it the fallback text is posted. */
const PUBLIC_REPLY_TIMEOUT_MS = 15_000
/** Longest AI text posted publicly as is; a longer one is replaced by the fallback. */
export const MAX_PUBLIC_REPLY_CHARS = 220
/** The agent answers this to leave a comment unanswered (spam, insults, bare tags). */
export const AI_SKIP_REPLY_TOKEN = "NO_RESPONDER"
// `hasLink` leaves Spanish/EU bare domains out on purpose (see hide-comments);
// a public reply must never carry one either.
const ES_EU_DOMAIN_RE = /\b[a-z0-9-]+\.(?:es|eu)\b/i
const WRAPPING_QUOTES_RE = /^["'«“]+|["'»”]+$/g
// Few-shot prompts label their answers; a model may echo the label.
const ANSWER_LABEL_RE = /^(?:respuesta|reply)\s*:\s*/i

type PublicReplyCheck =
  | { ok: true; text: string }
  | { ok: false; reason: "empty" | "skip" | "too long" | "link" }

/** Decide whether an AI text can be posted as a public comment reply. */
export function checkPublicReply(raw: string): PublicReplyCheck {
  const text = raw
    .trim()
    .replace(ANSWER_LABEL_RE, "")
    .replace(WRAPPING_QUOTES_RE, "")
    .trim()
  if (!text) {
    return { ok: false, reason: "empty" }
  }
  if (text.includes(AI_SKIP_REPLY_TOKEN)) {
    return { ok: false, reason: "skip" }
  }
  if (text.length > MAX_PUBLIC_REPLY_CHARS) {
    return { ok: false, reason: "too long" }
  }
  if (hasLink(text) || ES_EU_DOMAIN_RE.test(text)) {
    return { ok: false, reason: "link" }
  }
  return { ok: true, text }
}

function buildPublicReplyInput(comment: string, caption: string | null) {
  const post = caption ? `<post_caption>\n${caption}\n</post_caption>\n\n` : ""
  return `${post}<comment>\n${comment}\n</comment>`
}

/**
 * The text to post publicly for a comment: the agent's reply when usable,
 * otherwise the automation's fallback text, or null to leave it unanswered.
 * Never throws, so an AI outage cannot fail the job or touch other replies.
 */
async function resolvePublicReplyText(props: {
  data: IntegrationJobCommentAIReply["data"]
  agent: AIAgentModel
  conversation: ConversationModel
  contactInbox: ContactInboxModel
}): Promise<string | null> {
  const { data } = props
  const caption = data.postId
    ? await getLastCommentedPostText(props.contactInbox, data.postId).catch(
        () => null,
      )
    : null
  const logContext = {
    agentId: data.agentId,
    commentId: data.commentId,
    workspaceId: data.workspaceId,
    hasCaption: Boolean(caption),
  }

  let raw = ""
  try {
    const generated = await generateAIReplyText({
      conversation: props.conversation,
      contactInbox: props.contactInbox,
      messages: [
        {
          role: "user",
          content: buildPublicReplyInput(data.message ?? "", caption),
        },
      ],
      aiAgent: props.agent,
      timeoutMs: PUBLIC_REPLY_TIMEOUT_MS,
    })
    raw = generated?.text ?? ""
  } catch (err) {
    logger.warn({ ...logContext, err }, "comment AI reply: generation failed")
  }

  const check = checkPublicReply(raw)
  if (check.ok) {
    logger.info(
      { ...logContext, chars: check.text.length },
      "comment AI reply: posting AI text",
    )
    return check.text
  }
  if (check.reason === "skip") {
    logger.info(
      logContext,
      "comment AI reply skipped: agent chose not to reply",
    )
    return null
  }
  const fallback = data.fallbackText?.trim() || null
  logger.info(
    { ...logContext, reason: check.reason, usedFallback: Boolean(fallback) },
    "comment AI reply: AI text unusable",
  )
  return fallback
}

/**
 * Generate an AI agent reply for a Facebook comment and deliver it on the
 * requested channel: a public comment reply (message with `type: "comment"` +
 * `replyToCommentId`) or a private DM. The generation is done here (not through
 * the DM auto-responder pipeline) so the selected agent and the public/private
 * channel are both honoured. Runs as its own delayed job so the AI call never
 * blocks the comment-automation loop.
 */
export async function processCommentAIReply(
  data: IntegrationJobCommentAIReply["data"],
): Promise<void> {
  if (!data.message?.trim()) {
    // Image/sticker-only comment: nothing for the agent to answer.
    return
  }

  const [workspace, agent, contactInbox, conversation] = await Promise.all([
    workspaceService.findById({ id: data.workspaceId }),
    aiAgentService.findBy({
      where: { id: data.agentId, workspaceId: data.workspaceId },
    }),
    contactInboxService.findBy({ where: { id: data.contactInboxId } }),
    conversationService.findBy({ where: { id: data.conversationId } }),
  ])

  if (!workspaceService.isActiveNow(workspace)) {
    logger.info(
      { workspaceId: data.workspaceId, commentId: data.commentId },
      "comment AI reply skipped: workspace outside active hours",
    )
    return
  }

  if (!agent) {
    logger.warn(
      {
        agentId: data.agentId,
        workspaceId: data.workspaceId,
        commentId: data.commentId,
      },
      "comment AI reply skipped: agent not found",
    )
    return
  }

  if (!contactInbox) {
    logger.warn(
      { contactInboxId: data.contactInboxId, commentId: data.commentId },
      "comment AI reply skipped: contactInbox not found",
    )
    return
  }

  if (!conversation) {
    logger.warn(
      { conversationId: data.conversationId, commentId: data.commentId },
      "comment AI reply skipped: conversation not found",
    )
    return
  }

  if (data.replyChannel === "public") {
    const text = await resolvePublicReplyText({
      data,
      agent,
      conversation,
      contactInbox,
    })
    if (!text) {
      return
    }
    await postPublicCommentReply({
      text,
      commentId: data.commentId,
      conversationId: data.conversationId,
      contactInboxId: data.contactInboxId,
      workspaceId: data.workspaceId,
      contactInbox,
      parentMessageId: data.parentMessageId,
      parentMessageCreatedAt: data.parentMessageCreatedAt
        ? new Date(data.parentMessageCreatedAt)
        : null,
    })
    return
  }

  const generated = await generateAIReplyText({
    conversation,
    contactInbox,
    messages: [{ role: "user", content: data.message }],
    aiAgent: agent,
  })
  if (!generated?.text) {
    logger.info(
      {
        agentId: data.agentId,
        commentId: data.commentId,
        workspaceId: data.workspaceId,
      },
      "comment AI reply skipped: no text produced",
    )
    return
  }

  // Private DM.
  const { integrationRow } =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      data.integrationType as IntegrationType,
      data.integrationIdentifier,
    )

  await PRIVATE_REPLY_TEXT_SENDERS[data.channelType](
    integrationRow.auth as PrivateReplyAuth,
    data.commentId,
    generated.text,
  )
}
