/** Social publishing: linked accounts + scheduled posts. */

export const SOCIAL_PROVIDERS = ['youtube', 'instagram', 'tiktok'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const SOCIAL_PROVIDER_LABELS: Record<SocialProvider, string> = {
  youtube: 'YouTube Shorts',
  instagram: 'Instagram Reels',
  tiktok: 'TikTok',
};

export interface SocialProviderStatusDto {
  provider: SocialProvider;
  label: string;
  /** Server has the OAuth app credentials + token key configured. */
  configured: boolean;
  /** Env vars still missing (only when not configured). */
  missing: string[];
  /** Platform-side limits worth showing (app review, private-only…). */
  notes: string[];
}

export interface SocialAccountDto {
  id: string;
  provider: SocialProvider;
  displayName: string;
  avatarUrl: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export const POST_STATUSES = ['SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELED'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const POST_PRIVACY = ['public', 'unlisted', 'private'] as const;
export type PostPrivacy = (typeof POST_PRIVACY)[number];

export interface ScheduledPostDto {
  id: string;
  clipJobId: string;
  variantId: string | null;
  socialAccountId: string;
  provider: SocialProvider;
  accountName: string;
  title: string | null;
  caption: string;
  privacy: PostPrivacy;
  scheduledAt: string;
  status: PostStatus;
  attempts: number;
  externalPostId: string | null;
  externalUrl: string | null;
  errorMessage: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface SchedulePostInput {
  clipJobId: string;
  variantId?: string | null;
  accountIds: string[];
  title?: string;
  caption: string;
  privacy?: PostPrivacy;
  /** ISO date; omitted = publish now. */
  scheduledAt?: string | null;
}
