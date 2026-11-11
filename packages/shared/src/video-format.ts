import type {
  ClipDurationSec,
  ClipMotion,
  ClipOrientation,
  ClipPlatform,
  ClipResolution,
  VisualStyle,
} from './schemas';

export interface VideoFormatSpec {
  width: number;
  height: number;
  fps: number;
  aspectLabel: string;
  recommendedDurationSec: ClipDurationSec[];
  tip: string;
}

const ORIENTATION_BASE: Record<
  ClipOrientation,
  { w: number; h: number; aspectLabel: string }
> = {
  portrait: { w: 9, h: 16, aspectLabel: '9:16' },
  landscape: { w: 16, h: 9, aspectLabel: '16:9' },
  square: { w: 1, h: 1, aspectLabel: '1:1' },
};

const RESOLUTION_LONG_EDGE: Record<ClipResolution, number> = {
  '720p': 1280,
  '1080p': 1920,
};

export function resolveVideoFormat(
  orientation: ClipOrientation = 'portrait',
  resolution: ClipResolution = '1080p',
): VideoFormatSpec {
  const base = ORIENTATION_BASE[orientation];
  const longEdge = RESOLUTION_LONG_EDGE[resolution];
  const scale = longEdge / Math.max(base.w, base.h);
  const width = Math.round(base.w * scale);
  const height = Math.round(base.h * scale);

  const tip =
    orientation === 'portrait'
      ? 'Best for TikTok, Reels, and Shorts. Keep the hook in the first 3 seconds.'
      : orientation === 'square'
        ? 'Good for feed posts. Keep subjects centered with safe margins.'
        : 'Best for YouTube landscape. Prefer wider framing and slower pacing.';

  return {
    width,
    height,
    fps: 30,
    aspectLabel: base.aspectLabel,
    recommendedDurationSec: [15, 30, 45, 60],
    tip,
  };
}

export function platformDefaults(platform: ClipPlatform): {
  orientation: ClipOrientation;
  resolution: ClipResolution;
  durationSec: ClipDurationSec;
  tip: string;
} {
  switch (platform) {
    case 'tiktok':
      return {
        orientation: 'portrait',
        resolution: '1080p',
        durationSec: 30,
        tip: 'TikTok: vertical 9:16, 15–35s performs best. Strong hook + captions.',
      };
    case 'reels':
      return {
        orientation: 'portrait',
        resolution: '1080p',
        durationSec: 30,
        tip: 'Reels: vertical 9:16, aim 15–30s. Front-load the payoff.',
      };
    case 'shorts':
      return {
        orientation: 'portrait',
        resolution: '1080p',
        durationSec: 45,
        tip: 'Shorts: vertical 9:16, up to ~60s. Clear title + end screen CTA.',
      };
    default:
      return {
        orientation: 'portrait',
        resolution: '1080p',
        durationSec: 30,
        tip: 'Custom: pick orientation and length for your destination.',
      };
  }
}

export function sceneBudgetForDuration(
  durationSec: number,
  videoCap?: number,
): {
  minScenes: number;
  maxScenes: number;
  targetSeconds: number;
  /** Rough spoken-word budget so TTS stays near the target length. */
  maxNarrationWords: number;
  /** Cap Hailuo VIDEO jobs. Hook + one payoff, or three on longer shorts. */
  maxVideoScenes: number;
} {
  const base =
    durationSec <= 15
      ? {
          minScenes: 3,
          maxScenes: 4,
          targetSeconds: 15,
          maxNarrationWords: 40,
        }
      : durationSec <= 30
        ? {
            minScenes: 4,
            maxScenes: 6,
            targetSeconds: 30,
            maxNarrationWords: 75,
          }
        : durationSec <= 45
          ? {
              minScenes: 5,
              maxScenes: 7,
              targetSeconds: 45,
              maxNarrationWords: 110,
            }
          : {
              minScenes: 6,
              maxScenes: 8,
              targetSeconds: 60,
              maxNarrationWords: 150,
            };
  const maxVideoScenes =
    videoCap !== undefined
      ? Math.max(0, videoCap)
      : durationSec >= 45
        ? 3
        : 2;
  return { ...base, maxVideoScenes };
}

export type ResolvedMotion = 'stills' | 'fake' | 'semi' | 'full';

/** Hailuo VIDEO scenes allowed for this motion mode. */
export function videoSceneCap(
  durationSec: number,
  motion: ResolvedMotion,
): number {
  if (motion === 'stills' || motion === 'fake') return 0;
  if (motion === 'full') {
    return sceneBudgetForDuration(durationSec).maxScenes;
  }
  // semi = hook + payoff (+ optional mid on longer clips)
  return durationSec >= 45 ? 3 : 2;
}

