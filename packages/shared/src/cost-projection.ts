/**
 * List prices for monthly cost projection in the dashboard.
 * Hailuo numbers: https://platform.minimax.io/docs/pricing/overview (legacy models).
 */

import {
  resolveMotion,
  sceneBudgetForDuration,
  videoSceneCap,
  type ResolvedMotion,
} from './video-format';

export type MinimaxVideoResolution = '512P' | '768P' | '1080P';

export interface MinimaxPriceTier {
  model: string;
  resolution: MinimaxVideoResolution;
  label: string;
  price6s: number;
  price10s: number | null;
}

/** Official MiniMax legacy video prices (USD per clip). */
export const MINIMAX_PRICE_TIERS: MinimaxPriceTier[] = [
  {
    model: 'MiniMax-Hailuo-2.3-Fast',
    resolution: '768P',
    label: 'Hailuo 2.3 Fast · 768P',
    price6s: 0.19,
    price10s: 0.32,
  },
  {
    model: 'MiniMax-Hailuo-2.3-Fast',
    resolution: '1080P',
    label: 'Hailuo 2.3 Fast · 1080P',
    price6s: 0.33,
    price10s: null,
  },
  {
    model: 'MiniMax-Hailuo-02',
    resolution: '512P',
    label: 'Hailuo 02 · 512P (economy)',
    price6s: 0.1,
    price10s: 0.15,
  },
  {
    model: 'MiniMax-Hailuo-02',
    resolution: '768P',
    label: 'Hailuo 02 · 768P',
    price6s: 0.28,
    price10s: 0.56,
  },
];

export const ECONOMY_MINIMAX_TIER = MINIMAX_PRICE_TIERS.find(
  (tier) => tier.model === 'MiniMax-Hailuo-02' && tier.resolution === '512P',
)!;

/** Approximate list rates for non-Hailuo providers (USD). */
export const PROVIDER_LIST_RATES = {
  leonardoPerStill: 0.02,
  elevenLabsPerChar: 0.0003,
  whisperPerMinute: 0.006,
  claudeScriptPerClip: 0.08,
} as const;

export function resolveMinimaxTier(
  model: string,
  resolution: string,
): { active: MinimaxPriceTier; economy: MinimaxPriceTier } {
  const active =
    MINIMAX_PRICE_TIERS.find(
      (tier) =>
        tier.model === model &&
        tier.resolution === (resolution as MinimaxVideoResolution),
    ) ??
    MINIMAX_PRICE_TIERS.find(
      (tier) =>
        tier.model === 'MiniMax-Hailuo-2.3-Fast' && tier.resolution === '768P',
    )!;
  return { active, economy: ECONOMY_MINIMAX_TIER };
}

export interface CostProjectionInput {
  clipsPerMonth: number;
  durationSec: 15 | 30 | 45 | 60;
  motion: ResolvedMotion;
  videoModel: string;
  videoResolution: string;
}

export interface ProviderCostLine {
  id: string;
  name: string;
  monthlyUsd: number;
  perClipUsd: number;
  note?: string;
}

export interface CostProjectionResult {
  clipsPerMonth: number;
  durationSec: number;
  totalMinutes: number;
  imageScenesPerClip: number;
  videoScenesPerClip: number;
  activeVideo: ProviderCostLine;
  economyVideo: ProviderCostLine;
  others: ProviderCostLine[];
  totalActiveUsd: number;
  totalEconomyUsd: number;
}

function clipVideoCost(
  scenes: number,
  tier: MinimaxPriceTier,
  assume10s = false,
): number {
  if (scenes <= 0) return 0;
  const unit =
    assume10s && tier.price10s != null ? tier.price10s : tier.price6s;
  return scenes * unit;
}

