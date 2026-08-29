import { rescue } from "../exception"
import { createTiktokClient } from "../lib/http-client"
import type { TiktokApiResponse, TiktokUserInfo } from "../schema"

export const getUserInfo = ({
  accessToken,
}: {
  accessToken: string
}): Promise<TiktokUserInfo> =>
  rescue("user/info", async () => {
    const client = createTiktokClient(accessToken)
    const response = await client.get<
      TiktokApiResponse<{ user: TiktokUserInfo }>
    >("user/info/", {
      searchParams: { fields: "open_id,display_name,avatar_url,username" },
    })
    return response.data.user
  })

export type TiktokUserStats = {
  open_id?: string
  username?: string
  display_name?: string
  avatar_url?: string
  follower_count?: number
  following_count?: number
  likes_count?: number
  video_count?: number
}

/**
 * Los contadores de la cuenta: seguidores, seguidos, me gusta y videos.
 *
 * Van aparte de `getUserInfo` porque necesitan el scope `user.info.stats`,
 * que `user.info.basic` no incluye. Se piden juntos en una sola llamada
 * porque `user/info/` los devuelve todos por campos.
 *
 * NO hay estadisticas por video: eso pide `video.list`, que la conexion no
 * solicita.
 */
export const getUserStats = ({
  accessToken,
}: {
  accessToken: string
}): Promise<TiktokUserStats> =>
  rescue("user/info/stats", async () => {
    const client = createTiktokClient(accessToken)
    const response = await client.get<
      TiktokApiResponse<{ user: TiktokUserStats }>
    >("user/info/", {
      searchParams: {
        fields:
          "open_id,username,display_name,avatar_url,follower_count,following_count,likes_count,video_count",
      },
    })
    return response.data.user
  })
