# Clips desde YouTube, Instagram o un archivo

En *Create → Desde video* hay dos formas de dar el video fuente:

- **Pegar link** (YouTube watch/Shorts o Instagram reel/post públicos): el servidor lo descarga con `yt-dlp`.
- **Subir archivo** (MP4/MOV/WEBM, hasta 30 min y `MAX_UPLOAD_MB`, por defecto 1 GB): siempre funciona,
  aunque la plataforma bloquee descargas desde el servidor.

## Cuando YouTube dice "Sign in to confirm you're not a bot"

YouTube marca a menudo las IP de datacenters (como el droplet). Opciones, de la más simple a la más robusta:

1. **Subir el archivo** en lugar del link.
2. **Cookies** de una cuenta de Google secundaria (no la personal):
   1. En un navegador con esa cuenta abierta, exporta `cookies.txt` (formato Netscape) de youtube.com, por
      ejemplo con la extensión "Get cookies.txt LOCALLY". Guía oficial:
      https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies
   2. Cópialo al servidor, p. ej. `/home/jeanwong/piwu-clipping/secrets/yt-cookies.txt` (`chmod 600`).
   3. Móntalo en el contenedor `api` (docker-compose: `- ./secrets/yt-cookies.txt:/run/secrets/yt-cookies.txt:ro`)
      y define `YTDLP_COOKIES_FILE=/run/secrets/yt-cookies.txt` en `.env`.
   4. `docker compose up -d api`. Las cookies caducan con el tiempo: si vuelve el error, expórtalas de nuevo.
3. **Proxy** residencial: `YTDLP_PROXY=http://usuario:clave@host:puerto`.

`YTDLP_EXTRACTOR_ARGS` permite pasar opciones avanzadas de yt-dlp (`--extractor-args`) sin redeploy de código.

## Qué hace el flujo

1. Fuente: descarga (1 sola consulta de metadatos + descarga ≤720p, con progreso) o archivo subido.
2. Transcripción con Whisper en el idioma del clip (palabras + frases con puntuación).
3. Claude elige los momentos sobre la transcripción completa (videos largos incluidos) y titula en el idioma del clip.
4. Cada corte empieza con una entrada breve y termina al final de una frase o pausa (nunca a media palabra).
5. Encuadre vertical siguiendo al sujeto, jump cuts de silencios, subtítulos y render.

Errores de la fuente (privado, bloqueado, demasiado largo, sin voz…) se muestran en español con qué hacer y no se reintentan.
En producción `yt-dlp` se actualiza solo al arrancar y una vez al día (`YTDLP_AUTO_UPDATE=false` para desactivarlo).

## Subida directa a S3

Con `STORAGE_DRIVER=s3` el navegador sube el archivo directo al bucket con una URL firmada
(`POST /clips/uploads/init` → `PUT` a S3 → `POST /clips/uploads/complete`, que valida el video con ffprobe
leyéndolo desde S3). El droplet no carga con los bytes y nginx no necesita cambios.

Requiere una regla CORS en el bucket que permita `PUT` desde el dominio de la web:

```json
[{ "AllowedOrigins": ["https://clipping.piwumarket.com"], "AllowedMethods": ["PUT", "GET", "HEAD"],
   "AllowedHeaders": ["*"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3000 }]
```

Si la subida directa falla por red/CORS, la web reintenta por la API (`PUT /clips/uploads`), que en el
droplet necesitaría `client_max_body_size` grande en nginx para esa ruta.