export function projectMonthlyCost(
  input: CostProjectionInput,
): CostProjectionResult {
  const clips = Math.max(0, Math.floor(input.clipsPerMonth));
  const budget = sceneBudgetForDuration(input.durationSec);
  const videoScenesPerClip = videoSceneCap(input.durationSec, input.motion);
  const imageScenesPerClip = budget.maxScenes;
  const { active, economy } = resolveMinimaxTier(
    input.videoModel,
    input.videoResolution,
  );

  const videoActivePerClip = clipVideoCost(videoScenesPerClip, active);
  const videoEconomyPerClip = clipVideoCost(videoScenesPerClip, economy);
  const leonardoPerClip =
    imageScenesPerClip * PROVIDER_LIST_RATES.leonardoPerStill;
  const elevenPerClip =
    budget.maxNarrationWords * 5 * PROVIDER_LIST_RATES.elevenLabsPerChar;
  const whisperPerClip =
    (input.durationSec / 60) * PROVIDER_LIST_RATES.whisperPerMinute;
  const claudePerClip = PROVIDER_LIST_RATES.claudeScriptPerClip;

  const others: ProviderCostLine[] = [
    {
      id: 'leonardo',
      name: 'Leonardo',
      perClipUsd: leonardoPerClip,
      monthlyUsd: leonardoPerClip * clips,
      note:
        input.motion === 'stills_dynamic'
          ? 'Stills v2 · one still per scene'
          : 'Approx. per still',
    },
    {
      id: 'elevenlabs',
      name: 'ElevenLabs',
      perClipUsd: elevenPerClip,
      monthlyUsd: elevenPerClip * clips,
      note: 'Approx. from narration budget',
    },
    {
      id: 'whisper',
      name: 'Whisper',
      perClipUsd: whisperPerClip,
      monthlyUsd: whisperPerClip * clips,
      note: 'OpenAI list',
    },
    {
      id: 'anthropic',
      name: 'Claude',
      perClipUsd: claudePerClip,
      monthlyUsd: claudePerClip * clips,
      note: 'Approx. per script',
    },
  ];

  const othersTotal = others.reduce((sum, line) => sum + line.monthlyUsd, 0);
  const activeVideo: ProviderCostLine = {
    id: 'minimax-active',
    name: active.label,
    perClipUsd: videoActivePerClip,
    monthlyUsd: videoActivePerClip * clips,
    note: videoScenesPerClip
      ? `${videoScenesPerClip}× 6s clips/clip · scenes >6s bill 10s`
      : 'No animated scenes',
  };
  const economyVideo: ProviderCostLine = {
    id: 'minimax-economy',
    name: economy.label,
    perClipUsd: videoEconomyPerClip,
    monthlyUsd: videoEconomyPerClip * clips,
    note: 'Economy option',
  };

  return {
    clipsPerMonth: clips,
    durationSec: input.durationSec,
    totalMinutes: (clips * input.durationSec) / 60,
    imageScenesPerClip,
    videoScenesPerClip,
    activeVideo,
    economyVideo,
    others,
    totalActiveUsd: activeVideo.monthlyUsd + othersTotal,
    totalEconomyUsd: economyVideo.monthlyUsd + othersTotal,
  };
}

export interface ClipCostLine {
  id: string;
  name: string;
  units: number;
  unitPriceUsd: number;
  totalUsd: number;
  note?: string;
}

export interface ClipCostBreakdown {
  currency: 'USD';
  estimated: true;
  videoModel: string;
  videoResolution: string;
  lines: ClipCostLine[];
  totalUsd: number;
}

export interface ActualClipCostInput {
  sourceType: string;
  durationSec: number;
  audioScript?: string | null;
  videoModel: string;
  videoResolution: string;
  assets: Array<{ type: string; durationSec: number; url?: string }>;
  /** stills / stills_dynamic / semi / full / auto (legacy `fake` accepted) */
  motion?: string;
  /** Used to resolve `auto` motion from prompt keywords. */
  prompt?: string | null;
}

