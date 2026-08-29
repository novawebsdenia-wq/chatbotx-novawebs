export const MAX_BUTTONS = 3

export const INSTAGRAM_API_URL = "https://graph.instagram.com"

export const INSTAGRAM_OAUTH_URL = "https://api.instagram.com"

export const DEFAULT_API_VERSION = "v22.0"

export const INSTAGRAM_BUSINESS_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
  // Alcance, visualizaciones y seguidores por dia. Una conexion anterior a
  // este permiso sigue funcionando: las estadisticas llegan vacias y la
  // pantalla lo dice, hasta que se vuelva a autorizar la cuenta.
  "instagram_business_manage_insights",
]
