import { instagramIntegrationService } from "@chatbotx.io/business"
import {
  getInstagramAccountOverview,
  type InstagramAuthValue,
  listInstagramMediaEngagement,
} from "@chatbotx.io/integration-instagram"
import { collectSettled } from "@/lib/collect-settled"

export type SocialAccountStats = {
  network: "instagram"
  accountId: string
  username: string
  avatar: string | null
  followers: number | null
  follows: number | null
  posts: number | null
  /** Sumas de las publicaciones dentro de la ventana pedida. */
  likes: number
  comments: number
  postsInWindow: number
}

/**
 * El resumen de las cuentas de Instagram conectadas.
 *
 * Sale de `instagram_business_basic`, que es lo que la conexion ya concede:
 * seguidores, seguidos, total de publicaciones y los «me gusta» y comentarios
 * de cada una.
 *
 * Lo que NO hay aqui es alcance, impresiones ni visitas al perfil: eso vive en
 * `/me/insights` y pide un permiso de estadisticas que esta conexion no tiene.
 * Antes de anadirlo hay que ampliar los scopes y volver a autorizar la cuenta.
 *
 * Autoriza nada: quien llama ya debe haber probado que puede leer el espacio.
 */
export async function instagramStats(
  workspaceId: string,
  days: number,
): Promise<{ data: SocialAccountStats[] }> {
  const integrations = await instagramIntegrationService.findByWorkspaceId(
    workspaceId,
    "instagram",
  )
  const desde = Date.now() - days * 24 * 60 * 60 * 1000

  const data = await collectSettled(
    integrations,
    async (integration) => {
      const auth = integration.auth as InstagramAuthValue
      const [cuenta, medios] = await Promise.all([
        getInstagramAccountOverview({ auth }),
        listInstagramMediaEngagement({ auth }),
      ])

      const recientes = medios.filter(
        (m) => new Date(m.timestamp).getTime() >= desde,
      )

      return {
        network: "instagram" as const,
        accountId: integration.igId,
        username: cuenta.username ?? integration.username ?? "",
        avatar: cuenta.profile_picture_url ?? null,
        followers: cuenta.followers_count ?? null,
        follows: cuenta.follows_count ?? null,
        posts: cuenta.media_count ?? null,
        likes: recientes.reduce((n, m) => n + (m.like_count ?? 0), 0),
        comments: recientes.reduce((n, m) => n + (m.comments_count ?? 0), 0),
        postsInWindow: recientes.length,
      }
    },
    (integration) => ({ integrationId: integration.id }),
    "Failed to read Instagram account stats",
  )

  return { data }
}
