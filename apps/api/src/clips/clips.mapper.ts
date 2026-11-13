import type { ClipJob, ClipVariant, MediaAsset } from '@prisma/client';
import {
  normalizeCaptionStyle,
  type ClipCostBreakdown,
  type ClipJobDto,
  type ClipVariantDto,
  type GeneratedScript,
  type MediaAssetDto,
  type WordTimestamp,
} from '@piwu/shared';

export function mapAsset(asset: MediaAsset): MediaAssetDto {
  return {
    id: asset.id,
    clipJobId: asset.clipJobId,
    sceneIndex: asset.sceneIndex,
    prompt: asset.prompt,
    type: asset.type,
    url: asset.url,
    durationSec: asset.durationSec,
    createdAt: asset.createdAt.toISOString(),
  };
}

export function mapVariant(variant: ClipVariant): ClipVariantDto {
  return {
    id: variant.id,
    clipJobId: variant.clipJobId,
    index: variant.index,
    title: variant.title,
    score: variant.score,
    reason: variant.reason,
    startSec: variant.startSec,
    endSec: variant.endSec,
    outputVideoUrl: variant.outputVideoUrl,
    status: variant.status as ClipVariantDto['status'],
  };
}

function fallbackCoverUrl(
  job: ClipJob & { assets?: MediaAsset[] },
): string | null {
  if (job.coverUrl) return job.coverUrl;
  const still = [...(job.assets ?? [])]
    .sort((a, b) => a.sceneIndex - b.sceneIndex)
    .find(
      (asset) =>
        asset.type === 'IMAGE' ||
        /\.(png|jpe?g|webp)(\?|$)/i.test(asset.url),
    );
  return still?.url ?? null;
}

export function mapClipJob(
  job: ClipJob & { assets?: MediaAsset[]; variants?: ClipVariant[] },
): ClipJobDto {
  return {
    id: job.id,
    userId: job.userId,
    prompt: job.prompt,
    status: job.status as ClipJobDto['status'],
    progress: job.progress,
    title: job.title,
    audioScript: job.audioScript,
    audioUrl: job.audioUrl,
    timestampsJson: (job.timestampsJson as WordTimestamp[] | null) ?? null,
    outputVideoUrl: job.outputVideoUrl,
    coverUrl: fallbackCoverUrl(job),
    errorMessage: job.errorMessage,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    stylePreset: job.stylePreset as ClipJobDto['stylePreset'],
    durationSec: job.durationSec,
    orientation: job.orientation as ClipJobDto['orientation'],
    resolution: job.resolution as ClipJobDto['resolution'],
    platform: job.platform as ClipJobDto['platform'],
    language: job.language as ClipJobDto['language'],
    sourceType: job.sourceType as ClipJobDto['sourceType'],
    sourceUrl: job.sourceUrl,
    captionStyle: normalizeCaptionStyle(job.captionStyle),
    clipCount: job.clipCount,
    visualStyle: job.visualStyle as ClipJobDto['visualStyle'],
    motion: job.motion as ClipJobDto['motion'],
    assets: job.assets?.map(mapAsset),
    variants: job.variants?.map(mapVariant),
    scriptJson: (job.scriptJson as GeneratedScript | null) ?? null,
    referenceUrls: job.referenceUrls ?? [],
    costJson: (job.costJson as ClipCostBreakdown | null) ?? null,
  };
}
