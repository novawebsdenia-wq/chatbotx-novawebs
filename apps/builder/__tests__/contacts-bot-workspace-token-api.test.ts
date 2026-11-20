import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = { method: string; path: string }

type CapturedProcedure = {
  route: RouteConfig
  handler?: (...args: any[]) => any
}

const { workspaceTokenAuthAPI, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []
  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)
    const chain = {
      input: vi.fn(() => chain),
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

const {
  createMessage,
  disableBotForConversations,
  enableBotForConversations,
  findByContactWithInboxes,
  findDMByContact,
  pauseBotForHumanReply,
  resolveContactId,
} = vi.hoisted(() => ({
  createMessage: vi.fn(),
  disableBotForConversations: vi.fn(),
  enableBotForConversations: vi.fn(),
  findByContactWithInboxes: vi.fn(),
  findDMByContact: vi.fn(),
  pauseBotForHumanReply: vi.fn(),
  resolveContactId: vi.fn(),
}))

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPI }))
vi.mock("@chatbotx.io/business", () => ({
  automatedResponseService: {},
  contactCustomFieldService: {},
  contactInboxService: {},
  contactService: {},
  conversationService: {
    findByContactWithInboxes,
    findDMByContact,
    pauseBotForHumanReply,
  },
  tagService: {},
}))
// The real schemas pull @chatbotx.io/business (server env); the handlers under
// test only need something zod-shaped to build the routes.
vi.mock("@/features/messages/schema/mutation", async () => {
  const { z } = await import("zod")
  return { createMessageRequest: z.object({}) }
})
vi.mock("@/features/messages/schema/query", async () => {
  const { z } = await import("zod")
  return { listMessagesResponse: z.object({}) }
})
vi.mock("@/features/messages/schema/resource", async () => {
  const { z } = await import("zod")
  return { messageResourceWithRelations: z.object({}) }
})
vi.mock("@/features/tags/schema/query", async () => {
  const { z } = await import("zod")
  return { publicListTagsResponse: z.object({}) }
})
vi.mock("@/features/contacts/schemas/action", async () => {
  const { z } = await import("zod")
  return {
    createContactRequest: z.object({}),
    updateContactFieldRequest: z.object({}),
  }
})
vi.mock("@/features/contacts/schemas/contact-custom-field", async () => {
  const { z } = await import("zod")
  return {
    listPublicContactCustomFieldsResponse: z.object({}),
    publicContactCustomFieldResource: z.object({}),
  }
})
vi.mock("@/features/contacts/schemas/contact-import", async () => {
  const { z } = await import("zod")
  return { importContactsRequest: z.object({}) }
})
vi.mock("@/features/contacts/schemas/query", async () => {
  const { z } = await import("zod")
  return {
    contactResponse: z.object({}),
    listContactsRequest: z.object({ workspaceId: z.string() }),
    listContactsResponse: z.object({}),
    publicListContactsByCustomFieldRequest: z.object({}),
    publicListContactsResponse: z.object({}),
  }
})
vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))
vi.mock("@/features/conversations/actions/disable-bot.action", () => ({
  disableBotForConversations,
}))
vi.mock("@/features/conversations/actions/enable-bot.action", () => ({
  enableBotForConversations,
}))
vi.mock("@/features/messages/actions/create-message.action", () => ({
  createMessage,
}))
vi.mock("@/features/messages/queries", () => ({
  listMessages: vi.fn(),
  publicFindContactMessage: vi.fn(),
}))
vi.mock("@/features/contacts/actions/add-contact-custom-field.action", () => ({
  setContactCustomFieldValue: vi.fn(),
}))
vi.mock("@/features/contacts/actions/block-contact.action", () => ({
  blockContact: vi.fn(),
}))
vi.mock("@/features/contacts/actions/create-contact.action", () => ({
  createContact: vi.fn(),
}))
vi.mock("@/features/contacts/actions/delete-contact.action", () => ({
  deleteContact: vi.fn(),
}))
vi.mock("@/features/contacts/actions/unblock-contact.action", () => ({
  unblockContact: vi.fn(),
}))
vi.mock("@/features/contacts/actions/update-contact-field.action", () => ({
  updateContactFields: vi.fn(),
}))
vi.mock("@/features/contacts/contact-import.service", () => ({
  contactImportService: {},
}))
vi.mock("@/features/contacts/queries/list-contact-fields.query", () => ({
  findContactCustomField: vi.fn(),
  listContactCustomFields: vi.fn(),
}))
vi.mock("@/features/contacts/queries/list-contact-tags.query", () => ({
  listContactTags: vi.fn(),
}))
vi.mock("@/features/contacts/queries/list-contacts.queries", () => ({
  listContactsForAPI: vi.fn(),
}))
vi.mock("@/features/contacts/queries/public-find-contact", () => ({
  publicFindContact: vi.fn(),
  publicListContactsByCustomField: vi.fn(),
  resolveContactId,
}))