/** Live estimate while configuring a clip (before assets exist). */
export function estimateSetupCost(input: {
  sourceType: 'prompt' | 'youtube' | string;
  durationSec: 15 | 30 | 45 | 60 | number;
  motion: 'auto' | ResolvedMotion | string;
  prompt?: string | null;
  videoModel?: string;
  videoResolution?: string;
  clipCount?: number;
}): ClipCostBreakdown {
  const durationSec = ([15, 30, 45, 60].includes(Number(input.durationSec))
    ? Number(input.durationSec)
    : 30) as 15 | 30 | 45 | 60;
  const videoModel = input.videoModel ?? 'MiniMax-Hailuo-2.3-Fast';
  const videoResolution = input.videoResolution ?? '768P';

  if (input.sourceType === 'youtube' || input.sourceType === 'instagram') {
    const clips = Math.max(1, Math.min(12, Math.floor(input.clipCount ?? 3)));
    const whisper =
      (Math.max(60, durationSec * clips) / 60) *
      PROVIDER_LIST_RATES.whisperPerMinute;
    const claude = PROVIDER_LIST_RATES.claudeScriptPerClip;
    const lines: ClipCostLine[] = [
      {
        id: 'whisper',
        name: 'Whisper',
        units: 1,
        unitPriceUsd: whisper,
        totalUsd: whisper,
        note: 'Source transcription',
      },
      {
        id: 'claude',
        name: 'Claude',
        units: 1,
        unitPriceUsd: claude,
        totalUsd: claude,
        note: `Pick up to ${clips} moments`,
      },
    ];
    const totalUsd = lines.reduce((sum, line) => sum + line.totalUsd, 0);
    return {
      currency: 'USD',
      estimated: true,
      videoModel,
      videoResolution,
      lines,
      totalUsd: Math.round(totalUsd * 10_000) / 10_000,
    };
  }

  const rawMotion = input.motion || 'auto';
  const motion = resolveMotion(rawMotion, input.prompt ?? '');
  const projection = projectMonthlyCost({
    clipsPerMonth: 1,
    durationSec,
    motion,
    videoModel,
    videoResolution,
  });

  const lines: ClipCostLine[] = [
    {
      id: 'minimax',
      name: projection.activeVideo.name,
      units: projection.videoScenesPerClip,
      unitPriceUsd:
        projection.videoScenesPerClip > 0
          ? projection.activeVideo.perClipUsd / projection.videoScenesPerClip
          : 0,
      totalUsd: projection.activeVideo.perClipUsd,
      note:
        rawMotion === 'auto'
          ? `Auto → ${motion}`
          : motion === 'stills_dynamic'
            ? 'Stills v2 · $0 Hailuo · cámara dinámica'
            : projection.activeVideo.note,
    },
    ...projection.others.map((line) => ({
      id: line.id,
      name: line.name,
      units: 1,
      unitPriceUsd: line.perClipUsd,
      totalUsd: line.perClipUsd,
      note: line.note,
    })),
  ];

  if (motion === 'stills_dynamic') {
    lines.push({
      id: 'remotion',
      name: 'Remotion camera',
      units: 1,
      unitPriceUsd: 0,
      totalUsd: 0,
      note: 'Stills v2 dynamic camera · $0 compute',
    });
  }

  const totalUsd = lines.reduce((sum, line) => sum + line.totalUsd, 0);
  return {
    currency: 'USD',
    estimated: true,
    videoModel,
    videoResolution,
    lines,
    totalUsd: Math.round(totalUsd * 10_000) / 10_000,
  };
}

