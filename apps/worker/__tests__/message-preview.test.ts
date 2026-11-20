import type { IncomingAttachment } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import {
  getMessagePreview,
  MESSAGE_PREVIEW_MAX_LENGTH,
} from "../src/integration/handlers/message-preview"

const attachment = (
  fileType: IncomingAttachment["fileType"],
): IncomingAttachment => ({
  sourceId: "att-1",
  fileType,
  mimeType: "application/octet-stream",
  originPath: "files/att-1",
  size: 1,
})

describe("getMessagePreview", () => {
  test("devuelve el texto tal cual si es corto", () => {
    expect(
      getMessagePreview({ text: "  Hola, ¿precio?  ", contentType: "text" }),
    ).toBe("Hola, ¿precio?")
  })

  test("recorta el texto largo sin partir un emoji", () => {
    const text = `${"a".repeat(MESSAGE_PREVIEW_MAX_LENGTH - 1)}😀😀`

    const preview = getMessagePreview({ text, contentType: "text" })

    expect(preview).toBe(`${"a".repeat(MESSAGE_PREVIEW_MAX_LENGTH - 1)}😀…`)
  })

  test.each([
    ["image", "[imagen]"],
    ["audio", "[audio]"],
    ["video", "[vídeo]"],
    ["file", "[archivo]"],
  ] as const)("un adjunto %s sin texto se etiqueta %s", (fileType, label) => {
    expect(
      getMessagePreview({
        contentType: "text",
        attachments: [attachment(fileType)],
      }),
    ).toBe(label)
  })

  test.each([
    ["ig_reel", "[reel compartido]"],
    ["reel", "[reel compartido]"],
    ["ig_post", "[publicación compartida]"],
    ["share", "[publicación compartida]"],
  ])("compartir un %s se etiqueta %s", (type, label) => {
    expect(
      getMessagePreview({
        contentType: "text",
        contentAttributes: {
          type: "instagram_share",
          shares: [{ type, url: "https://www.instagram.com/reel/abc" }],
        },
      }),
    ).toBe(label)
  })

  test("una ubicación se etiqueta [ubicación]", () => {
    expect(
      getMessagePreview({
        contentType: "location",
        contentAttributes: { latitude: "38.8", longitude: "0.1" },
      }),
    ).toBe("[ubicación]")
  })

  test("una respuesta a historia sin texto ni adjunto", () => {
    expect(
      getMessagePreview({
        contentType: "text",
        contentAttributes: { type: "story_reply", story: { id: "story-1" } },
      }),
    ).toBe("[respuesta a historia]")
  })

  test("el texto manda sobre el adjunto", () => {
    expect(
      getMessagePreview({
        text: "Mira esto",
        contentType: "text",
        attachments: [attachment("image")],
      }),
    ).toBe("Mira esto")
  })

  test("sin nada reconocible cae en [mensaje]", () => {
    expect(getMessagePreview({ text: "   ", contentType: "text" })).toBe(
      "[mensaje]",
    )
  })
})