const ANIMATION_HINT =
  /\b(animat\w*|cartoon|anime|flat[ -]?2d|2d|3d|dibujo\w*|animad\w*|animaci\w*|caricatura\w*|olas?|waves?|agua|water motion)\b/i;
const FULL_ANIMATION_HINT =
  /\b(full[ -]?animat\w*|todas? las escenas|every scene|todo animad\w*)\b/i;
const FAKE_ANIMATION_HINT =
  /\b(fake[ -]?animat\w*|parallax|2\.5d|capas|layer(?:ed)? motion|ken burns)\b/i;
const SEMI_ANIMATION_HINT =
  /\b(semi[ -]?animat\w*|hook and (payoff|final)|hailuo)\b/i;

/** Normalize stored / legacy motion values. */
export function resolveMotion(
  motion: ClipMotion | string | null | undefined,
  prompt: string,
): ResolvedMotion {
  // Legacy: old "animated" = Hailuo hook+final; old "semi" meant fake layers
  // before the rename — callers that still pass "animated" map to semi.
  if (motion === 'animated') return 'semi';
  if (
    motion === 'stills' ||
    motion === 'fake' ||
    motion === 'semi' ||
    motion === 'full'
  ) {
    return motion;
  }
  if (FULL_ANIMATION_HINT.test(prompt)) return 'full';
  if (FAKE_ANIMATION_HINT.test(prompt)) return 'fake';
  if (SEMI_ANIMATION_HINT.test(prompt)) return 'semi';
  return ANIMATION_HINT.test(prompt) ? 'semi' : 'stills';
}

/** Append style + motion so Claude / the pipeline share one creative brief. */
export function buildCreativeBrief(input: {
  prompt: string;
  visualStyle?: VisualStyle | string | null;
  motion?: ClipMotion | string | null;
  durationSec?: number;
}): string {
  const prompt = input.prompt.trim();
  const visualStyle = (input.visualStyle as VisualStyle) || 'ugc';
  const style = VISUAL_STYLE_LOCK[visualStyle] ?? VISUAL_STYLE_LOCK.ugc;
  const resolved = resolveMotion(input.motion, prompt);
  const durationSec = input.durationSec || 30;
  const cap = videoSceneCap(durationSec, resolved);
  const motionLine =
    resolved === 'stills'
      ? 'Motion: stills (Ken Burns zoom only). Every scene type IMAGE. No Hailuo.'
      : resolved === 'fake'
        ? 'Motion: fake-animated (canvas cartoon). Every scene type IMAGE. No Leonardo, no Hailuo. Each scene MUST include cartoon: { setting: kitchen|office|gym|city|studio|classroom|space|outdoor|bunker|beach|ocean|desert|quick_sand|generic, action: idle|walk|talk|point|react|work|celebrate|panic|sink|wave, props?: [phone|sign|bag|laptop|tool|food|door|debris] }. setting/action MUST match the USER TOPIC (do NOT default to beach/island). Vary setting AND action across scenes. Flat 2D caricature; same character every scene.'
        : resolved === 'full'
          ? `Motion: full animated. Every scene type VIDEO (up to ${cap} scenes) via Hailuo.`
          : `Motion: semi-animated. At most ${cap} VIDEO scenes via Hailuo (hook + payoff); middle scenes IMAGE with Ken Burns.`;

  return `${prompt}

Creative brief (follow exactly):
- Visual style: ${style.label}. ${style.suffix}. ${style.avoid}
- ${motionLine}`;
}

export function leonardoSize(orientation: ClipOrientation = 'portrait'): {
  width: number;
  height: number;
} {
  if (orientation === 'landscape') return { width: 1344, height: 768 };
  if (orientation === 'square') return { width: 1024, height: 1024 };
  return { width: 768, height: 1344 };
}

export function usesCaptionSafeZone(
  platform: ClipPlatform | string | null | undefined,
): boolean {
  return platform === 'tiktok' || platform === 'reels';
}

export const VISUAL_STYLE_LOCK: Record<
  VisualStyle,
  { label: string; detail: string; suffix: string; avoid: string }
