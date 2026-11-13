import { z } from 'zod';
import {
  detectSocialVideoSource,
  isLinkClipSource,
} from './media-source';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});

export const stylePresetSchema = z
  .enum(['viral', 'cinematic', 'educational', 'comedy', 'dramatic'])
  .default('viral');

export const durationSecSchema = z
  .union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)])
  .default(30);

export const orientationSchema = z
  .enum(['portrait', 'landscape', 'square'])
  .default('portrait');

export const resolutionSchema = z.enum(['720p', '1080p']).default('1080p');

export const platformSchema = z
  .enum(['tiktok', 'reels', 'shorts', 'custom'])
  .default('tiktok');

export const languageSchema = z
  .enum([
    'es-LA',
    'es-ES',
    'en-US',
    'en-GB',
    'pt-BR',
    'fr-FR',
    'de-DE',
    'it-IT',
  ])
  .default('es-LA');

export const LANGUAGE_LABELS: Record<
  z.infer<typeof languageSchema>,
  { label: string; detail: string }
> = {
  'es-LA': { label: 'Spanish', detail: 'LatAm' },
  'es-ES': { label: 'Spanish', detail: 'Spain' },
  'en-US': { label: 'English', detail: 'US' },
  'en-GB': { label: 'English', detail: 'UK' },
  'pt-BR': { label: 'Portuguese', detail: 'Brazil' },
  'fr-FR': { label: 'French', detail: 'France' },
  'de-DE': { label: 'German', detail: 'Germany' },
  'it-IT': { label: 'Italian', detail: 'Italy' },
};

export const sourceTypeSchema = z
  .enum(['prompt', 'youtube', 'instagram'])
  .default('prompt');

export const visualStyleSchema = z
  .enum(['ugc', 'cinematic', 'flat-2d', 'anime', 'documentary'])
  .default('ugc');

/**
 * Product labels (UI): Stills / Stills v2 / Highlight / Cinematic
 * stills = Leonardo stills + Ken Burns
 * fake   = Stills v2: Leonardo stills + Remotion dynamic camera (no Hailuo, no HTML)
 * semi   = Highlight: Hailuo on hook + payoff, stills mid
 * full   = Cinematic: Hailuo on every scene
 * auto   = infer from prompt
 */
export const motionSchema = z
  .enum(['auto', 'stills', 'fake', 'semi', 'full'])
  .default('auto');

/** Viral highlight options from a long-form / reel source. Default 3. */
export const clipCountSchema = z
  .union([z.literal(3), z.literal(5), z.literal(8)])
  .default(3);

export const captionSizeSchema = z.enum(['sm', 'md', 'lg', 'xl']);
export const captionPositionSchema = z.enum(['top', 'middle', 'bottom']);
export const captionLookSchema = z.enum(['stroke', 'pill']);

export const captionStyleSchema = z.object({
  enabled: z.boolean(),
  size: captionSizeSchema,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  highlight: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  position: captionPositionSchema,
  look: captionLookSchema,
});

export type CaptionStyle = z.infer<typeof captionStyleSchema>;
export type CaptionSize = z.infer<typeof captionSizeSchema>;

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  enabled: true,
  size: 'lg',
  color: '#FFFFFF',
  highlight: '#FFE14A',
  position: 'bottom',
  look: 'stroke',
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function normalizeCaptionStyle(value: unknown): CaptionStyle | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const size = captionSizeSchema.safeParse(raw.size);
  const position = captionPositionSchema.safeParse(raw.position);
  const look = captionLookSchema.safeParse(raw.look);
  return {
    enabled: raw.enabled !== false,
    size: size.success ? size.data : DEFAULT_CAPTION_STYLE.size,
    color:
      typeof raw.color === 'string' && HEX_COLOR.test(raw.color)
        ? raw.color
        : DEFAULT_CAPTION_STYLE.color,
    highlight:
      typeof raw.highlight === 'string' && HEX_COLOR.test(raw.highlight)
        ? raw.highlight
        : DEFAULT_CAPTION_STYLE.highlight,
    position: position.success ? position.data : DEFAULT_CAPTION_STYLE.position,
    look: look.success ? look.data : DEFAULT_CAPTION_STYLE.look,
  };
}

export const generateClipSchema = z
  .object({
    prompt: z.string().max(2000).optional(),
    sourceType: sourceTypeSchema.optional(),
    sourceUrl: z.string().max(500).optional(),
    stylePreset: stylePresetSchema.optional(),
    durationSec: durationSecSchema.optional(),
    orientation: orientationSchema.optional(),
    resolution: resolutionSchema.optional(),
    platform: platformSchema.optional(),
    language: languageSchema.optional(),
    captionStyle: captionStyleSchema.optional(),
    visualStyle: visualStyleSchema.optional(),
    motion: motionSchema.optional(),
    clipCount: clipCountSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const detected = detectSocialVideoSource(value.sourceUrl);
    const source =
      detected ??
      (isLinkClipSource(value.sourceType) ? value.sourceType : null) ??
      value.sourceType ??
      'prompt';

    if (isLinkClipSource(source) || detected) {
      if (!value.sourceUrl?.trim() || !detectSocialVideoSource(value.sourceUrl)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sourceUrl'],
          message:
            'Paste a public YouTube (watch/shorts) or Instagram (reel/post) URL you have rights to clip.',
        });
      }
      return;
    }
    if (!value.prompt || value.prompt.trim().length < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['prompt'],
        message: 'Prompt must be at least 10 characters.',
      });
    }
  });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type GenerateClipInput = z.infer<typeof generateClipSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type StylePreset = z.infer<typeof stylePresetSchema>;
export type ClipDurationSec = z.infer<typeof durationSecSchema>;
export type ClipOrientation = z.infer<typeof orientationSchema>;
export type ClipResolution = z.infer<typeof resolutionSchema>;
export type ClipPlatform = z.infer<typeof platformSchema>;
export type ClipLanguage = z.infer<typeof languageSchema>;
export type ClipSourceType = z.infer<typeof sourceTypeSchema>;
export type VisualStyle = z.infer<typeof visualStyleSchema>;
export type ClipMotion = z.infer<typeof motionSchema>;
export type ClipCount = z.infer<typeof clipCountSchema>;
