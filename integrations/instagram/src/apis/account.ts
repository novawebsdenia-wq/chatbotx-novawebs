import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { instagramBusinessClient } from "../lib/http-client"
import type { InstagramAuthValue } from "../schemas"

export type InstagramAccountOverview = {
  user_id: string
  username: string
  followers_count?: number
  follows_count?: number
  media_count?: number
  profile_picture_url?: string
}

export type InstagramMediaEngagement = {
  id: string
  timestamp: string
  media_type?: string
  caption?: string
  like_count?: number
  comments_count?: number
  permalink?: string
  media_url?: string
  thumbnail_url?: string
}

/** Los datos de la cuenta conectada: seguidores, seguidos y publicaciones. */
export const getInstagramAccountOverview = (props: {
  auth: InstagramAuthValue
}): Promise<InstagramAccountOverview> => {
  const { auth } = props
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/me`

  return rescue(endpoint, async () => {
    const res = await instagramBusinessClient.get<InstagramAccountOverview>(
      endpoint,
      {
        headers: { Authorization: `Bearer ${auth.tokens.accessToken}` },
        searchParams: {
          fields:
            "user_id,username,followers_count,follows_count,media_count,profile_picture_url",
        },
      },
    )
    return res
  })
}

/**
 * Los «me gusta» y comentarios de cada publicacion.
 *
 * Va aparte de `listInstagramMedia` a proposito: aquella alimenta el selector
 * de disparador y pide las urls de imagen, que aqui solo serian peso. Estos
 * dos contadores llegan con `instagram_business_basic`, sin necesitar el
 * permiso de estadisticas.
 */
export const listInstagramMediaEngagement = (props: {
  auth: InstagramAuthValue
}): Promise<InstagramMediaEngagement[]> => {
  const { auth } = props
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/me/media`

  return rescue(endpoint, async () => {
    const res = await instagramBusinessClient.get<{
      data: InstagramMediaEngagement[]
    }>(endpoint, {
      headers: { Authorization: `Bearer ${auth.tokens.accessToken}` },
      searchParams: {
        fields:
          "id,timestamp,media_type,caption,like_count,comments_count,permalink,media_url,thumbnail_url",
        limit: "100",
      },
    })
    return res.data
  })
}

export type InstagramAccountInsights = {
  views: number
  reach: number
  followerHistory: { date: string; followers: number }[]
}

/**
 * Alcance, visualizaciones y seguidores por dia.
 *
 * Necesita `instagram_business_manage_insights`. Una conexion sin ese permiso
 * recibe un error de la Graph API, y quien llama lo traduce a «no hay
 * estadisticas» — que es distinto de «todo a cero».
 */
export const getInstagramAccountInsights = (props: {
  auth: InstagramAuthValue
  days: number
}): Promise<InstagramAccountInsights> => {
  const { auth, days } = props
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/me/insights`
  const since = Math.floor((Date.now() - days * 86_400_000) / 1000)
  const until = Math.floor(Date.now() / 1000)

  return rescue(endpoint, async () => {
    const res = await instagramBusinessClient.get<{
      data: {
        name: string
        values?: { value: number; end_time?: string }[]
      }[]
    }>(endpoint, {
      headers: { Authorization: `Bearer ${auth.tokens.accessToken}` },
      searchParams: {
        metric: "reach,views,follower_count",
        period: "day",
        since: String(since),
        until: String(until),
      },
    })

    const serie = (nombre: string) =>
      res.data.find((m) => m.name === nombre)?.values ?? []
    const total = (nombre: string) =>
      serie(nombre).reduce((n, v) => n + (v.value ?? 0), 0)

    return {
      views: total("views"),
      reach: total("reach"),
      followerHistory: serie("follower_count")
        .filter((v) => v.end_time)
        .map((v) => ({
          date: (v.end_time as string).slice(0, 10),
          followers: v.value ?? 0,
        })),
    }
  })
}
