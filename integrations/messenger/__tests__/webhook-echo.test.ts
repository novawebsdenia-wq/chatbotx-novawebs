import { createHmac } from "node:crypto"
import { describe, expect, test, vi } from "vitest"
import { webhookHandler } from "../src/handlers/webhook"
import { MESSENGER_MESSAGE_METADATA, type MessengerConfig } from "../src/schema"

const CLIENT_SECRET = "test-client-secret"
const PAGE_ID = "page-1"

async function deliverEcho(message: Record<string, unknown>) {
  const body = JSON.stringify({
    object: "page",
    entry: [
      {
        id: PAGE_ID,
        time: 1_700_000_000,
        messaging: [
          {
            sender: { id: PAGE_ID },
            recipient: { id: "contact-psid" },
            timestamp: 1_700_000_000,
            message: {
              mid: "mid-echo",
              text: "hola",
              is_echo: true,
              ...message,
            },
          },
        ],
      },
    ],
  })
  const add = vi.fn().mockResolvedValue(undefined)
  await webhookHandler({
    config: {
      clientSecret: CLIENT_SECRET,
      verifyToken: "verify-token",
    } as unknown as MessengerConfig,
    req: new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "x-hub-signature-256": `sha256=${createHmac("sha256", CLIENT_SECRET).update(body).digest("hex")}`,
      },
      body,
    }),
    queue: { add },
  } as never)
  return add
}

describe("ecos de Messenger (base de la pausa del bot)", () => {
  test("el eco de un mensaje del bot (metadata de ChatbotX) no llega al worker", async () => {
    const add = await deliverEcho({ metadata: MESSENGER_MESSAGE_METADATA })

    expect(add).not.toHaveBeenCalledWith("incomingMessage", expect.anything())
  })

  test("el eco de un humano desde la bandeja de Meta se encola por la página", async () => {
    const add = await deliverEcho({})

    expect(add).toHaveBeenCalledWith(
      "incomingMessage",
      expect.objectContaining({
        data: expect.objectContaining({
          integrationType: "messenger",
          integrationIdentifier: PAGE_ID,
        }),
      }),
    )
  })
})
