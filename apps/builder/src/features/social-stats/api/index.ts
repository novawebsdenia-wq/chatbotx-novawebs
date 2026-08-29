import z from "zod"
import { possibleErrorsOnFindingResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPI } from "@/orpc"
import { instagramStats } from "../queries"

/**
 * Las estadisticas de las cuentas sociales conectadas.
 *
 * Existe porque el panel de Novawebs las leia de Postiz, que se apago para
 * liberar memoria en el VPS. ChatbotX ya guarda el token de Instagram, asi que
 * las sirve el y nadie tiene que duplicar credenciales de Meta.
 */
const instagramStatsWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "GET",
    path: "/v1/social-stats/instagram",
    summary: "Follower and engagement stats of connected Instagram accounts",
    tags: ["Social Stats"],
  })
  .input(z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }))
  .output(
    z.object({
      data: z.array(
        z.object({
          network: z.literal("instagram"),
          accountId: z.string(),
          username: z.string(),
          avatar: z.string().nullable(),
          followers: z.number().nullable(),
          follows: z.number().nullable(),
          posts: z.number().nullable(),
          likes: z.number(),
          comments: z.number(),
          postsInWindow: z.number(),
        }),
      ),
    }),
  )
  .errors(possibleErrorsOnFindingResource)
  .handler(
    async ({ context, input }) =>
      await instagramStats(context.workspace.id, input.days),
  )

export const socialStatsAPI = { instagramStatsWorkspaceTokenAPI }
