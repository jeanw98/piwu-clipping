import { z } from 'zod';

/**
 * Content formats for single clips. `free` = whatever the prompt says.
 * `what-if` = "¿Qué pasaría si…?" / "What if…?": always Motion Graphics,
 * optionally narrated on screen by the user's presenter (e.g. their robot).
 */
export const CLIP_FORMATS = ['free', 'what-if'] as const;
export type ClipFormat = (typeof CLIP_FORMATS)[number];
export const clipFormatSchema = z.enum(CLIP_FORMATS);

export const CLIP_FORMAT_META: Record<ClipFormat, { label: string; hint: string }> = {
  free: { label: 'Libre', hint: 'El prompt decide el formato.' },
  'what-if': {
    label: '¿Qué pasaría si…? / What if',
    hint: 'Escenario hipotético en Motion Graphics, explicado por tu presentador.',
  },
};

/** Formats that only work with one motion mode. */
export function forcedMotionForFormat(format: string | null | undefined): 'graphics' | null {
  return format === 'what-if' ? 'graphics' : null;
}

export function normalizeClipFormat(format: unknown): ClipFormat {
  return format === 'what-if' ? 'what-if' : 'free';
}

/** The user's on-screen presenter (one per account). */
export interface PresenterDto {
  hasImage: boolean;
  name: string | null;
  updatedAt: string | null;
}

export const PRESENTER_MIMES = ['image/png', 'image/webp'] as const;
export const presenterUploadSchema = z.object({
  mime: z.enum(PRESENTER_MIMES),
  /** Raw base64 (no data: prefix). */
  data: z.string().min(32),
  name: z.string().trim().max(40).optional(),
});
export type PresenterUpload = z.infer<typeof presenterUploadSchema>;
