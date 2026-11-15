import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.schema';
import {
  fetchJson,
  form,
  sleep,
  timing,
  type ProviderProfile,
  type ProviderTokens,
  type PublishInput,
  type PublishResult,
  type SocialProviderAdapter,
} from './types';

const GRAPH = 'https://graph.instagram.com/v21.0';
const SCOPES = ['instagram_business_basic', 'instagram_business_content_publish'];

/**
 * Instagram Reels via the Instagram API with Instagram Login
 * (professional — Business or Creator — accounts). Meta downloads the video
 * from a public URL, then we publish the processed container.
 */
export class InstagramProvider implements SocialProviderAdapter {
  readonly id = 'instagram' as const;
  readonly requiredEnv = ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'];
  readonly notes = [
    'Solo cuentas profesionales de Instagram (Empresa o Creador).',
    'Requiere una app de Meta con "Instagram API with Instagram Login"; fuera del modo desarrollo necesita revisión del permiso instagram_business_content_publish.',
    'El video debe estar en una URL pública (S3): con almacenamiento local no funciona.',
    'Límite de Meta: 50 publicaciones por cuenta cada 24 h.',
  ];

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  private get appId() {
    return this.config.get('INSTAGRAM_APP_ID', { infer: true });
  }
  private get appSecret() {
    return this.config.get('INSTAGRAM_APP_SECRET', { infer: true });
  }

  isConfigured(): boolean {
    return Boolean(this.appId && this.appSecret);
  }

  authUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(','),
      state,
    });
    return `https://www.instagram.com/oauth/authorize?${params}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<ProviderTokens> {
    // Short-lived token (1 h)…
    const raw = await fetchJson<
      | { access_token: string; user_id?: string | number; permissions?: string[] | string }
      | { data: Array<{ access_token: string; user_id?: string | number; permissions?: string }> }
    >(
      'https://api.instagram.com/oauth/access_token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({
          client_id: this.appId,
          client_secret: this.appSecret,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          code: code.replace(/#_$/, ''),
        }),
      },
      'Instagram token',
    );
    const short = 'data' in raw ? raw.data[0] : raw;
    // …exchanged for a long-lived token (60 days).
    const long = await fetchJson<{ access_token: string; expires_in: number }>(
      `https://graph.instagram.com/access_token?${new URLSearchParams({
        grant_type: 'ig_exchange_token',
        client_secret: this.appSecret,
        access_token: short.access_token,
      })}`,
      {},
      'Instagram long-lived token',
    );
    const permissions = short.permissions;
    return {
      accessToken: long.access_token,
      refreshToken: null,
      expiresAt: new Date(Date.now() + long.expires_in * 1000),
      scopes: Array.isArray(permissions) ? permissions : String(permissions ?? SCOPES.join(',')).split(','),
    };
  }

  /** Long-lived tokens are refreshed in place (valid ≥ 24 h, not expired). */
  async refresh(tokens: ProviderTokens): Promise<ProviderTokens> {
    const json = await fetchJson<{ access_token: string; expires_in: number }>(
      `https://graph.instagram.com/refresh_access_token?${new URLSearchParams({
        grant_type: 'ig_refresh_token',
        access_token: tokens.accessToken,
      })}`,
      {},
      'Instagram refresh',
    );
    return {
      ...tokens,
      accessToken: json.access_token,
      expiresAt: new Date(Date.now() + json.expires_in * 1000),
    };
  }

  async profile(tokens: ProviderTokens): Promise<ProviderProfile> {
    const json = await fetchJson<{
      id?: string;
      user_id?: string;
      username: string;
      profile_picture_url?: string;
      account_type?: string;
    }>(
      `${GRAPH}/me?${new URLSearchParams({
        fields: 'user_id,username,profile_picture_url,account_type',
        access_token: tokens.accessToken,
      })}`,
      {},
      'Instagram profile',
    );
    const igUserId = String(json.user_id ?? json.id ?? '');
    if (!igUserId) throw new Error('Instagram no devolvió el id de la cuenta');
    return {
      externalId: igUserId,
      displayName: `@${json.username}`,
      avatarUrl: json.profile_picture_url ?? null,
      meta: { username: json.username, accountType: json.account_type ?? null },
    };
  }

  async publish(tokens: ProviderTokens, profile: ProviderProfile, input: PublishInput): Promise<PublishResult> {
    if (!/^https:\/\//.test(input.videoUrl)) {
      throw new Error('Instagram necesita una URL pública https del video (configura STORAGE_DRIVER=s3)');
    }
    const auth = { access_token: tokens.accessToken };
    // 1. Create the Reel container (Meta downloads the video).
    const container = await fetchJson<{ id: string }>(
      `${GRAPH}/${profile.externalId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({
          media_type: 'REELS',
          video_url: input.videoUrl,
          caption: input.caption.slice(0, 2200),
          share_to_feed: 'true',
          ...auth,
        }),
      },
      'Instagram container',
    );
    // 2. Wait until Meta finishes processing (up to ~5 min).
    for (let attempt = 0; attempt < 60; attempt++) {
      await sleep(timing.pollMs);
      const status = await fetchJson<{ status_code?: string; status?: string }>(
        `${GRAPH}/${container.id}?${new URLSearchParams({ fields: 'status_code,status', ...auth })}`,
        {},
        'Instagram status',
      );
      if (status.status_code === 'FINISHED') break;
      if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
        throw new Error(`Instagram no pudo procesar el video: ${status.status ?? status.status_code}`);
      }
      if (attempt === 59) throw new Error('Instagram tardó demasiado en procesar el video');
    }
    // 3. Publish.
    const media = await fetchJson<{ id: string }>(
      `${GRAPH}/${profile.externalId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({ creation_id: container.id, ...auth }),
      },
      'Instagram publish',
    );
    const link = await fetchJson<{ permalink?: string }>(
      `${GRAPH}/${media.id}?${new URLSearchParams({ fields: 'permalink', ...auth })}`,
      {},
      'Instagram permalink',
    ).catch(() => ({ permalink: undefined }));
    return { externalPostId: media.id, externalUrl: link.permalink ?? null };
  }
}
