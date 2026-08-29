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
  like_count?: number
  comments_count?: number
  permalink?: string
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
        fields: "id,timestamp,media_type,like_count,comments_count,permalink",
        limit: "100",
      },
    })
    return res.data
  })
}
