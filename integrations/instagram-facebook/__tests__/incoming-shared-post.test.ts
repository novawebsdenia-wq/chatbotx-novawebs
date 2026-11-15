import { beforeEach, describe, expect, test, vi } from "vitest"
import { receiveMessage } from "../src/handlers/message/incoming-message"

const POST_URL =
  "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=18139494541428835&signature=abc"
// What Meta really sends for a reel share (15 Nov 2026): its public permalink
const REEL_URL = "https://www.instagram.com/reel/DeK1Kwvs9YO/"

const putObject = vi.fn(async () => undefined)

function buildCtx() {
  return {
    storagePrefix: "workspace-1",
    uploader: { putObject },
    auth: {
      clientId: "app-123",
      tokens: { accessToken: "page-token" },
      metadata: { igId: "ig-123", pageId: "page-123", version: "v23.0" },
    },
  } as never
}

function receive(message: Record<string, unknown>) {
  return receiveMessage({
    ctx: buildCtx(),
    data: {
      integrationType: "instagram-facebook",
      integrationIdentifier: "ig-123",
      payload: {
        object: "instagram",
        entry: [
          {
            id: "ig-123",
            time: 1_700_000_000,
            messaging: [
              {
                sender: { id: "user-1" },
                recipient: { id: "ig-123" },
                timestamp: 1_700_000_000,
                message: { mid: "mid-1", ...message },
              },
            ],
          },
        ],
      },
    },
  } as never)
}

const igPost = (type: string) => ({
  type,
  payload: {
    ig_post_media_id: "18139494541428835",
    title: "Un post de Novawebs",
    url: POST_URL,
  },
})

describe("instagram-facebook incoming shared posts and reels", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("keeps a shared post as metadata instead of downloading its lookaside page", async () => {
    const result = await receive({ attachments: [igPost("ig_post")] })

    expect(putObject).not.toHaveBeenCalled()
    expect(result?.message?.attachments).toEqual([])
    expect(result?.message?.contentAttributes).toEqual({
      type: "instagram_share",
      shares: [
        {
          type: "ig_post",
          url: POST_URL,
          title: "Un post de Novawebs",
          mediaId: "18139494541428835",
        },
      ],
    })
  })

  test("counts a post once when Meta sends both share and ig_post for it", async () => {
    const result = await receive({
      attachments: [igPost("share"), igPost("ig_post")],
    })

    const attributes = result?.message?.contentAttributes as {
      shares: unknown[]
    }
    expect(attributes.shares).toHaveLength(1)
  })

  test("keeps a shared reel as metadata instead of downloading its page", async () => {
    const result = await receive({
      attachments: [
        {
          type: "ig_reel",
          payload: { reel_video_id: 987_654, title: "Un reel", url: REEL_URL },
        },
      ],
    })

    expect(putObject).not.toHaveBeenCalled()
    expect(result?.message?.attachments).toEqual([])
    expect(result?.message?.contentAttributes).toEqual({
      type: "instagram_share",
      shares: [
        { type: "ig_reel", url: REEL_URL, title: "Un reel", mediaId: "987654" },
      ],
    })
  })

  test("a story reply keeps its own content attributes", async () => {
    const result = await receive({
      text: "me encanta",
      reply_to: { story: { id: "story-1", url: "https://story.cdn.test/1" } },
    })

    expect(result?.message?.contentAttributes).toEqual({
      type: "story_reply",
      story: { id: "story-1", url: "https://story.cdn.test/1" },
    })
  })
})