/** Per-clip spend estimate from actual generated assets (list prices). */
export function estimateActualClipCost(
  input: ActualClipCostInput,
): ClipCostBreakdown {
  const { active } = resolveMinimaxTier(
    input.videoModel,
    input.videoResolution,
  );
  const lines: ClipCostLine[] = [];

  if (input.sourceType === 'youtube' || input.sourceType === 'instagram') {
    const whisper =
      (Math.max(1, input.durationSec) / 60) *
      PROVIDER_LIST_RATES.whisperPerMinute;
    lines.push({
      id: 'whisper',
      name: 'Whisper',
      units: 1,
      unitPriceUsd: whisper,
      totalUsd: whisper,
      note: 'Source transcription',
    });
    lines.push({
      id: 'claude',
      name: 'Claude',
      units: 1,
      unitPriceUsd: PROVIDER_LIST_RATES.claudeScriptPerClip,
      totalUsd: PROVIDER_LIST_RATES.claudeScriptPerClip,
      note: 'Viral moment picking',
    });
  } else {
    const stills = input.assets.filter(
      (a) => a.type === 'IMAGE' || a.type === 'image',
    ).length;
    const videos = input.assets.filter(
      (a) => a.type === 'VIDEO' || a.type === 'video',
    );
    const stillsV2 =
      resolveMotion(input.motion ?? 'stills', input.prompt ?? '') ===
      'stills_dynamic';

    if (stills > 0) {
      lines.push({
        id: 'leonardo',
        name: 'Leonardo',
        units: stills,
        unitPriceUsd: PROVIDER_LIST_RATES.leonardoPerStill,
        totalUsd: stills * PROVIDER_LIST_RATES.leonardoPerStill,
        note: stillsV2 ? 'Stills v2 · per-scene stills' : 'Stills generated',
      });
    }

    if (stillsV2) {
      lines.push({
        id: 'minimax',
        name: active.label,
        units: 0,
        unitPriceUsd: 0,
        totalUsd: 0,
        note: 'Skipped · Stills v2',
      });
      lines.push({
        id: 'remotion',
        name: 'Remotion camera',
        units: 1,
        unitPriceUsd: 0,
        totalUsd: 0,
        note: 'Dynamic camera on stills · $0',
      });
    } else {
      let videoTotal = 0;
      let billed6 = 0;
      let billed10 = 0;
      for (const video of videos) {
        const use10s =
          video.durationSec > 6 && active.price10s != null;
        const price = use10s ? active.price10s! : active.price6s;
        videoTotal += price;
        if (use10s) billed10 += 1;
        else billed6 += 1;
      }
      if (videos.length > 0) {
        lines.push({
          id: 'minimax',
          name: active.label,
          units: videos.length,
          unitPriceUsd:
            videos.length > 0 ? videoTotal / videos.length : active.price6s,
          totalUsd: videoTotal,
          note: [
            billed6 ? `${billed6}× 6s` : null,
            billed10 ? `${billed10}× 10s` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        });
      } else {
        lines.push({
          id: 'minimax',
          name: active.label,
          units: 0,
          unitPriceUsd: 0,
          totalUsd: 0,
          note: 'No Hailuo scenes (stills / semi)',
        });
      }
    }

    const chars = (input.audioScript ?? '').length;
    const eleven =
      chars * PROVIDER_LIST_RATES.elevenLabsPerChar;
    lines.push({
      id: 'elevenlabs',
      name: 'ElevenLabs',
      units: chars,
      unitPriceUsd: PROVIDER_LIST_RATES.elevenLabsPerChar,
      totalUsd: eleven,
      note: `${chars} chars`,
    });

    // Prompt clips use ElevenLabs word timestamps — no Whisper.
    lines.push({
      id: 'claude',
      name: 'Claude',
      units: 1,
      unitPriceUsd: PROVIDER_LIST_RATES.claudeScriptPerClip,
      totalUsd: PROVIDER_LIST_RATES.claudeScriptPerClip,
      note: 'Script + creative brief',
    });
  }

  const totalUsd = lines.reduce((sum, line) => sum + line.totalUsd, 0);
  return {
    currency: 'USD',
    estimated: true,
    videoModel: input.videoModel,
    videoResolution: input.videoResolution,
    lines,
    totalUsd: Math.round(totalUsd * 10_000) / 10_000,
  };
}
