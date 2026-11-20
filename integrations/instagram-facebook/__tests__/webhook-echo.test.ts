import { describe, expect, test, vi } from "vitest"
import { webhookHandler } from "../src/handlers/webhook"
import { hmacSha256Hex } from "../src/lib/webhook"
import { INSTAGRAM_MESSAGE_METADATA } from "../src/schemas"

const CLIENT_SECRET = "webhook-secret"
const ACCOUNT_ID = "ig-account-id"

async function deliverEcho(message: Record<string, unknown>) {
  const body = JSON.stringify({
    object: "instagram",
    entry: [
      {
        id: ACCOUNT_ID,
        time: 1_783_674_105,
        messaging: [
          {
            sender: { id: ACCOUNT_ID },
            recipient: { id: "contact-igsid" },
            timestamp: 1_783_674_105,
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
  const signature = await hmacSha256Hex(CLIENT_SECRET, body)
  const add = vi.fn()
  await webhookHandler({
    config: { clientSecret: CLIENT_SECRET },
    req: new Request("https://example.test/webhook", {
      method: "POST",
      body,
      headers: { "x-hub-signature-256": `sha256=${signature}` },
    }),
    queue: { add },
  } as never)
  return add
}

describe("ecos de DM (base de la pausa del bot)", () => {
  test("el eco de un mensaje del bot (metadata de ChatbotX) no llega al worker", async () => {
    const add = await deliverEcho({ metadata: INSTAGRAM_MESSAGE_METADATA })

    expect(add).not.toHaveBeenCalled()
  })

  test("el eco de un humano desde la app se encola por la cuenta que lo envió", async () => {
    const add = await deliverEcho({})

    expect(add).toHaveBeenCalledWith(
      "incomingMessage",
      expect.objectContaining({
        data: expect.objectContaining({
          integrationType: "instagram",
          integrationIdentifier: ACCOUNT_ID,
        }),
      }),
    )
  })
})
