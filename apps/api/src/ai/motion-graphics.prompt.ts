import {
  LANGUAGE_LABELS,
  MG_COMPONENTS,
  MG_ICONS,
  MG_THEMES,
  type ClipLanguage,
} from '@piwu/shared';

/**
 * System prompt for Motion Graphics specs. Claude returns DATA ONLY —
 * every visual is drawn by code from a closed component catalog.
 */
export function motionGraphicsSystemPrompt(input: {
  language: ClipLanguage;
  durationSec: number;
  today: string;
}): string {
  const lang = LANGUAGE_LABELS[input.language];
  const seconds = Math.min(60, Math.max(35, input.durationSec));
  const words = seconds <= 40 ? '110–130' : '130–160';
  return `You write short vertical "motion graphics" explainers (flat 2D illustration drawn by code).
Return ONLY one JSON object, no prose, no code fences.

Language for every text field: ${lang.label} (${lang.detail}). Today is ${input.today}.

STRUCTURE (${seconds} s, about ${words} spoken words total):
1. Intro cue: "¿Qué pasaría si…?" style question (or the language equivalent) that states the topic.
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
  "intro": { "lines": [["¿QUÉ PASARÍA SI", ""], [topic line ≤3 words, keyword], [optional line, keyword]] },
  "cues": [[phrase of 2–8 words, keyword from that phrase or ""], …]   // cues[0] = the full intro question; the narration is all cues joined in order
  "scenes": [ {
      "firstCue": integer ≥1, strictly increasing,   // cue where the scene starts
      "component": one of the catalog below,
      "headline": [[line ≤4 words UPPERCASE, keyword], (optional 2nd line)],
      "props": { … exactly the props of that component … },
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

Keep strings short: labels ≤24 chars, pill ≤48, headline lines ≤4 words.`;
}