await import("@/features/contacts/api/workspace-token")

const procedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )
  if (!found?.handler) {
    throw new Error(`${method} ${path} no registrado`)
  }
  return found.handler
}

const context = { workspace: { id: "ws-1" } }
const contactInbox = {
  id: "ci-1",
  inboxId: "inbox-ig",
  contactId: "contact-1",
  channel: "instagram",
}
const dmConversation = {
  id: "conv-dm",
  workspaceId: "ws-1",
  contactId: "contact-1",
  sourceId: null,
  botEnabled: true,
  botResumeAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  resolveContactId.mockResolvedValue("contact-1")
  findByContactWithInboxes.mockResolvedValue({
    id: "conv-any",
    workspaceId: "ws-1",
    contactId: "contact-1",
    contactInboxes: [contactInbox],
  })
  findDMByContact.mockResolvedValue(dmConversation)
  pauseBotForHumanReply.mockResolvedValue(true)
})

describe("POST /v1/contacts/{identifier}/messages", () => {
  const send = () => procedure("POST", "/v1/contacts/{identifier}/messages")

  test("un texto enviado por la API pausa el bot del DM", async () => {
    await send()({
      context,
      input: { identifier: "id:contact-1", inboxId: "inbox-ig", text: "Hola" },
    })

    expect(createMessage).toHaveBeenCalledTimes(1)
    expect(findDMByContact).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      channel: "instagram",
    })
    expect(pauseBotForHumanReply).toHaveBeenCalledWith({
      conversation: dmConversation,
      triggerContext: {
        triggerSource: "api",
        triggerHandler: "sendMessageWorkspaceTokenAPI",
        triggerType: "conversation_transferred_to_human",
      },
    })
  })

  test("enviar un flujo por la API no pausa: es el propio bot", async () => {
    await send()({
      context,
      input: { identifier: "id:contact-1", flowId: "123" },
    })

    expect(createMessage).toHaveBeenCalledTimes(1)
    expect(pauseBotForHumanReply).not.toHaveBeenCalled()
  })

  test("una respuesta pública a un comentario no pausa el DM", async () => {
    await send()({
      context,
      input: {
        identifier: "id:contact-1",
        text: "Gracias",
        replyToMessageId: "msg-comment",
      },
    })

    expect(pauseBotForHumanReply).not.toHaveBeenCalled()
  })

  test("una respuesta privada a un comentario sí pausa el DM", async () => {
    await send()({
      context,
      input: {
        identifier: "id:contact-1",
        text: "Te escribo por aquí",
        replyToMessageId: "msg-comment",
        isPrivateReply: true,
      },
    })

    expect(pauseBotForHumanReply).toHaveBeenCalledTimes(1)
  })
})

describe("estado del bot por contacto", () => {
  test("GET /v1/contacts/{identifier}/bot devuelve el estado del DM", async () => {
    findDMByContact.mockResolvedValue({
      ...dmConversation,
      botEnabled: false,
      botResumeAt: new Date(Date.now() + 3_600_000),
    })

    const result = await procedure(
      "GET",
      "/v1/contacts/{identifier}/bot",
    )({
      context,
      input: { identifier: "id:contact-1" },
    })

    expect(findDMByContact).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
    })
    expect(result).toEqual(
      expect.objectContaining({
        conversationId: "conv-dm",
        botEnabled: false,
        botActive: false,
      }),
    )
  })

  test("POST .../bot/pause usa la misma acción que el panel", async () => {
    await procedure(
      "POST",
      "/v1/contacts/{identifier}/bot/pause",
    )({
      context,
      input: { identifier: "id:contact-1" },
    })

    // "panel", not undefined: an empty transferredBy reaches the webhook as
    // transferred_by "bot", the same as a real AI handoff to a person.
    expect(disableBotForConversations).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["conv-dm"],
      transferredBy: "panel",
    })
  })

  test("POST .../bot/resume usa la misma acción que el panel", async () => {
    const result = await procedure(
      "POST",
      "/v1/contacts/{identifier}/bot/resume",
    )({ context, input: { identifier: "id:contact-1" } })

    expect(enableBotForConversations).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["conv-dm"],
    })
    expect(result).toEqual(expect.objectContaining({ botActive: true }))
  })

  test("sin conversación de DM responde no encontrado", async () => {
    findDMByContact.mockResolvedValue(undefined)

    await expect(
      procedure(
        "POST",
        "/v1/contacts/{identifier}/bot/pause",
      )({
        context,
        input: { identifier: "id:contact-1" },
      }),
    ).rejects.toThrow("Conversation not found")
    expect(disableBotForConversations).not.toHaveBeenCalled()
  })
})