> = {
  ugc: {
    label: 'UGC',
    detail: 'Phone selfie / creator look, casual room',
    suffix:
      'smartphone vertical frame, natural window light, one real person, casual room, authentic social video',
    avoid: 'no on-screen text, no watermark, no logo, no collage',
  },
  cinematic: {
    label: 'Cinematic',
    detail: 'Film look, shallow depth, dramatic light',
    suffix:
      'cinematic frame, shallow depth of field, motivated lighting, subtle film grain, one subject',
    avoid: 'no on-screen text, no watermark, no split screen',
  },
  'flat-2d': {
    label: '2D plano',
    detail: 'Flat illustration, bold shapes, limited palette',
    suffix:
      'flat 2D illustration, same character design, bold shapes, limited palette, clean background',
    avoid: 'no on-screen text, no photorealism, no 3D, no watermark',
  },
  anime: {
    label: 'Anime',
    detail: 'Anime key visual, cel shading, clean lines',
    suffix:
      'anime key visual, same character, clean line art, cel shading, simple background',
    avoid: 'no on-screen text, no photorealism, no watermark, no extra characters',
  },
  documentary: {
    label: 'Documental',
    detail: 'Real b-roll, observational camera',
    suffix:
      'documentary b-roll, natural light, real location, one clear subject, observational camera',
    avoid: 'no on-screen text, no watermark, no logos, no glamour lighting',
  },
};

/**
 * Keep at most `maxVideoScenes` VIDEO slots (first N); demote the rest to IMAGE.
 */
export function demoteExcessVideoScenes<
  T extends { type: string },
>(scenes: T[], maxVideoScenes: number): T[] {
  let videos = 0;
  return scenes.map((scene) => {
    if (scene.type !== 'VIDEO') return scene;
    videos += 1;
    if (videos <= maxVideoScenes) return scene;
    return { ...scene, type: 'IMAGE' };
  });
}

/**
 * Set each scene's duration from the spoken words of its narration so cuts
 * land with the dialogue, then rescale so the sum matches the audio length.
 */
export function alignSceneDurationsToSpeech<
  T extends { narration?: string; durationSec: number },
>(
  scenes: T[],
  words: Array<{ start: number; end: number }>,
  fallbackSeconds: number,
): T[] {
  if (!scenes.length) return scenes;
  const lastWord = words.length ? words[words.length - 1] : undefined;
  const audioEnd = Math.max(lastWord?.end ?? 0, fallbackSeconds, 4);
  const counts = scenes.map((scene) => {
    const n = (scene.narration ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    return Math.max(1, n);
  });

  let cursor = 0;
  const spans = counts.map((count) => {
    const slice = words.slice(cursor, cursor + count);
    cursor += count;
    if (slice.length > 0) {
      const start = slice[0].start;
      const end = slice[slice.length - 1].end;
      return Math.max(1.2, end - start);
    }
    return audioEnd / scenes.length;
  });

  return fitSceneDurations(
    scenes.map((scene, index) => ({
      ...scene,
      durationSec: spans[index],
    })),
    audioEnd,
  );
}

/**
 * Plan a timeline from narration word counts so the sum matches the
 * target length. Used when reviewing a script before TTS.
 */
export function planScriptTimeline<
  T extends { narration?: string; durationSec: number },
>(
  scenes: T[],
  targetSeconds: number,
): Array<T & { startSec: number; endSec: number; durationSec: number }> {
  if (!scenes.length) return [];
  const weighted = scenes.map((scene) => {
    const words = (scene.narration ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    return {
      ...scene,
      durationSec: Math.max(1.5, words || 1),
    };
  });
  const fitted = fitSceneDurations(weighted, targetSeconds);
  let cursor = 0;
  return fitted.map((scene) => {
    const startSec = Math.round(cursor * 100) / 100;
    const endSec = Math.round((cursor + scene.durationSec) * 100) / 100;
    cursor = endSec;
    return { ...scene, startSec, endSec, durationSec: scene.durationSec };
  });
}

/**
 * Proportionally rescale scene durations so they sum to `targetSeconds`
 * (within ±0.05s). Keeps each scene ≥ 1.5s.
 */
export function fitSceneDurations<T extends { durationSec: number }>(
  scenes: T[],
  targetSeconds: number,
): T[] {
  if (!scenes.length) return scenes;
  const target = Math.max(targetSeconds, scenes.length * 1.5);
  const total = scenes.reduce((sum, s) => sum + s.durationSec, 0) || scenes.length;
  const scaled = scenes.map((scene) => ({
    ...scene,
    durationSec: Math.max(1.5, (scene.durationSec / total) * target),
  }));
  const scaledTotal = scaled.reduce((sum, s) => sum + s.durationSec, 0);
  const drift = target - scaledTotal;
  scaled[scaled.length - 1] = {
    ...scaled[scaled.length - 1],
    durationSec: Math.max(
      1.5,
      scaled[scaled.length - 1].durationSec + drift,
    ),
  };
  return scaled.map((scene) => ({
    ...scene,
    durationSec: Math.round(scene.durationSec * 100) / 100,
  }));
}
