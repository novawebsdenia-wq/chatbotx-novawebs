import { normalizeMetaAdReferral } from "@chatbotx.io/business/referral"
import {
  type Context,
  contentTypes,
  type IncomingAttachment,
  type IncomingContact,
  type IncomingMessage,
  type MessageReferral,
  messageTypes,
  type ReceivedMessageResult,
} from "@chatbotx.io/sdk"

import { getMessageAttachmentEntity } from "../../apis/page"
import { InstagramException } from "../../exception"
import { logger } from "../../lib/logger"
import {
  type InstagramAttachment,
  type InstagramAuthValue,
  type InstagramMessage,
  type InstagramMessagingEvent,
  instagramWebhookEventSchema,
} from "../../schemas"

/**
 * Post and reel shares. Their url is a page, not a file (a post share points
 * to lookaside, a reel share to its instagram.com/reel/ permalink, seen on
 * 15 Nov 2026): downloading it stored an empty `text/html` attachment. Shares
 * are kept only as metadata in `contentAttributes`.
 */
const SHARE_TYPES = new Set<InstagramAttachment["type"]>([
  "share",
  "ig_post",
  "ig_reel",
  "reel",
])

const getSharedPosts = (message: InstagramMessage) => {
  const seen = new Set<string>()
  const shares: {
    type: string
    url?: string
    title?: string
    mediaId?: string
  }[] = []
  for (const attachment of message.attachments ?? []) {
    if (!SHARE_TYPES.has(attachment.type)) {
      continue
    }
    const { url, title, ig_post_media_id, reel_video_id } = attachment.payload
    const rawMediaId = ig_post_media_id ?? reel_video_id
    const mediaId = rawMediaId == null ? undefined : String(rawMediaId)
    // During Meta's share -> ig_post transition the same post arrived twice
    const key = mediaId ?? url
    if (!key || seen.has(key)) {
      continue
    }
    seen.add(key)
    shares.push({ type: attachment.type, url, title, mediaId })
  }
  return shares
}

const getContentAttributes = (message: InstagramMessage) => {
  const storyReply = message.reply_to?.story
  if (storyReply) {
    return { type: "story_reply", story: storyReply }
  }
  const shares = getSharedPosts(message)
  return shares.length > 0 ? { type: "instagram_share", shares } : undefined
}

const getMessageAttachments = async (
  ctx: Context<InstagramAuthValue>,
  message: InstagramMessage,
): Promise<IncomingAttachment[]> => {
  if (!message.attachments) {
    return []
  }

  try {
    const attachmentPromises = message.attachments
      .filter(
        (attachment) =>
          attachment.payload.url && !SHARE_TYPES.has(attachment.type),
      )
      .map((attachment) =>
        getMessageAttachmentEntity({ ctx, attachment }).catch((error) => {
          logger.error("Error processing attachment", error)
          return null
        }),
      )

    const attachmentResults = await Promise.allSettled(attachmentPromises)
    return attachmentResults
      .filter(
        (result): result is PromiseFulfilledResult<IncomingAttachment> =>
          result.status === "fulfilled" && result.value !== null,
      )
      .map((result) => result.value)
  } catch (error) {
    logger.error(error, "Error getting message attachments")
    return []
  }
}

export const receiveMessage = async ({
  ctx,
  data,
}: {
  ctx: Context<InstagramAuthValue>
  data: {
    integrationType: string
    integrationIdentifier: string
    payload: unknown
  }
}): Promise<ReceivedMessageResult> => {
  const validatedData = instagramWebhookEventSchema.parse(data.payload)

  const entry = validatedData.entry[0]

  if (!entry.messaging?.[0]) {
    throw new InstagramException("No messaging found")
  }

  const messaging = entry.messaging[0]
  if (!(messaging.message || messaging.postback || messaging.referral)) {
    throw new InstagramException("No message found")
  }

  return await getMessageEntity(ctx, messaging)
}

const getMessageEntity = async (
  ctx: Context<InstagramAuthValue>,
  messaging: InstagramMessagingEvent,
): Promise<ReceivedMessageResult> => {
  let message: IncomingMessage | null = null
  let postbackAction: string | null = null
  let quickReplyAction: string | null = null
  let ref: string | null = null
  let referralSource: string | null = null
  let referral: MessageReferral | null = null

  const contactSourceId =
    messaging.sender.id === ctx.auth.metadata.igId
      ? messaging.recipient.id
      : messaging.sender.id
  const contact: IncomingContact = {
    sourceId: contactSourceId,
  }

  if (messaging.message) {
    message = {
      sourceId: messaging.message.mid,
      messageType:
        messaging.sender.id === ctx.auth.metadata.igId
          ? messageTypes.enum.outgoing
          : messageTypes.enum.incoming,
      text: messaging.message.text,
      contentType: contentTypes.enum.text,
      contentAttributes: getContentAttributes(messaging.message),
      attachments: await getMessageAttachments(ctx, messaging.message),
    }
    quickReplyAction = messaging.message.quick_reply?.payload ?? null
  }

  if (messaging.postback) {
    message = {
      sourceId: messaging.postback.mid,
      messageType: messageTypes.enum.incoming,
      text: messaging.postback.title,
      contentType: contentTypes.enum.text,
    }
    postbackAction = messaging.postback.payload

    if (messaging.postback.referral) {
      ref = messaging.postback.referral.ref ?? null
      referralSource = messaging.postback.referral.source
      referral = normalizeMetaAdReferral(messaging.postback.referral)
    }
  }

  if (messaging.referral) {
    ref = messaging.referral.ref ?? null
    referralSource = messaging.referral.source
    referral = normalizeMetaAdReferral(messaging.referral)
  }

  return {
    message,
    postbackAction,
    quickReplyAction,
    ref,
    referralSource,
    referral,
    contact,
  }
}
