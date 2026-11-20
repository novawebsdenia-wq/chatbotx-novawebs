import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockAutomatedResponseProcess,
  mockFindDefaultForInbox,
  mockReplyByAI,
  mockTriggerDefaultReplyFlow,
} = vi.hoisted(() => ({
  mockAutomatedResponseProcess: vi.fn(),
  mockFindDefaultForInbox: vi.fn(),
  mockReplyByAI: vi.fn(),
  mockTriggerDefaultReplyFlow: vi.fn(),
}))

const conversation = {
  id: "conv-1",
  workspaceId: "ws-1",
  contactId: "contact-1",
}
const contactInbox = {
  id: "ci-1",
  contactId: "contact-1",
  inboxId: "inbox-facebook",
  channel: "messenger",
  lastMessageAt: null,
  createdAt: new Date("2026-11-20T10:00:00Z"),
}
const aiAgent = { id: "agent-1", models: [] }

vi.mock("@chatbotx.io/ai", () => ({
  AI_MESSAGE_HISTORY_LOOKBACK_MS: 86_400_000,
  MAX_CONVERSATION_HISTORY: 20,
  systemFunctionNames: {
    documentReader: "documentReader",
    imageReader: "imageReader",
  },
}))

vi.mock("@chatbotx.io/ai/server", () => ({
  aiContextService: {
    getOrInitContext: vi.fn(async () => null),
    mapDbMessagesToContext: vi.fn(() => []),
    mapContextToModelMessages: vi.fn(() => []),
  },
}))

vi.mock("@chatbotx.io/automated-response", () => ({
  automatedResponseService: { process: mockAutomatedResponseProcess },
}))

vi.mock("@chatbotx.io/business", () => ({
  aiAgentService: { findDefaultForInbox: mockFindDefaultForInbox },
  workspaceService: {
    findById: vi.fn(async () => ({
      id: "ws-1",
      defaultReply: "flow-default",
      defaultReplyFrequency: "allTime",
    })),
    isActiveNow: vi.fn(() => true),
  },
}))

vi.mock("@chatbotx.io/database/errors", () => ({
  isMessageStorageError: vi.fn(() => false),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  aiAgentProviderModels: { parse: (value: unknown) => value },
  aiMessageRoles: { enum: { user: "user" } },
  defaultReplyFrequencies: {
    safeParse: (value: unknown) => ({ data: value }),
    enum: { allTime: "allTime" },
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: vi.fn(async () => ({
    findTriggerMessage: vi.fn(async () => ({
      id: "msg-1",
      senderType: "contact",
      text: "hola",
      attachments: [],
    })),
    findAIContextMessages: vi.fn(async () => []),
  })),
  findConversationAIContextState: vi.fn(async () => null),
  getSafeSinceTime: vi.fn(() => new Date(0)),
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: vi.fn(async () => undefined),
}))

vi.mock("@chatbotx.io/sdk", () => ({
  DOCX_MIME_TYPES: [],
  IMAGE_MIME_TYPES: [],
  PDF_MIME_TYPES: [],
}))

vi.mock("../src/chat/handlers/send-message", () => ({
  sendTypingToChannel: vi.fn(async () => undefined),
}))

vi.mock("../src/lib/db", () => ({
  detectConversationAndContactInbox: vi.fn(async () => ({
    conversation,
    contactInbox,
  })),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}))

vi.mock("../src/integration/handlers/automated-response/default-reply", () => ({
  triggerDefaultReplyFlow: mockTriggerDefaultReplyFlow,
}))

vi.mock("../src/integration/handlers/automated-response/replies", () => ({
  replyByAI: mockReplyByAI,
}))

const { processAutomatedResponse } = await import(
  "../src/integration/handlers/automated-response"
)

const jobData = {
  conversationId: "conv-1",
  contactInboxId: "ci-1",
  messageId: "msg-1",
}

describe("processAutomatedResponse — IA por bandeja", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAutomatedResponseProcess.mockResolvedValue(false)
    mockTriggerDefaultReplyFlow.mockResolvedValue("triggered")
    mockReplyByAI.mockResolvedValue({ usedFallbackText: false })
  })

  test("bandeja apagada: sin IA, salta el flujo de respuesta por defecto", async () => {
    mockFindDefaultForInbox.mockResolvedValue(undefined)

    await processAutomatedResponse(jobData)

    expect(mockFindDefaultForInbox).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "inbox-facebook",
    })
    expect(mockReplyByAI).not.toHaveBeenCalled()
    expect(mockTriggerDefaultReplyFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultReplyFlowId: "flow-default",
        trackingContext: expect.objectContaining({
          triggerType: "bot_response_default_reply_flow_no_ai_agent",
        }),
      }),
    )
  })

  test("bandeja encendida: contesta el agente por defecto", async () => {
    mockFindDefaultForInbox.mockResolvedValue(aiAgent)

    await processAutomatedResponse(jobData)

    expect(mockReplyByAI).toHaveBeenCalledWith(
      expect.objectContaining({ aiAgent, channel: "messenger" }),
    )
    expect(mockTriggerDefaultReplyFlow).not.toHaveBeenCalled()
  })

  test("Keywords sigue teniendo prioridad sobre la IA", async () => {
    mockAutomatedResponseProcess.mockResolvedValue(true)
    mockFindDefaultForInbox.mockResolvedValue(aiAgent)

    await processAutomatedResponse(jobData)

    expect(mockFindDefaultForInbox).not.toHaveBeenCalled()
    expect(mockReplyByAI).not.toHaveBeenCalled()
    expect(mockTriggerDefaultReplyFlow).not.toHaveBeenCalled()
  })
})
