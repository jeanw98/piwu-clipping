import { z } from 'zod';

/**
 * Motion Graphics mode (wire `graphics`).
 * Claude returns DATA ONLY (this spec). Remotion draws everything with canvas
 * code — no Leonardo, no Hailuo. See apps/api/src/remotion/mg/README.md.
 */

export const MG_THEMES = [
  'tech',
  'space',
  'news',
  'nature',
  'danger',
  'money',
  'health',
] as const;
export type MotionGraphicsTheme = (typeof MG_THEMES)[number];

export const MG_SFX = ['whoosh', 'pop', 'alert', 'ding', 'none'] as const;
export type MotionGraphicsSfx = (typeof MG_SFX)[number];

export const MG_ICONS = [
  'alert',
  'money',
  'heart',
  'bolt',
  'question',
  'star',
  'lock',
  'fire',
] as const;

/** [text, keyword-in-yellow]. Keyword may be '' (no highlight). */
const textPair = z.tuple([z.string().min(1).max(80), z.string().max(60)]);
const short = (max = 48) => z.string().trim().min(1).max(max);

/** Optional extras every component accepts. */
const base = {
  /** Small navy pill (context / source), 2–6 words. */
  pill: short(48).optional(),
  /** Red date badge, e.g. "29 OCT 2026". */
  date: short(24).optional(),
};

const props = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ ...base, ...shape }).strict();

/** Closed component catalog + per-component props. */
export const mgSceneComponentSchema = z.discriminatedUnion('component', [
  z.object({
    component: z.literal('TitleCard'),
    props: props({ label: short(24).optional() }).default({}),
  }),
  z.object({
    component: z.literal('Chip'),
    props: props({
      label: short(8).optional(),
      ticker: short(40).optional(),
    }).default({}),
  }),
  z.object({
    component: z.literal('Newspaper'),
    props: props({
      masthead: short(28).optional(),
      headline: short(48),
      source: short(40).optional(),
    }),
  }),
  z.object({
    component: z.literal('SilhouettePair'),
    props: props({
      leftLabel: short(24),
      rightLabel: short(24),
      watch: z.boolean().optional(),
    }),
  }),
  z.object({
    component: z.literal('Silhouette'),
    props: props({
      label: short(24).optional(),
      crowd: z.boolean().optional(),
    }).default({}),
  }),
  z.object({
    component: z.literal('StockChart'),
    props: props({
      direction: z.enum(['up', 'down']),
      label: short(24).optional(),
      value: short(16).optional(),
    }),
  }),
  z.object({
    component: z.literal('Safe'),
    props: props({ secured: z.boolean().optional() }).default({}),
  }),
  z.object({
    component: z.literal('Eye'),
    props: props({ label: short(24).optional() }).default({}),
  }),
  z.object({
    component: z.literal('Building'),
    props: props({
      label: short(24),
      shipments: z.boolean().optional(),
    }),
  }),
  z.object({
    component: z.literal('EmptyChair'),
    props: props({
      role: short(20).optional(),
      name: short(28).optional(),
      falling: z.boolean().optional(),
    }).default({}),
  }),
  z.object({
    component: z.literal('Letter'),
    props: props({ title: short(36) }),
  }),
  z.object({
    component: z.literal('BigNumber'),
    props: props({
      value: z.number().finite(),
      prefix: z.string().max(6).optional(),
      suffix: z.string().max(12).optional(),
      decimals: z.number().int().min(0).max(2).optional(),
      label: short(32).optional(),
    }),
  }),
  z.object({
    component: z.literal('ChecklistSteps'),
    props: props({ steps: z.array(short(32)).min(2).max(4) }),
  }),
  z.object({
    component: z.literal('MythVsFact'),
    props: props({ myth: short(40), fact: short(40) }),
  }),
  z.object({
    component: z.literal('Comparison'),
    props: props({
      leftTitle: short(18),
      rightTitle: short(18),
      left: z.array(short(24)).min(1).max(3),
      right: z.array(short(24)).min(1).max(3),
    }),
  }),
  z.object({
    component: z.literal('Globe'),
    props: props({
      place: short(24).optional(),
      lat: z.number().min(-90).max(90).optional(),
      lon: z.number().min(-180).max(180).optional(),
    }).default({}),
  }),
  z.object({
    component: z.literal('Timeline'),
    props: props({
      dates: z.array(short(14)).min(2).max(4),
      labels: z.array(short(24)).min(2).max(4),
    }),
  }),
  z.object({
    component: z.literal('IconBurst'),
    props: props({
      icon: z.enum(MG_ICONS),
      label: short(24).optional(),
    }),
  }),
  z.object({
    component: z.literal('Host'),
    props: props({
      pose: z.enum(['point', 'shrug', 'surprised', 'happy']),
      say: short(40).optional(),
    }),
  }),
  z.object({
    component: z.literal('Quote'),
    props: props({
      quote: short(40),
      stamp: short(16).optional(),
    }),
  }),
  z.object({
    component: z.literal('Magnifier'),
    props: props({ label: short(24).optional() }).default({}),
  }),
]);

