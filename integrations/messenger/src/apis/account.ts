import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookGraphClient } from "../lib/http-client"
import type { MessengerAuthValue } from "../schema"

export type FacebookPageOverview = {
  id: string
  name?: string
  fan_count?: number
  followers_count?: number
  picture?: { data?: { url?: string } }
}

export type FacebookPagePost = {
  id: string
  created_time: string
  message?: string
  full_picture?: string
  permalink_url?: string
  likes?: { summary?: { total_count?: number } }
  comments?: { summary?: { total_count?: number } }
  /** Ausente cuando la publicacion no tiene ninguna comparticion. */
  shares?: { count?: number }
}

/** Los datos de la pagina: nombre, seguidores y foto. */
export const getFacebookPageOverview = (props: {
  auth: MessengerAuthValue
}): Promise<FacebookPageOverview> => {
  const { auth } = props
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${auth.metadata.pageId}`

  return rescue(endpoint, async () =>
    facebookGraphClient.get<FacebookPageOverview>(endpoint, {
      searchParams: {
        fields: "id,name,fan_count,followers_count,picture.type(large){url}",
        access_token: auth.tokens.accessToken,
      },
    }),
  )
}

/**
 * Las publicaciones de la pagina con sus me gusta y comentarios.
 *
 * `summary(true)` es lo que hace que Graph devuelva el CONTADOR en vez de la
 * lista: sin el llegan las primeras reacciones paginadas y habria que recorrer
 * todas las paginas para saber cuantas son.
 *
 * Alcance e impresiones no estan aqui: viven en `/{page-id}/insights` y piden
 * `read_insights`, que la conexion de Messenger no solicita.
 */
export const listFacebookPagePosts = (props: {
  auth: MessengerAuthValue
}): Promise<FacebookPagePost[]> => {
  const { auth } = props
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${auth.metadata.pageId}/posts`

  return rescue(endpoint, async () => {
    const res = await facebookGraphClient.get<{ data: FacebookPagePost[] }>(
      endpoint,
      {
        searchParams: {
          fields:
            "id,created_time,message,full_picture,permalink_url,shares,likes.summary(true).limit(0),comments.summary(true).limit(0)",
          limit: "100",
          access_token: auth.tokens.accessToken,
        },
      },
    )
    return res.data ?? []
  })
}

export type FacebookPageInsights = {
  impressions: number
  reach: number
}

/**
 * Alcance e impresiones de la pagina.
 *
 * Necesita `read_insights`. Una conexion anterior a ese permiso recibe un
 * error de la Graph API, y quien llama lo traduce a «sin estadisticas» — que
 * es distinto de «todo a cero».
 */
export const getFacebookPageInsights = (props: {
  auth: MessengerAuthValue
  days: number
}): Promise<FacebookPageInsights> => {
  const { auth, days } = props
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${auth.metadata.pageId}/insights`
  const since = Math.floor((Date.now() - days * 86_400_000) / 1000)
  const until = Math.floor(Date.now() / 1000)

  return rescue(endpoint, async () => {
    const res = await facebookGraphClient.get<{
      data: { name: string; values?: { value: number }[] }[]
    }>(endpoint, {
      searchParams: {
        metric: "page_impressions,page_impressions_unique",
        period: "day",
        since: String(since),
        until: String(until),
        access_token: auth.tokens.accessToken,
      },
    })

    const total = (nombre: string) =>
      (res.data.find((m) => m.name === nombre)?.values ?? []).reduce(
        (n, v) => n + (v.value ?? 0),
        0,
      )

    return {
      impressions: total("page_impressions"),
      reach: total("page_impressions_unique"),
    }
  })
}
