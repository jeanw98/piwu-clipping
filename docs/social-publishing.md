# Publicar y programar en YouTube, Instagram y TikTok

PIWU Clipping publica los clips terminados en las cuentas que cada usuario vincula (OAuth),
ya sea **al momento** o **programados** (hasta 180 días adelante). Cada red necesita una app
propia registrada en su plataforma de desarrolladores. Mientras falten credenciales, esa red
aparece como **“sin configurar”** en *Cuentas* y no se puede vincular.

## 1. Variables comunes (servidor)

| Variable | Valor |
| --- | --- |
| `SOCIAL_TOKEN_KEY` | Clave de 32 bytes para cifrar los tokens (AES-256-GCM): `openssl rand -base64 32`. **No la cambies después**: los tokens guardados dejarían de poder leerse (habría que volver a vincular). |
| `PUBLIC_API_URL` | URL pública donde responde la API, sin `/` final. En producción: `https://clipping.piwumarket.com` |
| `PUBLIC_WEB_URL` | URL de la web a la que se vuelve tras vincular (si se omite, se usa `CORS_ORIGIN`). |

La URL de retorno (redirect URI) de cada red es:

```
{PUBLIC_API_URL}/social/youtube/callback
{PUBLIC_API_URL}/social/instagram/callback
{PUBLIC_API_URL}/social/tiktok/callback
```

> **Proxy del servidor:** el nginx del droplet solo envía a la API ciertas rutas. Hay que agregar
> `voices|social|posts` a la regla `location ~ ^/(clips|storage|usage|projects)(/|$)`.

## 2. YouTube Shorts

1. En [Google Cloud Console](https://console.cloud.google.com/) crea un proyecto y habilita **YouTube Data API v3**.
2. *APIs y servicios → Pantalla de consentimiento OAuth*: tipo **Externo**, agrega los scopes
   `youtube.upload` y `youtube.readonly`, y tu correo como usuario de prueba.
3. *Credenciales → Crear ID de cliente OAuth → Aplicación web*, con la redirect URI de arriba.
4. Copia `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.

**Límites importantes**
- Mientras el proyecto **no pase la auditoría de YouTube** (*YouTube API Services – Audit and Quota Extension*), los videos subidos por API quedan **privados**. La auditoría es gratuita pero tarda.
- Cuota por defecto: 10.000 unidades/día; cada subida cuesta ~1.600 → **unas 6 subidas al día** por proyecto.
- Un video vertical de ≤ 60 s se publica como Short (agregamos `#Shorts` al título si cabe).
- Con la app en modo “Prueba”, el refresh token de Google expira a los 7 días: publica la app (“En producción”) para tokens duraderos.

## 3. Instagram Reels

1. En [Meta for Developers](https://developers.facebook.com/) crea una app de tipo **Empresa** y agrega el producto **Instagram → API setup with Instagram login**.
2. En *Business login settings* agrega la redirect URI de arriba.
3. Copia el **Instagram App ID** y el **Instagram App Secret** (no los de Facebook) en `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET`.
4. Agrega tus cuentas de Instagram como testers mientras la app esté en modo desarrollo.

**Límites importantes**
- Solo **cuentas profesionales** (Empresa o Creador).
- Para cuentas que no tienen rol en la app hay que pasar la **App Review** del permiso `instagram_business_content_publish`.
- Meta descarga el video desde una URL pública: requiere `STORAGE_DRIVER=s3` (con almacenamiento local no funciona).
- 50 publicaciones por cuenta cada 24 h. Los tokens duran 60 días y se renuevan solos antes de vencer.

## 4. TikTok

1. En [TikTok for Developers](https://developers.tiktok.com/) crea una app y agrega **Login Kit** y **Content Posting API** (activa *Direct Post*).
2. Scopes: `user.info.basic`, `user.info.profile`, `video.publish`, `video.upload`.
3. Registra la redirect URI de arriba en Login Kit.
4. Copia `TIKTOK_CLIENT_KEY` y `TIKTOK_CLIENT_SECRET`.

**Límites importantes**
- Hasta que TikTok **audite la app**, todo se publica como **privado (SELF_ONLY)**: PIWU lee las privacidades permitidas y elige la más cercana a la pedida.
- Subimos el archivo directamente (FILE_UPLOAD), así que no hace falta verificar dominio.
- El token de acceso dura 24 h y se renueva solo con el refresh token (365 días).

## 5. Cómo funciona

- **Vincular:** *Cuentas → Vincular* abre el login de la red; al volver, la cuenta queda guardada con sus tokens cifrados.
- **Publicar:** en el detalle de un clip terminado, panel *Publicar*: eliges cuentas, título, descripción y privacidad, y luego *Ahora* o *Programar* (hora local del navegador).
- **Programación:** cada publicación es un job con retardo en BullMQ (`publish-queue`). Además, un barrido cada 5 min vuelve a encolar las publicaciones vencidas (por si Redis se reinició).
- **Errores:** hasta 3 intentos con espera exponencial. Los errores de autenticación no se reintentan: la publicación queda *Falló* con el aviso de volver a vincular. Desde el panel se puede *Reintentar* o *Cancelar*.
- **Seguridad:** los tokens se guardan cifrados (AES-256-GCM); el `state` de OAuth va firmado y vence a los 15 min.