export const MG_COMPONENTS = [
  'TitleCard',
  'Chip',
  'Newspaper',
  'SilhouettePair',
  'Silhouette',
  'StockChart',
  'Safe',
  'Eye',
  'Building',
  'EmptyChair',
  'Letter',
  'BigNumber',
  'ChecklistSteps',
  'MythVsFact',
  'Comparison',
  'Globe',
  'Timeline',
  'IconBurst',
  'Host',
  'Quote',
  'Magnifier',
] as const;
export type MotionGraphicsComponentName = (typeof MG_COMPONENTS)[number];

export const mgSceneSchema = z.intersection(
  z.object({
    firstCue: z.number().int().min(0),
    /** Max 2 lines, max 4 words per line. */
    headline: z
      .array(textPair)
      .min(1)
      .max(2)
      .refine(
        (lines) =>
          lines.every(([text]) => text.trim().split(/\s+/).length <= 4),
        'headline lines must have at most 4 words',
      ),
    sfx: z.enum(MG_SFX).optional(),
  }),
  mgSceneComponentSchema,
);
export type MotionGraphicsScene = z.infer<typeof mgSceneSchema>;

export const motionGraphicsSpecSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    theme: z.enum(MG_THEMES),
    /** lines[0] = kicker banner ("¿QUÉ PASARÍA SI"), then 1–3 topic lines. */
  intro: z.object({ lines: z.array(textPair).min(2).max(4) }),
    /** Script in 2–8 word phrases + keyword. cues[0] = intro line. */
    cues: z.array(textPair).min(4).max(60),
    /** Prompt asks for 6–9; schema tolerates 3–12 for hand-written fixtures. */
    scenes: z.array(mgSceneSchema).min(3).max(12),
    sources: z.array(z.string().max(200)).max(8).default([]),
    disclaimer: z.string().max(80).optional(),
  })
  .superRefine((spec, ctx) => {
    let prev = 0;
    spec.scenes.forEach((scene, index) => {
      if (scene.firstCue < 1 || scene.firstCue >= spec.cues.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scenes', index, 'firstCue'],
          message: `firstCue must be between 1 and ${spec.cues.length - 1} (cue 0 is the intro)`,
        });
      }
      if (index > 0 && scene.firstCue <= prev) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scenes', index, 'firstCue'],
          message: 'firstCue must strictly increase scene by scene',
        });
      }
      prev = scene.firstCue;
    });
  });
export type MotionGraphicsSpec = z.infer<typeof motionGraphicsSpecSchema>;

/** Real timing after alignment (seconds). */
export interface MotionGraphicsTiming {
  intro: [number, number];
  scenes: Array<[number, number]>;
  cues: Array<[number, number]>;
  end: number;
}

/** Spoken narration = every cue joined (ElevenLabs reads this once). */
export function mgNarration(spec: Pick<MotionGraphicsSpec, 'cues'>): string {
  return spec.cues
    .map(([text]) => text.trim())
    .filter(Boolean)
    .join(' ');
}

/** Accent colour per theme (key word stays #FFD23F everywhere). */
export const MG_THEME_ACCENT: Record<MotionGraphicsTheme, string> = {
  tech: '#76B900',
  space: '#7C6BFF',
  news: '#3FA9FF',
  nature: '#4CC07A',
  danger: '#FF3B3B',
  money: '#2BB673',
  health: '#3FD0FF',
};

export const MG_COLORS = {
  yellow: '#FFD23F',
  red: '#FF3B3B',
  navy: '#14213D',
} as const;

/**
 * Validate scenes one by one so a single bad component can fall back to
 * TitleCard without throwing away the whole spec.
 */
export function validateMgScenes(rawScenes: unknown[]): {
  scenes: Array<MotionGraphicsScene | null>;
  errors: string[];
} {
  const errors: string[] = [];
  const scenes = rawScenes.map((raw, index) => {
    const parsed = mgSceneSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    errors.push(
      `scenes[${index}]: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`)
        .join('; ')}`,
    );
    return null;
  });
  return { scenes, errors };
}

/** Replace an invalid scene with the TitleCard fallback. */
export function titleCardFallback(
  raw: unknown,
  firstCue: number,
): MotionGraphicsScene {
  const r = (raw ?? {}) as { headline?: unknown; firstCue?: unknown };
  const headline = Array.isArray(r.headline)
    ? (r.headline as unknown[])
        .filter(
          (line): line is [string, string] =>
            Array.isArray(line) && typeof line[0] === 'string',
        )
        .slice(0, 2)
        .map(
          ([text, kw]) =>
            [
              text.trim().split(/\s+/).slice(0, 4).join(' ').slice(0, 80) ||
                '…',
              typeof kw === 'string' ? kw.slice(0, 60) : '',
            ] as [string, string],
        )
    : [];
  return {
    firstCue:
      typeof r.firstCue === 'number' && Number.isInteger(r.firstCue)
        ? r.firstCue
        : firstCue,
    headline: headline.length ? headline : [['DATO CLAVE', 'CLAVE']],
    component: 'TitleCard',
    props: {},
  };
}

/** Remotion `MotionGraphicsClip` input props. */
export interface MotionGraphicsCompositionProps {
  spec: MotionGraphicsSpec;
  timing: MotionGraphicsTiming;
  /** Narration (single ElevenLabs take). '' renders silent. */
  audioUrl: string;
  /** Path inside the Remotion public dir (apps/api/assets), e.g. "music/tech.mp3". */
  musicFile?: string | null;
  /** Play sfx/<name>.mp3 at each scene start. */
  sfx?: boolean;
  fps?: number;
}
