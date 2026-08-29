import {
  instagramIntegrationService,
  messengerIntegrationService,
  tiktokIntegrationService,
} from "@chatbotx.io/business"
import {
  getInstagramAccountInsights,
  getInstagramAccountOverview,
  type InstagramAuthValue,
  listInstagramMediaEngagement,
} from "@chatbotx.io/integration-instagram"
import {
  getFacebookPageOverview,
  listFacebookPagePosts,
  type MessengerAuthValue,
} from "@chatbotx.io/integration-messenger"
import {
  getUserStats,
  type TiktokAuthValue,
} from "@chatbotx.io/integration-tiktok"

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

/**
 * El resumen de la pagina de Facebook conectada.
 *
 * Misma forma que el de Instagram para que la pantalla no tenga que
 * distinguir: lo unico que cambia es de donde salen los numeros.
 *
 * `insightsAvailable` va siempre en falso: alcance e impresiones de pagina
 * viven en `/{page-id}/insights` y piden `read_insights`, que la conexion de
 * Messenger no solicita. Lo que si llega es real — seguidores y la suma de
 * me gusta y comentarios de las publicaciones.
 *
 * Autoriza nada: quien llama ya debe haber probado que puede leer el espacio.
 */
export async function facebookOverview(
  workspaceId: string,
  days: number,
): Promise<{ data: InstagramOverview }> {
  const integrations =
    await messengerIntegrationService.findByWorkspaceId(workspaceId)
  const integration = integrations[0]
  if (!integration) {
    return { data: VACIO }
  }

  const auth = integration.auth as MessengerAuthValue
  const desde = Date.now() - days * 86_400_000

  const [pagina, posts] = await Promise.all([
    getFacebookPageOverview({ auth }),
    listFacebookPagePosts({ auth }),
  ])

  const recientes = posts.filter(
    (p) => new Date(p.created_time).getTime() >= desde,
  )
  const likes = recientes.reduce(
    (n, p) => n + (p.likes?.summary?.total_count ?? 0),
    0,
  )
  const comments = recientes.reduce(
    (n, p) => n + (p.comments?.summary?.total_count ?? 0),
    0,
  )

  return {
    data: {
      account: {
        username: pagina.name ?? integration.name ?? "",
        avatar: pagina.picture?.data?.url ?? null,
      },
      followers: pagina.followers_count ?? pagina.fan_count ?? 0,
      followerHistory: [],
      insightsAvailable: false,
      totals: {
        posts: posts.length,
        views: 0,
        reach: 0,
        likes,
        comments,
        saved: 0,
        shares: 0,
        interactions: likes + comments,
      },
      posts: recientes.map((p) => ({
        id: p.id,
        caption: p.message ?? "",
        permalink: p.permalink_url ?? "",
        thumbnailUrl: p.full_picture ?? null,
        mediaType: "",
        timestamp: p.created_time,
        views: null,
        reach: null,
        likes: p.likes?.summary?.total_count ?? null,
        comments: p.comments?.summary?.total_count ?? null,
        saved: null,
        shares: null,
      })),
    },
  }
}

/**
 * El resumen de la cuenta de TikTok conectada.
 *
 * Misma forma que Instagram y Facebook para que la pantalla no distinga.
 *
 * TikTok da contadores de cuenta, no una serie: seguidores, seguidos, me
 * gusta acumulados y numero de videos. Los me gusta son el TOTAL historico de
 * la cuenta, no los de la ventana pedida — `video.list` daria el detalle por
 * video, y esta conexion no lo solicita. Por eso `days` no se usa aqui, y
 * `posts` va vacio en vez de fingir un listado.
 *
 * Autoriza nada: quien llama ya debe haber probado que puede leer el espacio.
 */
export async function tiktokOverview(
  workspaceId: string,
): Promise<{ data: InstagramOverview }> {
  const integrations = await tiktokIntegrationService.findAllByWorkspaceIds([
    workspaceId,
  ])
  const integration = integrations[0]
  if (!integration) {
    return { data: VACIO }
  }

  const auth = integration.auth as TiktokAuthValue
  const cuenta = await getUserStats({ accessToken: auth.tokens.accessToken })

  return {
    data: {
      account: {
        // `findAllByWorkspaceIds` proyecta solo id, workspaceId y auth: el
        // nombre de la cuenta esta en los metadatos del propio token.
        username: cuenta.username ?? auth.metadata.username ?? "",
        avatar: cuenta.avatar_url ?? null,
      },
      followers: cuenta.follower_count ?? 0,
      followerHistory: [],
      insightsAvailable: false,
      totals: {
        posts: cuenta.video_count ?? 0,
        views: 0,
        reach: 0,
        likes: cuenta.likes_count ?? 0,
        comments: 0,
        saved: 0,
        shares: 0,
        interactions: cuenta.likes_count ?? 0,
      },
      posts: [],
    },
  }
}
