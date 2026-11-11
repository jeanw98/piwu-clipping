import { z } from 'zod';

const hexColor = z
  .string()
  .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, 'hex color');

export const worldSpecSceneSchema = z.object({
  backdropKit: z.string().min(1).max(48),
  keyProps: z.array(z.string().min(1).max(40)).max(6).default([]),
  motionBeat: z.string().min(1).max(120),
  textHook: z.string().min(1).max(80).optional().default(''),
});

export const worldSpecSchema = z.object({
  world: z.object({
    location: z.string().min(1).max(80),
    timeOfDay: z.enum(['day', 'sunset', 'night', 'indoor']).default('day'),
    mood: z.string().min(1).max(60),
    palette: z.array(hexColor).min(3).max(8),
  }),
  character: z.object({
    role: z.string().min(1).max(80),
    silhouette: z.string().min(1).max(120),
    outfitColors: z.array(hexColor).min(2).max(6),
    heldProps: z.array(z.string().min(1).max(40)).max(4).default([]),
  }),
  perScene: z.array(worldSpecSceneSchema).min(1).max(16),
  forbiddenDefaults: z.array(z.string().min(1).max(40)).max(12).default([]),
  packApi: z
    .object({
      drawHero: z.string().default('drawHero(cx, byFeet, scale, opts)'),
      environments: z.array(z.string()).max(8).default(['drawEnv(t)']),
      props: z.array(z.string()).max(12).default([]),
    })
    .optional(),
});

export type WorldSpec = z.infer<typeof worldSpecSchema>;
export type WorldSpecScene = z.infer<typeof worldSpecSceneSchema>;

const ISLAND_TOKENS = [
  'beach',
  'palm',
  'ocean',
  'sea',
  'island',
  'shore',
  'sand',
  'mara',
];

function promptLooksIsland(prompt: string): boolean {
  const t = prompt.toLowerCase();
  return /\b(beach|playa|island|isla|ocean|mar|palm|palmera|shore)\b/.test(t);
}

/** Deterministic fallback when Claude WorldSpec fails — never forces island. */
export function fallbackWorldSpec(
  prompt: string,
  sceneCount: number,
  styleAnchor = '',
): WorldSpec {
  const island = promptLooksIsland(prompt);
  const location = island
    ? 'tropical beach'
    : /\b(kitchen|cocina|cook)/i.test(prompt)
      ? 'home kitchen'
      : /\b(gym|gimnasio|workout)/i.test(prompt)
        ? 'gym floor'
        : /\b(office|oficina)/i.test(prompt)
          ? 'modern office'
          : /\b(city|ciudad|finance|finanzas)/i.test(prompt)
            ? 'city street'
            : 'everyday indoor set';

  const palette = island
    ? ['#4FA3E0', '#F5DEA6', '#FF8A1F', '#2F6FD6', '#FFFFFF']
    : ['#EEF2FF', '#334155', '#3B82F6', '#F8FAFC', '#FBBF24'];

  const forbiddenDefaults = island
    ? []
    : ['beach', 'palm', 'ocean', 'sea', 'island', 'sand', 'mara orange vest'];

  const perScene = Array.from({ length: Math.max(1, sceneCount) }, (_, i) => ({
    backdropKit: island ? 'beach' : location.replace(/\s+/g, '_').slice(0, 24),
    keyProps: island ? ['phone'] : ['laptop', 'phone'].slice(0, 1 + (i % 2)),
    motionBeat:
      i === 0
        ? 'hook pose + enter'
        : i === sceneCount - 1
          ? 'payoff gesture'
          : 'explain with hand motion',
    textHook: i === 0 ? 'HOOK' : '',
  }));

  return {
    world: {
      location,
      timeOfDay: island ? 'day' : 'indoor',
      mood: styleAnchor.slice(0, 60) || 'friendly energetic',
      palette,
    },
    character: {
      role: styleAnchor.slice(0, 80) || 'friendly explainer host',
      silhouette: 'rounded toy caricature, big head, soft limbs',
      outfitColors: island
        ? ['#FF8A1F', '#2F6FD6', '#FFFFFF']
        : ['#3B82F6', '#1E293B', '#F8FAFC'],
      heldProps: [],
    },
    perScene,
    forbiddenDefaults,
    packApi: {
      drawHero: 'drawHero(cx, byFeet, scale, opts)',
      environments: ['drawEnv(t)'],
      props: ['drawProp(name,x,y,s,t)'],
    },
  };
}

export function worldSpecSystemPrompt(sceneCount: number): string {
  return `You design a visual WORLD SPEC for a vertical flat-2D canvas cartoon.
Return ONLY valid JSON (no markdown) matching:
{
  "world": { "location": string, "timeOfDay": "day"|"sunset"|"night"|"indoor", "mood": string, "palette": ["#RRGGBB", ...] 3-8 colors },
  "character": { "role": string, "silhouette": string, "outfitColors": ["#RRGGBB", ...] 2-6, "heldProps": string[] },
  "perScene": [ { "backdropKit": string, "keyProps": string[], "motionBeat": string, "textHook": string } ]  // length EXACTLY ${sceneCount}
  "forbiddenDefaults": string[],  // always include beach/palm/ocean/island when topic is NOT beach/island
  "packApi": {
    "drawHero": "drawHero(cx, byFeet, scale, opts)",
    "environments": ["drawEnv(t)", ...],
    "props": ["drawFridge(x,y,s)", ...]
  }
}
Rules:
- Derive location/character from the USER TOPIC. Do NOT default to island/beach/mara.
- Only allow beach/ocean/palm when the user topic clearly needs them.
- perScene length must be exactly ${sceneCount}.
- Motions should be concrete (point at chart, stir pan, lift weight…), not vague.`;
}

export function parseWorldSpec(
  raw: string,
  prompt: string,
  sceneCount: number,
  styleAnchor = '',
): WorldSpec {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced ? fenced[1] : raw).trim();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        json = JSON.parse(text.slice(start, end + 1));
      } catch {
        return fallbackWorldSpec(prompt, sceneCount, styleAnchor);
      }
    } else {
      return fallbackWorldSpec(prompt, sceneCount, styleAnchor);
    }
  }

  const parsed = worldSpecSchema.safeParse(json);
  if (!parsed.success) {
    return fallbackWorldSpec(prompt, sceneCount, styleAnchor);
  }

  let spec = parsed.data;
  // Normalize perScene length
  if (spec.perScene.length < sceneCount) {
    const pad = fallbackWorldSpec(prompt, sceneCount, styleAnchor).perScene;
    spec = {
      ...spec,
      perScene: [
        ...spec.perScene,
        ...pad.slice(spec.perScene.length, sceneCount),
      ],
    };
  } else if (spec.perScene.length > sceneCount) {
    spec = { ...spec, perScene: spec.perScene.slice(0, sceneCount) };
  }

  if (!promptLooksIsland(prompt)) {
    const forbidden = new Set([
      ...spec.forbiddenDefaults.map((s) => s.toLowerCase()),
      ...ISLAND_TOKENS,
    ]);
    spec = {
      ...spec,
      forbiddenDefaults: [...forbidden],
    };
  }

  return spec;
}
