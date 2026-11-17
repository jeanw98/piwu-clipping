import { z } from 'zod';
import { clipCountSchema, languageSchema, motionSchema, platformSchema, visualStyleSchema } from './schemas';

export const AUTOMATION_QUEUE = 'automation-queue' as const;

/** Content formats a daily automation can produce. */
export const AUTOMATION_FORMATS = {
  'sabias-que': {
    label: '¿Sabías que…?',
    kind: 'prompt',
    hint: 'Un dato sorprendente y verificable, contado con gancho.',
  },
  'top-3': {
    label: 'Top 3',
    kind: 'prompt',
    hint: 'Tres datos, trucos o curiosidades sobre un tema, del menos al más impactante.',
  },
  'mito-realidad': {
    label: 'Mito vs realidad',
    kind: 'prompt',
    hint: 'Una creencia popular y lo que de verdad dicen los datos.',
  },
  historia: {
    label: 'Historia corta',
    kind: 'prompt',
    hint: 'Una anécdota real con inicio, giro y cierre.',
  },
  quiz: {
    label: 'Pregunta / quiz',
    kind: 'prompt',
    hint: 'Una pregunta con pausa para pensar y luego la respuesta.',
  },
  'que-pasaria-si': {
    label: '¿Qué pasaría si…? / What if',
    kind: 'prompt',
    hint: 'Escenario hipotético en Motion Graphics, explicado en pantalla por tu presentador.',
  },
  'youtube-clips': {
    label: 'Clips de YouTube',
    kind: 'youtube',
    hint: 'Busca un video de YouTube del tema en ese idioma y saca los mejores momentos.',
  },
} as const;

export type AutomationFormat = keyof typeof AUTOMATION_FORMATS;

/** Automation formats that map to a clip format (fixed motion + presenter). */
export const AUTOMATION_CLIP_FORMAT: Partial<Record<AutomationFormat, 'what-if'>> = {
  'que-pasaria-si': 'what-if',
};
export const AUTOMATION_FORMAT_IDS = Object.keys(AUTOMATION_FORMATS) as AutomationFormat[];

export const automationBlockSchema = z
  .object({
    id: z.string().min(1).max(64),
    format: z.enum(AUTOMATION_FORMAT_IDS as [AutomationFormat, ...AutomationFormat[]]),
    language: languageSchema,
    /** Prompt formats: videos to create. YouTube: source videos to clip. */
    count: z.number().int().min(1).max(10),
    durationSec: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)]),
    platform: platformSchema,
    /** Prompt formats only. */
    visualStyle: visualStyleSchema.optional(),
    motion: motionSchema.optional(),
    /** YouTube only: clips per source video. */
    clipCount: clipCountSchema.optional(),
    /**
     * Free-text description of how the videos should look/feel, e.g.
     * "2D con motion graphics, colores vivos". Added to every prompt; when
     * visualStyle/motion are not set, the planner picks them from this text.
     */
    styleNotes: z.string().max(500).optional(),
    /** Overrides the automation's topic hint for this block. */
    topicHint: z.string().max(500).optional(),
    /** ElevenLabs voice (prompt formats); empty = a native voice for the language. */
    voiceId: z.string().max(64).optional().nullable(),
    /** "¿Qué pasaría si?": show the user's presenter on screen (default true). */
    presenter: z.boolean().optional(),
  })
  .strict();

export type AutomationBlock = z.infer<typeof automationBlockSchema>;

/** Daily caps so one automation cannot swamp the render server. */
export const AUTOMATION_LIMITS = { promptVideos: 12, youtubeSources: 4 } as const;

export const automationInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    enabled: z.boolean().default(true),
    runHour: z.number().int().min(0).max(23),
    runMinute: z.number().int().min(0).max(59).default(0),
    timezone: z.string().min(1).max(64).default('America/Guayaquil'),
    /** What kind of topics to look for (e.g. "tecnología, finanzas personales"). */
    topicHint: z.string().max(1000).default(''),
    /** Search the web for what is trending today. */
    useTrends: z.boolean().default(true),
    projectId: z.string().uuid().nullable().optional(),
    blocks: z.array(automationBlockSchema).min(1).max(12),
  })
  .superRefine((value, ctx) => {
    let prompts = 0;
    let sources = 0;
    for (const block of value.blocks) {
      if (AUTOMATION_FORMATS[block.format].kind === 'youtube') sources += block.count;
      else prompts += block.count;
    }
    if (prompts > AUTOMATION_LIMITS.promptVideos) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blocks'],
        message: `Máximo ${AUTOMATION_LIMITS.promptVideos} videos generados con IA por día (tienes ${prompts}).`,
      });
    }
    if (sources > AUTOMATION_LIMITS.youtubeSources) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blocks'],
        message: `Máximo ${AUTOMATION_LIMITS.youtubeSources} videos de YouTube por día (tienes ${sources}).`,
      });
    }
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value.timezone });
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['timezone'], message: 'Zona horaria inválida' });
    }
  });

export type AutomationInput = z.infer<typeof automationInputSchema>;

export type AutomationRunStatus = 'PLANNING' | 'RUNNING' | 'ZIPPING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';

export interface AutomationRunItemDto {
  blockId: string;
  format: AutomationFormat;
  language: string;
  kind: 'prompt' | 'youtube';
  topic: string | null;
  prompt: string | null;
  sourceUrl: string | null;
  caption: string | null;
  clipJobId: string | null;
  status: string;
  error: string | null;
}

export interface AutomationRunDto {
  id: string;
  automationId: string;
  seq: number;
  localDate: string;
  trigger: 'schedule' | 'manual';
  status: AutomationRunStatus;
  topics: string[];
  items: AutomationRunItemDto[];
  error: string | null;
  zipName: string | null;
  videoCount: number;
  createdAt: string;
  finishedAt: string | null;
}

export interface AutomationDto extends AutomationInput {
  id: string;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Next scheduled run (ISO), null when disabled. */
  nextRunAt: string | null;
  lastRun: AutomationRunDto | null;
}
