import type {
  AIAgentModel,
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { beforeEach, describe, expect, test, vi } from "vitest"

type FakeRun = {
  chunks: string[]
  finishReason: string
  abort?: boolean
}

const { runs, streamTextMock, warnMock } = vi.hoisted(() => ({
  runs: [] as FakeRun[],
  streamTextMock: vi.fn(),
  warnMock: vi.fn(),
}))

vi.mock("@chatbotx.io/ai", () => ({
  aiProviders: { openrouter: "openrouter" },
  aiTimeouts: { aiTotal: 120_000, aiStep: 60_000, aiChunk: 30_000 },
  helpTexts: { unavailable: "" },
  processStreamingText: async (textStream: AsyncIterable<string>) => {
    let fullText = ""
    for await (const delta of textStream) {
      fullText += delta
    }
    return { fullText, messageCount: fullText ? 1 : 0 }
  },
  systemFunctionNames: {},
  toolPrefixes: { enum: { sys: "sys", file: "file", fn: "fn", mcp: "mcp" } },
}))

vi.mock("@chatbotx.io/ai/server", () => ({
  aiContextService: { appendHistory: vi.fn() },
  appendFabricationGuard: (p: string) => p,
  appendHandoffPolicy: (p: string) => p,
  appendKnowledgeBaseGuard: (p: string) => p,
  appendToolOutputGuard: (p: string) => p,
  createAIProviderInstance: vi.fn(() => () => ({ type: "fake-model" })),
  createOpenaiCompatibleModelInstance: vi.fn(),
  getAIIntegrationInDB: vi.fn(async () => ({ id: "integration-1" })),
  getAIToolset: vi.fn(),
  McpClient: vi.fn(),
  normalizeAuthorizedWebSearchDomains: vi.fn(() => []),
  normalizeMcpContent: vi.fn((c: unknown) => c),
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationOpenaiCompatibleService: { findByWorkspaceIdAndId: vi.fn() },
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: {
    getAll: vi.fn(async () => ({})),
    replaceAll: vi.fn(async ({ text }: { text: string }) => text),
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: vi.fn() },
}))

vi.mock("ai", () => ({
  streamText: streamTextMock,
  stepCountIs: vi.fn(() => () => false),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { warn: warnMock, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock("../src/trigger/services/handoff-executor.service", () => ({
  handoffExecutorService: { execute: vi.fn() },
}))

vi.mock("../src/integration/utils/message", () => ({
  sendMessageAndWait: vi.fn(),
  sendMessageWithRender: vi.fn(),
}))

vi.mock("../src/integration/handlers/automated-response/default-reply", () => ({
  triggerDefaultReplyFlow: vi.fn(),
}))

vi.mock("../src/integration/handlers/automated-response/rich-reply", () => ({
  handleRichAIReply: vi.fn(),
}))

vi.mock(
  "../src/integration/handlers/automated-response/system-tools/document-reader",
  () => ({ createDocumentReaderExecutor: vi.fn() }),
)

vi.mock(
  "../src/integration/handlers/automated-response/system-tools/image-reader",
  () => ({ createImageReaderExecutor: vi.fn() }),
)

vi.mock(
  "../src/integration/handlers/automated-response/system-tools/url-reader",
  () => ({ createUrlReaderExecutor: vi.fn() }),
)

const { generateAIReplyText } = await import(
  "../src/integration/handlers/automated-response/replies"
)

async function* toStream(chunks: string[]) {
  for (const chunk of chunks) {
    yield await Promise.resolve(chunk)
  }
}

// Each call consumes the next fake run. An aborted run fires `onAbort` and
// still ends the text stream cleanly, as the AI SDK does on timeout.
function fakeStreamText(options: { onAbort?: () => void }) {
  const run = runs.shift() ?? { chunks: [], finishReason: "stop" }
  if (run.abort) {
    options.onAbort?.()
  }
  return {
    textStream: toStream(run.chunks),
    finishReason: Promise.resolve(run.finishReason),
  }
}

const agent = {
  id: "agent-1",
  workspaceId: "ws-1",
  prompt: "Eres Darío.",
  models: [
    { provider: "openrouter", model: "openai/gpt-6-luna" },
    { provider: "openrouter", model: "google/gemini-3.8-flash" },
  ],
  temperature: 0.6,
  maxOutputTokens: 1024,
} as unknown as AIAgentModel

const props = {
  conversation: {
    id: "conv-1",
    workspaceId: "ws-1",
    contactId: "contact-1",
  } as ConversationModel,
  contactInbox: { id: "ci-1", contactId: "contact-1" } as ContactInboxModel,
  messages: [{ role: "user" as const, content: "<comment>hola</comment>" }],
  aiAgent: agent,
}

beforeEach(() => {
  vi.clearAllMocks()
  runs.length = 0
  streamTextMock.mockImplementation(fakeStreamText)
})

describe("generateAIReplyText", () => {
  test("returns a complete reply from the first model", async () => {
    runs.push({ chunks: ["¿Qué ", "vas a probar?"], finishReason: "stop" })

    const result = await generateAIReplyText(props)

    expect(result).toEqual({
      text: "¿Qué vas a probar?",
      provider: "openrouter",
      modelId: "openai/gpt-6-luna",
    })
  })

  test("passes timeoutMs to the model call as its total budget", async () => {
    runs.push({ chunks: ["ok"], finishReason: "stop" })

    await generateAIReplyText({ ...props, timeoutMs: 15_000 })

    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: { totalMs: 15_000, stepMs: 15_000, chunkMs: 15_000 },
      }),
    )
  })

  test("a reply cut by the token cap is discarded and the next model answers", async () => {
    runs.push({ chunks: ["Sí, sobre todo la de"], finishReason: "length" })
    runs.push({ chunks: ["¿Y tú qué usas?"], finishReason: "stop" })

    const result = await generateAIReplyText(props)

    expect(result?.text).toBe("¿Y tú qué usas?")
    expect(result?.modelId).toBe("google/gemini-3.8-flash")
    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({ finishReason: "length" }),
      "[comment-ai-reply] discarded a cut-off reply",
    )
  })

  test("a reply cut by a timeout is never returned", async () => {
    runs.push({ chunks: ["Sí, sobre"], finishReason: "stop", abort: true })
    runs.push({ chunks: ["Sí, sobre"], finishReason: "stop", abort: true })

    const result = await generateAIReplyText(props)

    expect(result).toBeNull()
  })
})
