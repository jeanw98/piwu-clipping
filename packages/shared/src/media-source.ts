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
export function isLinkClipSource(
  sourceType: string | null | undefined,
): boolean {
  return sourceType === 'youtube' || sourceType === 'instagram';
}

export function socialSourceLabel(
  sourceType: string | null | undefined,
): string {
  if (sourceType === 'instagram') return 'Instagram';
  if (sourceType === 'youtube') return 'YouTube';
  return 'Link';
}
