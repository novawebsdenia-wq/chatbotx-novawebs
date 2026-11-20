import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = { method: string; path: string }

type CapturedProcedure = {
  route: RouteConfig
  input?: { parse: (v: unknown) => any }
  handler?: (...args: any[]) => any
}

const { workspaceTokenAuthAPI, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []
  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)
    const chain = {
      input: vi.fn((schema: CapturedProcedure["input"]) => {
        record.input = schema
        return chain
      }),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: (...args: any[]) => any) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }
  return {
    workspaceTokenAuthAPI: {
      route: vi.fn((config: RouteConfig) => makeProcedure(config)),
    },
    capturedProcedures,
  }
})

const { inboxFind, updateAIAgentEnabled } = vi.hoisted(() => ({
  inboxFind: vi.fn(),
  updateAIAgentEnabled: vi.fn(),
}))

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPI }))
vi.mock("@/features/inboxes/queries", () => ({ listInboxes: vi.fn() }))
vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))
vi.mock("@chatbotx.io/business", async () => {
  const { z } = await import("zod")
  return {
    inboxService: { find: inboxFind, updateAIAgentEnabled },
    listInboxesRequest: z.object({ workspaceId: z.string() }),
    inboxResource: z.object({
      id: z.string(),
      name: z.string(),
      channel: z.string(),
      status: z.string(),
      aiAgentEnabled: z.boolean(),
    }),
  }
})

await import("@/features/inboxes/api/workspace-token")

const procedure = (method: string) => {
  const found = capturedProcedures.find(
    (p) =>
      p.route.method === method &&
      p.route.path === "/v1/inboxes/{inboxId}/ai-agent",
  )
  if (!(found?.input && found.handler)) {
    throw new Error(`${method} /v1/inboxes/{inboxId}/ai-agent no registrado`)
  }
  return found as Required<CapturedProcedure>
}

const context = { workspace: { id: "ws-1" } }

beforeEach(() => {
  vi.clearAllMocks()
})

describe("/v1/inboxes/{inboxId}/ai-agent (token de espacio)", () => {
  test("GET lee el ajuste de la bandeja del propio espacio", async () => {
    inboxFind.mockResolvedValue({ id: "42", aiAgentEnabled: false })

    await expect(
      procedure("GET").handler({ context, input: { inboxId: "42" } }),
    ).resolves.toEqual({ id: "42", aiAgentEnabled: false })
    expect(inboxFind).toHaveBeenCalledWith({
      where: { id: "42", workspaceId: "ws-1" },
    })
  })

  test("PUT enciende la IA en la bandeja, con el espacio del token", async () => {
    updateAIAgentEnabled.mockResolvedValue({ id: "42", aiAgentEnabled: true })
    const input = procedure("PUT").input.parse({ inboxId: "42", enabled: true })

    await expect(procedure("PUT").handler({ context, input })).resolves.toEqual(
      { id: "42", aiAgentEnabled: true },
    )
    expect(updateAIAgentEnabled).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: "42",
      enabled: true,
    })
  })

  test("PUT exige el booleano enabled", () => {
    expect(() => procedure("PUT").input.parse({ inboxId: "42" })).toThrow()
  })

  test("una bandeja de otro espacio responde no encontrado", async () => {
    updateAIAgentEnabled.mockResolvedValue(undefined)

    await expect(
      procedure("PUT").handler({
        context,
        input: { inboxId: "99", enabled: true },
      }),
    ).rejects.toThrow("Inbox not found")
  })
})
