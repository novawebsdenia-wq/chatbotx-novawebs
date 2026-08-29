import z from "zod"
import { possibleErrorsOnFindingResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPI } from "@/orpc"
import { facebookOverview, instagramOverview, tiktokOverview } from "../queries"

/**
 * El resumen de la cuenta de Instagram conectada.
 *
 * Existe porque el panel de Novawebs lo leia de Postiz, que se apago para
 * liberar memoria en el VPS. ChatbotX ya guarda el token, asi que lo sirve el
 * y nadie tiene que duplicar credenciales de Meta.
 */
const salida = z.object({
  data: z.object({
    account: z
      .object({ username: z.string(), avatar: z.string().nullable() })
      .nullable(),
    followers: z.number(),
    followerHistory: z.array(
      z.object({ date: z.string(), followers: z.number() }),
    ),
    insightsAvailable: z.boolean(),
    totals: z.object({
      posts: z.number(),
      views: z.number(),
      reach: z.number(),
      likes: z.number(),
      comments: z.number(),
      saved: z.number(),
      shares: z.number(),
      interactions: z.number(),
    }),
    posts: z.array(
      z.object({
        id: z.string(),
        caption: z.string(),
        permalink: z.string(),
        thumbnailUrl: z.string().nullable(),
        mediaType: z.string(),
        timestamp: z.string(),
        views: z.number().nullable(),
        reach: z.number().nullable(),
        likes: z.number().nullable(),
        comments: z.number().nullable(),
        saved: z.number().nullable(),
        shares: z.number().nullable(),
      }),
    ),
  }),
})

const entrada = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
})

const instagramOverviewWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "GET",
    path: "/v1/social-stats/instagram",
    summary: "Follower, engagement and insight stats of the Instagram account",
    tags: ["Social Stats"],
  })
  .input(entrada)
  .output(salida)
  .errors(possibleErrorsOnFindingResource)
  .handler(
    async ({ context, input }) =>
      await instagramOverview(context.workspace.id, input.days),
  )

const facebookOverviewWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "GET",
    path: "/v1/social-stats/facebook",
    summary: "Follower and engagement stats of the connected Facebook page",
    tags: ["Social Stats"],
  })
  .input(entrada)
  .output(salida)
  .errors(possibleErrorsOnFindingResource)
  .handler(
    async ({ context, input }) =>
      await facebookOverview(context.workspace.id, input.days),
  )

const tiktokOverviewWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "GET",
    path: "/v1/social-stats/tiktok",
    summary: "Follower and engagement counters of the TikTok account",
    tags: ["Social Stats"],
  })
  .input(entrada)
  .output(salida)
  .errors(possibleErrorsOnFindingResource)
  .handler(
    async ({ context, input }) =>
      await tiktokOverview(context.workspace.id, input.days),
  )

export const socialStatsAPI = {
  instagramOverviewWorkspaceTokenAPI,
  facebookOverviewWorkspaceTokenAPI,
  tiktokOverviewWorkspaceTokenAPI,
}
