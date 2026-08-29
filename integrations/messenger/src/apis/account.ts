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
            "id,created_time,message,full_picture,permalink_url,likes.summary(true).limit(0),comments.summary(true).limit(0)",
          limit: "100",
          access_token: auth.tokens.accessToken,
        },
      },
    )
    return res.data ?? []
  })
}
