import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findManyByConversation: vi.fn(),
  revokeReply: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  fbCommentAutomationService: { revokeReply: mocks.revokeReply },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: () =>
    Promise.resolve({ findManyByConversation: mocks.findManyByConversation }),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: mocks.loggerWarn },
}))

const { verifyCommentAutomationReply } = await import(
  "../src/integration/handlers/comment-automation/verify-reply"
)

const COMMENT_ID = "17910408240660905"
const DISPATCHED_AT = "2026-11-11T15:49:12.900Z"
const TOKEN_ERROR =
  "Error validating access token: The session has been invalidated"

function jobData(deliverable: "public" | "private") {
  return {
    workspaceId: "workspace-1",
    conversationId: "conversation-1",
    commentId: COMMENT_ID,
    automationId: "automation-1",
    contactId: "contact-1",
    postId: "post-1",
    deliverable,
    dispatchedAt: DISPATCHED_AT,
  }
}

const publicReply = (outcome: { sourceId?: string; sendError?: string }) => ({
  type: "comment",
  contentAttributes: { replyToCommentId: COMMENT_ID },
  sourceId: outcome.sourceId ?? null,
  sendError: outcome.sendError ?? null,
})

const dm = (outcome: { sourceId?: string; sendError?: string }) => ({
  type: "message",
  contentAttributes: { type: "template" },
  sourceId: outcome.sourceId ?? null,
  sendError: outcome.sendError ?? null,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.revokeReply.mockResolvedValue(true)
})

describe("verifyCommentAutomationReply", () => {
  test("reads the outgoing messages of the comment conversation since dispatch", async () => {
    mocks.findManyByConversation.mockResolvedValue([])

    await verifyCommentAutomationReply(jobData("private"))

    expect(mocks.findManyByConversation).toHaveBeenCalledWith(
      "conversation-1",
      expect.objectContaining({
        messageTypes: ["outgoing"],
        sinceTime: new Date(DISPATCHED_AT),
        workspaceId: "workspace-1",
      }),
    )
  })

  test("removes the mark when both the public reply and the DM failed (revoked token)", async () => {
    mocks.findManyByConversation.mockResolvedValue([
      publicReply({ sendError: TOKEN_ERROR }),
      dm({ sendError: TOKEN_ERROR }),
    ])

    await verifyCommentAutomationReply(jobData("private"))

    expect(mocks.revokeReply).toHaveBeenCalledWith({
      automationId: "automation-1",
      contactId: "contact-1",
      postId: "post-1",
    })
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(1)
  })

  test("removes the mark when the DM failed even if the public reply went out", async () => {
    mocks.findManyByConversation.mockResolvedValue([
      publicReply({ sourceId: "18245383939317049" }),
      dm({ sendError: TOKEN_ERROR }),
    ])

    await verifyCommentAutomationReply(jobData("private"))

    expect(mocks.revokeReply).toHaveBeenCalledTimes(1)
  })

  test("keeps the mark when the DM was delivered even if the public reply failed", async () => {
    mocks.findManyByConversation.mockResolvedValue([
      publicReply({ sendError: TOKEN_ERROR }),
      dm({ sourceId: "aWdfZAG1faXRlbToxOklHTWVzc2FnZA" }),
    ])

    await verifyCommentAutomationReply(jobData("private"))

    expect(mocks.revokeReply).not.toHaveBeenCalled()
  })

  test("keeps the mark while the DM is neither sent nor failed", async () => {
    mocks.findManyByConversation.mockResolvedValue([dm({})])

    await verifyCommentAutomationReply(jobData("private"))

    expect(mocks.revokeReply).not.toHaveBeenCalled()
  })

  test("keeps the mark when no message was recorded at all", async () => {
    mocks.findManyByConversation.mockResolvedValue([])

    await verifyCommentAutomationReply(jobData("private"))

    expect(mocks.revokeReply).not.toHaveBeenCalled()
  })

  test("public deliverable: removes the mark when its reply to this comment failed", async () => {
    mocks.findManyByConversation.mockResolvedValue([
      publicReply({ sendError: TOKEN_ERROR }),
    ])

    await verifyCommentAutomationReply(jobData("public"))

    expect(mocks.revokeReply).toHaveBeenCalledTimes(1)
  })

  test("public deliverable: ignores failed replies to other comments", async () => {
    mocks.findManyByConversation.mockResolvedValue([
      {
        ...publicReply({ sendError: TOKEN_ERROR }),
        contentAttributes: { replyToCommentId: "another-comment" },
      },
    ])

    await verifyCommentAutomationReply(jobData("public"))

    expect(mocks.revokeReply).not.toHaveBeenCalled()
  })

  test("does not log when there was no mark left to remove", async () => {
    mocks.revokeReply.mockResolvedValue(false)
    mocks.findManyByConversation.mockResolvedValue([
      dm({ sendError: TOKEN_ERROR }),
    ])

    await verifyCommentAutomationReply(jobData("private"))

    expect(mocks.loggerWarn).not.toHaveBeenCalled()
  })
})
