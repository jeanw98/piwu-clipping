# Referencias del modo Motion Graphics

Videos hechos 100% con código (canvas 2D + voz ElevenLabs + Whisper). Son la referencia visual y de código para el modo `graphics`.

| Carpeta | Qué contiene |
| --- | --- |
| `nvidia/` | Video de noticia: `scene.html` completo, `components.js` (chip, siluetas, periódico, gráfica, caja fuerte, ojo, edificio, silla, carta…), `cues.json` (guion en frases + palabra clave), `timing.json` (tiempos reales tras Whisper), `sheet.jpg` (capturas) |
| `aliens/` | Ciencia ficción: fondo espacial, personaje Nova, nave |
| `isla/` | Supervivencia: personaje Mara, mar, fuego, palmeras |
| `arenas/` | Mito/peligro: personaje, corte de subsuelo, contador |
| `lib/helpers.js` | Utilidades comunes: easing, `rng`, texto con borde (`headline`), `pill`, `stamp`, `bigX`, `check`, viñeta |
| `catalogo-componentes.md` | Lista de todas las funciones de dibujo y en qué archivo están |

Estructura de cada `scene.html`: `SC` = tiempos de diseño por escena; `S[i](t)` dibuja la escena i; `dmap()` estira el tiempo de diseño al tiempo real de `timing.json`; `render(t)` limpia el cuadro, dibuja la escena, el corte diagonal y los subtítulos.

Nota: la fuente vive en `apps/api/assets/fonts/Poppins-Bold.ttf`.
