# Motion Graphics (`graphics`)

Animación 2D dibujada **solo con código** (canvas por cuadro). Cero Leonardo, cero Hailuo.
Referencias visuales y de código: `docs/motion-graphics/`.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `lib.ts` | Puerto de `docs/motion-graphics/lib/helpers.js` (`X` como parámetro): easing, `rng`, texto con borde, `headline`, `pill`, `stamp`, `bigX`, `check`, `dateBadge`, viñeta |
| `backgrounds.ts` | Fondos vivos por `theme`: `techBg`, `spaceBg`, `newsBg`, `natureBg`, `dangerBg`, `moneyBg`, `healthBg` |
| `components/*.ts` | Catálogo cerrado. Cada uno es `draw(X, t, props, accent, info)` con `t` = segundos desde el inicio de la escena |
| `frame.ts` | Composición pura por cuadro: fondo, intro, escena + corte diagonal, subtítulos + viñeta |
| `MotionGraphicsClip.tsx` | Composición Remotion: `CanvasLayer` por capa, un `<Sequence>` por escena, voz, música (0.15) y sfx |

| `settings.ts` | Escenarios procedurales: `sky` × `horizon` × `ground` × `weather` (playa, ciudad, interior, desierto, nieve…) |
| `elements.ts` | Objetos de la biblioteca y personaje paramétrico sobre el escenario, con presets de animación (sway, walk, drive, float…) |
| `images.ts` | Registro de imágenes precargadas (SVG de la biblioteca / PNG generados) |

## Cualquier tema = escenario + objetos

- **Escenario** (`setting` en el spec o por escena): combinaciones de cielo, horizonte, suelo y clima dibujadas con código. Sin `setting` se usa el fondo abstracto del `theme`.
- **Objetos** (`elements`): Claude los nombra en inglés ("palm tree", "crab"); el servidor los busca en `apps/api/assets/emoji` (Fluent Emoji Flat, MIT, ~1.600 objetos). Los que faltan se generan **una vez** (gpt-image-1-mini, fondo transparente, máx. `MG_MAX_GENERATED_ASSETS` por clip) y quedan en caché en storage (`assets/mg-object-<slug>.png`).
- **Personaje**: `{character: {skin, hair, outfit, pose}}`, original (nunca personas reales).
- **Lugares que no se arman con piezas**, en orden de costo:
  1. `palette` (colores libres de cielo/suelo: Marte, planetas, neón) — $0.
  2. `backdrop` (lugar grande de la biblioteca detrás de la escena: estadio, castillo, volcán) — $0.
  3. `background` (descripción en inglés de un lugar muy específico): se genera **una vez** un fondo plano 2D con el mismo estilo (`MG_STYLE`), máx. `MG_MAX_GENERATED_BACKGROUNDS` por clip, en caché como `assets/mg-bg-<slug>.png`. Si falla, se usa el escenario procedural.
- **Detección de objetos**: Claude recibe el catálogo exacto de nombres (bloque de system prompt con caché). En el servidor: nombre exacto → alias (`mg-asset-aliases.ts`) → búsqueda por palabras con umbral alto. Lo que no calza se genera; nunca se sustituye por un objeto distinto.
- QA pagada opcional: `ts-node src/scripts/mg-test-backgrounds.ts "<lugar>"` guarda en `tmp/mg-bg/`, y `mg:preview` los usa automáticamente.
- Specs de prueba: `docs/motion-graphics/scenes/{playa,ciudad,cocina}.spec.json`.

El catálogo de componentes y sus props viven en `packages/shared/src/motion-graphics.ts` (zod).
Para agregar un componente: schema en shared → `components/Nuevo.ts` → registrarlo en `components/index.ts` → listarlo en `apps/api/src/ai/motion-graphics.prompt.ts`.

## QA sin gastar

```bash
pnpm --filter @piwu/api mg:preview ../../docs/motion-graphics/nvidia/spec.json ../../docs/motion-graphics/nvidia/timing.json --scenes 1,2,3,9,10
pnpm --filter @piwu/api mg:preview ../../docs/motion-graphics/demo/spec.json ../../docs/motion-graphics/demo/timing.json   # catálogo
# --video [voz.mp3] también renderiza el MP4 completo (sin audio → pista muda)
```

Salida en `apps/api/tmp/mg-preview/`.

<!--
REGLAS VISUALES OBLIGATORIAS
- Capas por cuadro: fondo vivo → objeto protagonista con brillo o sombra → elementos secundarios → texto → viñeta.
- Algo se mueve siempre: zoom lento de cámara (1 + t*0.02), pulsos con Math.sin y partículas.
- Entradas con rebote (back), escalonadas cada 0,15–0,25 s, máximo 3 a la vez. Nada lineal salvo desplazamientos continuos.
- Una sola fuente gruesa (Poppins Bold, apps/api/assets/fonts). Titular de 80–110 px con borde negro del 16% del tamaño.
  Subtítulos de 56–58 px en y≈1150. Píldoras de 32–40 px.
- Colores fijos: amarillo #FFD23F para la palabra clave, rojo #FF3B3B para alertas y azul marino #14213D para las píldoras,
  más un acento por theme (MG_THEME_ACCENT).
- Zonas seguras: titulares en y≈400–480. Nada importante en los 270 px de arriba ni en los 670 px de abajo.
- Math.random prohibido: usa rng(semilla).
-->

## Reglas visuales obligatorias

- Capas por cuadro: fondo vivo → objeto protagonista con brillo o sombra → elementos secundarios → texto → viñeta.
- Algo se mueve siempre: zoom lento de cámara (`1 + t*0.02`), pulsos con `Math.sin` y partículas.
- Entradas con rebote (`back`), escalonadas cada 0,15–0,25 s, máximo 3 a la vez. Nada lineal salvo desplazamientos continuos.
- Una sola fuente gruesa (Poppins Bold). Titular de 80–110 px con borde negro del 16% del tamaño. Subtítulos de 56–58 px en y≈1150. Píldoras de 32–40 px.
- Colores fijos: amarillo `#FFD23F` (palabra clave), rojo `#FF3B3B` (alertas), azul marino `#14213D` (píldoras), más un acento por `theme`.
- Zonas seguras: titulares en y≈400–480. Nada importante en los 270 px de arriba ni en los 670 px de abajo.
- `Math.random` prohibido: usa `rng(semilla)`.
