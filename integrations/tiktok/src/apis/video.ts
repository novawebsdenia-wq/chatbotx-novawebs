import { rescue } from "../exception"
import { createTiktokClient } from "../lib/http-client"
import type { TiktokApiResponse } from "../schema"

export type TiktokVideo = {
  id: string
  create_time: number
  title?: string
  cover_image_url?: string
  share_url?: string
  view_count?: number
  like_count?: number
  comment_count?: number
  share_count?: number
}

const CAMPOS = [
  "id",
  "create_time",
  "title",
  "cover_image_url",
  "share_url",
  "view_count",
  "like_count",
  "comment_count",
  "share_count",
].join(",")

/**
 * Los videos de la cuenta con sus contadores.
 *
 * Necesita el scope `video.list`. Es un POST, no un GET, y los campos viajan
 * en la query mientras el tamano de pagina va en el cuerpo — asi lo pide la
 * API de TikTok. El cliente no acepta `searchParams` en POST, de ahi que los
 * campos vayan pegados a la ruta.
 *
 * TikTok NO expone los guardados (favoritos) de un video: da vistas, me
 * gusta, comentarios y compartidos, y nada mas.
 */
export const listVideos = ({
  accessToken,
  maxCount = 20,
}: {
  accessToken: string
  maxCount?: number
}): Promise<TiktokVideo[]> =>
  rescue("video/list", async () => {
    const client = createTiktokClient(accessToken)
    const response = await client.post<
      TiktokApiResponse<{ videos: TiktokVideo[] }>
    >(`video/list/?fields=${CAMPOS}`, { json: { max_count: maxCount } })
    return response.data.videos ?? []
  })
