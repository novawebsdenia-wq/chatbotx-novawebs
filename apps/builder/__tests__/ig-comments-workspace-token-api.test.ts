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

const listIgCommentsForWorkspace = vi.fn()

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPI }))
vi.mock("@/features/ig-comments/queries", () => ({
  listIgCommentsForWorkspace,
}))
vi.mock("@/features/ig-comments/queries/instagram-media", () => ({
  listInstagramFacebookMedia: vi.fn(),
  listInstagramLoginMedia: vi.fn(),
}))
vi.mock("@/features/ig-comments/actions/create-ig-comment.action", () => ({
  createIgComment: vi.fn(),
}))
vi.mock("@/features/ig-comments/actions/delete-ig-comment.action", () => ({
  deleteIgComment: vi.fn(),
}))
vi.mock("@/features/ig-comments/actions/update-ig-comment.action", () => ({
  updateIgComment: vi.fn(),
}))

await import("@/features/ig-comments/api/workspace-token")

const listar = () => {
  const found = capturedProcedures.find(
    (p) => p.route.method === "GET" && p.route.path === "/v1/ig-comments",
  )
  if (!(found?.input && found.handler)) {
    throw new Error("GET /v1/ig-comments no registrado")
  }
  return found as Required<CapturedProcedure>
}

describe("GET /v1/ig-comments (token de espacio)", () => {
  beforeEach(() => {
    listIgCommentsForWorkspace.mockReset()
    listIgCommentsForWorkspace.mockResolvedValue({ data: [], pageCount: 2 })
  })

  test("acepta page y perPage desde la query (antes solo servía la primera página)", () => {
    const input = listar().input.parse({
      page: "2",
      perPage: "50",
      isActive: true,
    })
    expect(input).toMatchObject({ page: 2, perPage: 50, isActive: true })
  })

  test("pasa la página al listado y toma el espacio del token, no de la petición", async () => {
    const input = listar().input.parse({ page: "2", perPage: "50" })
    await listar().handler({ context: { workspace: { id: "123" } }, input })
    expect(listIgCommentsForWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, perPage: 50, workspaceId: "123" }),
    )
  })

  test("sin paginación sigue funcionando como antes", () => {
    expect(listar().input.parse({ name: "REA" })).toMatchObject({ name: "REA" })
  })
})
