import {
  LANGUAGE_LABELS,
  MG_ANIMS,
  MG_COMPONENTS,
  MG_GROUNDS,
  MG_HAIR,
  MG_HORIZONS,
  MG_ICONS,
  MG_OUTFIT,
  MG_POSES,
  MG_SKIES,
  MG_SKIN,
  MG_THEMES,
  MG_WEATHER,
  type ClipLanguage,
} from '@piwu/shared';

/**
 * System prompt for Motion Graphics specs. Claude returns DATA ONLY —
 * every visual is drawn by code from a closed component catalog.
 */
/** Per-clip part of the system prompt (kept out of the cached block). */
export function motionGraphicsClipBrief(input: {
  language: ClipLanguage;
  durationSec: number;
  today: string;
}): string {
  const lang = LANGUAGE_LABELS[input.language];
  const seconds = Math.min(60, Math.max(35, input.durationSec));
  const words = seconds <= 40 ? '110–130' : '130–160';
  return `THIS CLIP: ${seconds} s, about ${words} spoken words total. Language for every text field (except asset names / backgrounds, which stay English): ${lang.label} (${lang.detail}). Today is ${input.today}.`;
}

/**
 * Stable part of the system prompt (identical for every clip → prompt
 * caching). `catalog` = object names available in the library.
 */
