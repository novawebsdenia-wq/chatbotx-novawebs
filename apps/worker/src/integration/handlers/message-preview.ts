import {
  contentTypes,
  type FileType,
  getStoryReply,
  type IncomingMessage,
} from "@chatbotx.io/sdk"

export const MESSAGE_PREVIEW_MAX_LENGTH = 300

// Spanish on purpose: the only consumer is the novawebs.eu panel.
const ATTACHMENT_LABELS: Record<FileType, string> = {
  image: "[imagen]",
  video: "[vídeo]",
  audio: "[audio]",
  file: "[archivo]",
}

const REEL_SHARE_TYPES = new Set<unknown>(["ig_reel", "reel"])

/** Set by the Instagram parsers as `{ type: "instagram_share", shares: [{ type, … }] }`. */
const getShareLabel = (contentAttributes: unknown): string | undefined => {
  if (
    !(
      typeof contentAttributes === "object" &&
      contentAttributes !== null &&
      "type" in contentAttributes &&
      contentAttributes.type === "instagram_share" &&
      "shares" in contentAttributes &&
      Array.isArray(contentAttributes.shares)
    )
  ) {
    return
  }
  const first: unknown = contentAttributes.shares[0]
  if (!(typeof first === "object" && first !== null && "type" in first)) {
    return
  }
  return REEL_SHARE_TYPES.has(first.type)
    ? "[reel compartido]"
    : "[publicación compartida]"
}

// Counted in code points so an emoji is never cut in half.
const truncate = (text: string): string => {
  const chars = Array.from(text)
  return chars.length > MESSAGE_PREVIEW_MAX_LENGTH
    ? `${chars.slice(0, MESSAGE_PREVIEW_MAX_LENGTH).join("")}…`
    : text
}

/**
 * Short text for the `message_received` webhook: the message text cut to
 * {@link MESSAGE_PREVIEW_MAX_LENGTH}, or a label saying what was sent when it
 * has none (a photo, a voice note, a shared reel…).
 */
export const getMessagePreview = (
  message: Pick<
    IncomingMessage,
    "text" | "contentType" | "contentAttributes" | "attachments"
  >,
): string => {
  const text = message.text?.trim()
  if (text) {
    return truncate(text)
  }

  const shareLabel = getShareLabel(message.contentAttributes)
  if (shareLabel) {
    return shareLabel
  }

  const attachment = message.attachments?.[0]
  if (attachment) {
    return ATTACHMENT_LABELS[attachment.fileType]
  }

  if (message.contentType === contentTypes.enum.location) {
    return "[ubicación]"
  }

  if (getStoryReply(message.contentAttributes)) {
    return "[respuesta a historia]"
  }

  return "[mensaje]"
}
