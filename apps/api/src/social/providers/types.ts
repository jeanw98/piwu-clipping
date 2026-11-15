import type { PostPrivacy, SocialProvider } from '@piwu/shared';

export interface ProviderTokens {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes: string[];
}

export interface ProviderProfile {
  externalId: string;
  displayName: string;
  avatarUrl?: string | null;
  meta?: Record<string, unknown>;
}

export interface PublishInput {
  /** The MP4 bytes (YouTube / TikTok upload them). */
  video: Buffer;
  /** Publicly fetchable URL of the same MP4 (Instagram pulls from it). */
  videoUrl: string;
  title: string;
  caption: string;
  privacy: PostPrivacy;
}

export interface PublishResult {
  externalPostId: string;
  externalUrl?: string | null;
}

/** One social network. Everything provider-specific lives behind this. */
export interface SocialProviderAdapter {
  readonly id: SocialProvider;
  /** Env vars this provider needs (besides SOCIAL_TOKEN_KEY / PUBLIC_API_URL). */
  readonly requiredEnv: string[];
  /** Platform limits shown in the UI. */
  readonly notes: string[];
  isConfigured(): boolean;
  authUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<ProviderTokens>;
  profile(tokens: ProviderTokens): Promise<ProviderProfile>;
  /** Refresh before expiry; undefined = tokens don't expire / can't refresh. */
  refresh?(tokens: ProviderTokens): Promise<ProviderTokens>;
  publish(tokens: ProviderTokens, profile: ProviderProfile, input: PublishInput): Promise<PublishResult>;
}

/** fetch + JSON with a readable error (provider message included). */
export async function fetchJson<T>(url: string, init: RequestInit = {}, label = 'request'): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const detail =
      (body as { error?: { message?: string } | string; error_description?: string; message?: string })?.error_description ??
      ((body as { error?: { message?: string } })?.error as { message?: string })?.message ??
      (body as { message?: string })?.message ??
      (typeof (body as { error?: unknown })?.error === 'string' ? (body as { error: string }).error : null) ??
      text.slice(0, 300);
    throw new Error(`${label} ${response.status}: ${detail}`);
  }
  return body as T;
}

export const form = (data: Record<string, string>) => new URLSearchParams(data).toString();
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Poll interval for provider processing (tests set it to 0). */
export const timing = { pollMs: 5000 };