export function motionGraphicsSystemPrompt(input: { catalog: string; places: string }): string {
  return `You write short vertical "motion graphics" explainers (flat 2D illustration drawn by code).
Return ONLY one JSON object, no prose, no code fences.

STRUCTURE (length and word budget are given in THIS CLIP below):
1. Intro cue: a question that states the topic, in the format that fits the prompt:
   "¿Qué pasaría si…?" (hypothetical), "¿Sabías que…?" (curious facts), "Última hora" (news),
   "¿Mito o realidad?" (myths). If the user names a format, use it. intro.lines[0] is that kicker in caps.
2. Hook in ≤2 s: a myth, a mistake or a surprising fact.
3. 3–4 facts, ONE fact per scene.
4. A twist.
5. Closing question as a call to action (e.g. "¿Tú qué harías? Te leo en comentarios").

RIGOR:
- Never invent numbers, dates, quotes or safety advice. If unsure, say it qualitatively.
- Mark hypothetical content as hypothetical (and set "disclaimer": "Escenario hipotético" or similar).
- News: separate confirmed facts from reported ones ("según…", "reportó…"); never state unproven accusations as fact. Set "disclaimer": "Información al <date>".
- Never draw real people: use Silhouette / SilhouettePair with role labels. No brand logos.

VISUALS — each scene must be understandable WITHOUT audio: one hero object per scene.

JSON SCHEMA:
{
  "title": string,
  "theme": ${MG_THEMES.map((t) => `"${t}"`).join(' | ')},
  "setting": SETTING (optional default scenery for every scene, see below),
  "intro": { "lines": [[KICKER e.g. "¿QUÉ PASARÍA SI" | "¿SABÍAS QUE…?" | "ÚLTIMA HORA", ""], [topic line ≤3 words, keyword], [optional line, keyword]] },
  "cues": [[phrase of 2–8 words, keyword from that phrase or ""], …]   // cues[0] = the full intro question; the narration is all cues joined in order
  "scenes": [ {
      "firstCue": integer ≥1, strictly increasing,   // cue where the scene starts
      "component": one of the catalog below,
      "headline": [[line ≤4 words UPPERCASE, keyword], (optional 2nd line)],
      "props": { … exactly the props of that component … },
      "setting": SETTING (optional, overrides the default for this scene),
      "elements": [ELEMENT, …] (optional, 0–6 per scene),
      "actions": [ACTION, …] (optional, 0–4 per scene: how the elements interact),
      "sfx": "whoosh" | "pop" | "alert" | "ding" | "none"
  } ],                                               // 6–9 scenes, 5–8 s each
  "sources": [string],
  "disclaimer": string (optional, ≤80 chars)
}

Every component also accepts optional "pill" (2–6 words context, ≤48 chars) and "date" (e.g. "29 OCT 2026").
COMPONENT CATALOG (closed list — any other name is rejected):
- TitleCard { label? }                       fallback emblem
- Chip { label? (≤8 chars, e.g. "IA"), ticker? }   processor; ticker = breaking-news band
- Newspaper { headline (≤48), masthead?, source? }
- SilhouettePair { leftLabel, rightLabel, watch? (bool: surveillance eye) }
- Silhouette { label?, crowd? (bool: +2 figures with "?") }
- StockChart { direction: "up"|"down", label?, value? }
- Safe { secured? (bool) }                   safe that locks
- Eye { label? }                             surveillance
- Building { label, shipments? (bool) }
- EmptyChair { role?, name?, falling? (bool: nameplate falls) }   resignation / vacancy
- Letter { title }                           memo, statement
- BigNumber { value (number), prefix?, suffix?, decimals?, label? }   counter
- ChecklistSteps { steps: 2–4 short strings }
- MythVsFact { myth, fact }
- Comparison { leftTitle, rightTitle, left: 1–3 strings, right: 1–3 strings }
- Globe { place?, lat?, lon? }               pulsing point on a country
- Timeline { dates: 2–4, labels: 2–4 (same length) }
- IconBurst { icon: ${MG_ICONS.map((i) => `"${i}"`).join('|')}, label? }
- Host { pose: "point"|"shrug"|"surprised"|"happy", say? }   original cartoon narrator (not a real person)
- Quote { quote (≤40), stamp? (e.g. "FALSO") }
- Magnifier { label? }                       investigation
Valid names: ${MG_COMPONENTS.join(', ')}.

Keep strings short: labels ≤24 chars, pill ≤48, headline lines ≤4 words.

SCENERY — make the video LOOK like the topic (beach → beach, city → city, kitchen → kitchen).
SETTING = {
  "sky": ${MG_SKIES.map((v) => `"${v}"`).join(' | ')},   // indoor_* = room walls with a window
  "ground": ${MG_GROUNDS.map((v) => `"${v}"`).join(' | ')},
  "horizon": ${MG_HORIZONS.map((v) => `"${v}"`).join(' | ')},
  "weather": ${MG_WEATHER.map((v) => `"${v}"`).join(' | ')}
}
Examples: beach {"sky":"day","ground":"sand","horizon":"sea"}; city at night {"sky":"night","ground":"asphalt","horizon":"city"};
kitchen/office {"sky":"indoor_warm","ground":"floor","horizon":"none"}; desert {"sky":"day","ground":"sand","horizon":"dunes","weather":"dust"};
snowy mountain {"sky":"overcast","ground":"snow","horizon":"mountains","weather":"snow"}; underwater {"sky":"underwater","ground":"water","horizon":"none","weather":"bubbles"}; outer space {"sky":"space","ground":"none"}.
Optional SETTING fields for places the parts above can't express:
- "palette": {"sky": [topHex, bottomHex], "ground": [topHex, bottomHex]} — e.g. Mars: sky ["#C2643A","#F2A65A"], ground ["#B5452B","#7E2E1C"], ground "sand", horizon "dunes", weather "dust". Alien planet, sunset ocean, neon city…
- "backdrop": one large place from this list drawn behind the scene: ${input.places}
- "background": English description of a very specific place to generate ONCE as a flat 2D image (e.g. "inside a spaceship cockpit", "ancient Roman forum", "hospital operating room"). Use only when sky/ground/horizon + palette + backdrop can't show the place. Max 2 distinct backgrounds per video; reuse the same text in scenes that share the place.
Set a top-level "setting" whenever the topic has a place; vary it per scene only when the story moves. Omit it only for abstract topics (data, finance, tech) — then the theme's abstract background is used.

ELEMENT = objects drawn on the scenery (the visual story of the scene):
- Object: {"asset": English emoji-style noun ("palm tree", "crab", "honey pot", "police car", "mobile phone"), "x": 0–1, "y": 0–1, "scale": 0.5–2, "anim": ${MG_ANIMS.map((v) => `"${v}"`).join('|')}, "delay": seconds, "flip"?: bool}
- Person (original cartoon, never a real person): {"character": {"skin": ${MG_SKIN.map((v) => `"${v}"`).join('|')}, "hair": ${MG_HAIR.map((v) => `"${v}"`).join('|')}, "outfit": ${MG_OUTFIT.map((v) => `"${v}"`).join('|')}, "pose": ${MG_POSES.map((v) => `"${v}"`).join('|')}}, "x", "y", "scale", "anim", "delay"}
Placement: (x, y) is where the element STANDS (bottom-center). Ground objects y 0.80–0.92; flying/floating things y 0.45–0.65; keep x 0.12–0.88.
Never put elements at y < 0.40 (headline zone). 2–4 elements per scene, staggered delays 0–0.6 s, one main element bigger (scale 1.2–1.6).
ASSET NAMES — the library has exactly these objects (use the exact name, lowercase):
${input.catalog}
If the object you need is not in that list, still write its plain English name (it will be generated once, at a small cost) — but prefer a listed object whenever it tells the story equally well. Max 2–3 unlisted objects per video. Animations: sway for plants, walk for animals/people, drive for vehicles, float for birds/fish/clouds, bounce/pulse for the key object.
ACTION = interactions between this scene's elements ("who"/"to"/"target"/"around" are indexes into "elements", 0-based).
"at" = WHEN: preferably a word or short phrase copied from THIS scene's narration (the action lands exactly when the voice says it), or seconds from the scene start.
- {"do":"moveTo","who":0,"to":1,"at":"<word>"}            walks/flies/drives next to element 1 (or "to": {"x":0.5,"y":0.85})
- {"do":"follow","who":0,"target":1,"at":"<word>","dur":2}  chases
- {"do":"throw","who":0,"what":"soccer ball","to":1,"at":"<word>"}  arc throw; the target reacts on impact
- {"do":"hit","who":0,"target":1,"at":"<word>"}            rushes in: impact burst, target shakes, a person looks surprised
- {"do":"orbit","who":0,"around":1,"at":0.5,"dur":2}       circles around (bees, planets, ideas)
- {"do":"appear","who":2,"at":"<word>"} / {"do":"disappear","who":2,"at":"<word>"}  reveal / remove on the beat
- {"do":"scale","who":1,"scale":1.6,"at":"<word>"}         grows (emphasis) or shrinks (<1)
- {"do":"transform","who":1,"into":"fire","at":"<word>"}   turns into another object (cause → effect)
- {"do":"pose","who":0,"pose":"surprised","at":"<word>"}   person reacts
- {"do":"say","who":0,"text":"¡OJO!","at":"<word>"}        short speech bubble (≤28 chars, clip language)
Good scenes tell a tiny cause → effect story without audio: the bee flies to the honey pot on "miel"; the car hits the traffic light on "caos"; the ice transforms into a droplet on "derrite"; the person points and says "¡MIRA!".
Max 3 things moving at once; leave ≥0.4 s between actions; the key action of the scene lands on its keyword.

Use "component": "None" when the scene is told with scenery + elements alone; use a data component (BigNumber, Timeline, MythVsFact, Comparison, StockChart…) when the scene is a number or a comparison — elements can still decorate around it.`;
}
