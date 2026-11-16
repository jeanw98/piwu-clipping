/** YouTube watch / Shorts / youtu.be */
export const youtubeUrlPattern =
  /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)[\w-]{6,}/i;

/** Instagram Reel / Reels / post (public) */
export const instagramUrlPattern =
  /^https?:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p)\/[\w-]+\/?(?:\?.*)?$/i;

export type SocialVideoSource = 'youtube' | 'instagram';

export function detectSocialVideoSource(
  rawUrl: string | null | undefined,
): SocialVideoSource | null {
  const url = (rawUrl ?? '').trim();
  if (!url) return null;
  if (youtubeUrlPattern.test(url)) return 'youtube';
  if (instagramUrlPattern.test(url)) return 'instagram';
  return null;
}

/** True when the job was created from a pasted social URL (not AI prompt). */
/**
 * True when the job clips an existing video (pasted YouTube/Instagram link
 * or an uploaded file) instead of generating one from a prompt.
 */
export function isLinkClipSource(
  sourceType: string | null | undefined,
): boolean {
  return sourceType === 'youtube' || sourceType === 'instagram' || sourceType === 'upload';
}

export function socialSourceLabel(
  sourceType: string | null | undefined,
): string {
  if (sourceType === 'instagram') return 'Instagram';
  if (sourceType === 'youtube') return 'YouTube';
  if (sourceType === 'upload') return 'Archivo';
  return 'Link';
}

/** Result of uploading a source video file (PUT /clips/uploads). */
export interface SourceUploadDto {
  /** Pass as `sourceUrl` with `sourceType: 'upload'`. */
  sourceRef: string;
  filename: string;
  sizeBytes: number;
  durationSec: number;
}

export const uploadSourceRefPattern = /^storage:sources\/[\w-]+\/[\w-]+\.(?:mp4|mov|m4v|webm|mkv)$/i;

export function isUploadSource(sourceType: string | null | undefined): boolean {
  return sourceType === 'upload';
}
