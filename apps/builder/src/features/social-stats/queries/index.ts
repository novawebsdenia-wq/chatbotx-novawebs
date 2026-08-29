import { instagramIntegrationService } from "@chatbotx.io/business"
import {
  getInstagramAccountInsights,
  getInstagramAccountOverview,
  type InstagramAuthValue,
  listInstagramMediaEngagement,
} from "@chatbotx.io/integration-instagram"

export type InstagramOverview = {
  account: { username: string; avatar: string | null } | null
  followers: number
  followerHistory: { date: string; followers: number }[]
  /**
   * Si la conexion concede el permiso de estadisticas. En falso, alcance,
   * guardados y compartidos llegan a cero y la pantalla lo dice en vez de
   * hacerlos pasar por medidos.
   */
  insightsAvailable: boolean
  totals: {
    posts: number
    views: number
    reach: number
    likes: number
    comments: number
    saved: number
    shares: number
    interactions: number
  }
  posts: {
    id: string
    caption: string
    permalink: string
    thumbnailUrl: string | null
    mediaType: string
    timestamp: string
    views: number | null
    reach: number | null
    likes: number | null
    comments: number | null
    saved: number | null
    shares: number | null
  }[]
}

const VACIO: InstagramOverview = {
  account: null,
  followers: 0,
  followerHistory: [],
  insightsAvailable: false,
  totals: {
    posts: 0,
    views: 0,
    reach: 0,
    likes: 0,
    comments: 0,
    saved: 0,
    shares: 0,
    interactions: 0,
  },
  posts: [],
}

/**
 * El resumen de la cuenta de Instagram conectada.
 *
 * Lo servia Postiz, que se apago para liberar memoria en el VPS; por eso la
 * pantalla se quedo solo con YouTube. ChatbotX ya guarda el token, asi que
 * sale de aqui y nadie duplica credenciales de Meta.
 *
 * `instagram_business_basic` da seguidores, publicaciones y los me gusta y
 * comentarios de cada una. Alcance, guardados y compartidos viven en
 * `/me/insights` y necesitan `instagram_business_manage_insights`: si la
 * conexion no lo tiene, la llamada falla y se devuelve `insightsAvailable:
 * false` en vez de ceros que pareceran medidos.
 *
 * Autoriza nada: quien llama ya debe haber probado que puede leer el espacio.
 */
export async function instagramOverview(
  workspaceId: string,
  days: number,
): Promise<{ data: InstagramOverview }> {
  const integrations = await instagramIntegrationService.findByWorkspaceId(
    workspaceId,
    "instagram",
  )
  const integration = integrations[0]
  if (!integration) {
    return { data: VACIO }
  }

  const auth = integration.auth as InstagramAuthValue
  const desde = Date.now() - days * 24 * 60 * 60 * 1000

  const [cuenta, medios, insights] = await Promise.all([
    getInstagramAccountOverview({ auth }),
    listInstagramMediaEngagement({ auth }),
    getInstagramAccountInsights({ auth, days }).catch(() => null),
  ])

  const recientes = medios.filter(
    (m) => new Date(m.timestamp).getTime() >= desde,
  )
  const suma = (leer: (m: (typeof recientes)[number]) => number) =>
    recientes.reduce((n, m) => n + leer(m), 0)

  const likes = suma((m) => m.like_count ?? 0)
  const comments = suma((m) => m.comments_count ?? 0)

  return {
    data: {
      account: {
        username: cuenta.username ?? integration.username ?? "",
        avatar: cuenta.profile_picture_url ?? null,
      },
      followers: cuenta.followers_count ?? 0,
      followerHistory: insights?.followerHistory ?? [],
      insightsAvailable: insights !== null,
      totals: {
        posts: cuenta.media_count ?? recientes.length,
        views: insights?.views ?? 0,
        reach: insights?.reach ?? 0,
        likes,
        comments,
        saved: 0,
        shares: 0,
        interactions: likes + comments,
      },
      posts: recientes.map((m) => ({
        id: m.id,
        caption: m.caption ?? "",
        permalink: m.permalink ?? "",
        // `thumbnail_url` primero: en un video, `media_url` es el MP4.
        thumbnailUrl: m.thumbnail_url ?? m.media_url ?? null,
        mediaType: m.media_type ?? "",
        timestamp: m.timestamp,
        views: null,
        reach: null,
        likes: m.like_count ?? null,
        comments: m.comments_count ?? null,
        saved: null,
        shares: null,
      })),
    },
  }
}
