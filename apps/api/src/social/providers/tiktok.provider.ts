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

const API = 'https://open.tiktokapis.com/v2';
const SCOPES = ['user.info.basic', 'user.info.profile', 'video.publish', 'video.upload'];

type TikTokEnvelope<T> = { data: T; error?: { code: string; message: string } };

/**
 * TikTok via the Content Posting API (Direct Post, FILE_UPLOAD — no domain
 * verification needed). Apps that haven't passed TikTok's audit can only post
 * with SELF_ONLY privacy; we read the creator's allowed levels and pick the
 * closest one.
 */
export class TikTokProvider implements SocialProviderAdapter {
  readonly id = 'tiktok' as const;
  readonly requiredEnv = ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'];
  readonly notes = [
    'Requiere una app en TikTok for Developers con Login Kit y Content Posting API (Direct Post).',
    'Hasta que TikTok audite la app, los videos solo se publican como privados (SELF_ONLY).',
  ];

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  private get clientKey() {
    return this.config.get('TIKTOK_CLIENT_KEY', { infer: true });
  }
  private get clientSecret() {
    return this.config.get('TIKTOK_CLIENT_SECRET', { infer: true });
  }

  isConfigured(): boolean {
    return Boolean(this.clientKey && this.clientSecret);
  }

  authUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_key: this.clientKey,
      scope: SCOPES.join(','),
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
  }

  private async token(body: Record<string, string>, label: string): Promise<ProviderTokens> {
    const json = await fetchJson<{
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    }>(
      `${API}/oauth/token/`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({ client_key: this.clientKey, client_secret: this.clientSecret, ...body }),
      },
      label,
    );
    if (!json.access_token) throw new Error(`${label}: ${json.error_description ?? json.error ?? 'sin token'}`);
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? null,
      expiresAt: new Date(Date.now() + (json.expires_in ?? 86400) * 1000),
      scopes: (json.scope ?? SCOPES.join(',')).split(','),
    };
  }

  exchangeCode(code: string, redirectUri: string): Promise<ProviderTokens> {
    return this.token({ code, grant_type: 'authorization_code', redirect_uri: redirectUri }, 'TikTok token');
  }

  async refresh(tokens: ProviderTokens): Promise<ProviderTokens> {
    if (!tokens.refreshToken) throw new Error('TikTok: no refresh token, vuelve a vincular la cuenta');
    return this.token({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken }, 'TikTok refresh');
  }

  async profile(tokens: ProviderTokens): Promise<ProviderProfile> {
    const json = await fetchJson<
      TikTokEnvelope<{ user: { open_id: string; display_name: string; avatar_url?: string; username?: string } }>
    >(
      `${API}/user/info/?fields=open_id,display_name,avatar_url,username`,
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
      'TikTok profile',
    );
    const user = json.data.user;
    return {
      externalId: user.open_id,
      displayName: user.username ? `@${user.username}` : user.display_name,
      avatarUrl: user.avatar_url ?? null,
      meta: { username: user.username ?? null },
    };
  }

  private async post<T>(path: string, token: string, body: unknown, label: string): Promise<T> {
    const json = await fetchJson<TikTokEnvelope<T>>(
      `${API}${path}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(body),
      },
      label,
    );
    if (json.error && json.error.code !== 'ok') throw new Error(`${label}: ${json.error.message || json.error.code}`);
    return json.data;
  }

  async publish(tokens: ProviderTokens, profile: ProviderProfile, input: PublishInput): Promise<PublishResult> {
    // 1. What this creator / app may use right now.
    const creator = await this.post<{ privacy_level_options: string[]; max_video_post_duration_sec?: number }>(
      '/post/publish/creator_info/query/',
      tokens.accessToken,
      {},
      'TikTok creator info',
    );
    const options = creator.privacy_level_options ?? ['SELF_ONLY'];
    const wanted =
      input.privacy === 'public'
        ? ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY']
        : ['SELF_ONLY'];
    const privacy = wanted.find((level) => options.includes(level)) ?? options[0];

    // 2. Init a single-chunk file upload.
    const size = input.video.length;
    const init = await this.post<{ publish_id: string; upload_url: string }>(
      '/post/publish/video/init/',
      tokens.accessToken,
      {
        post_info: {
          title: input.caption.slice(0, 2200),
          privacy_level: privacy,
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 },
      },
      'TikTok init',
    );

    // 3. Upload the bytes.
    const upload = await fetch(init.upload_url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(size),
        'Content-Range': `bytes 0-${size - 1}/${size}`,
      },
      body: new Uint8Array(input.video),
    });
    if (!upload.ok) throw new Error(`TikTok upload ${upload.status}: ${(await upload.text()).slice(0, 300)}`);

    // 4. Wait for TikTok to process / publish (up to ~4 min).
    for (let attempt = 0; attempt < 48; attempt++) {
      await sleep(timing.pollMs);
      const status = await this.post<{
        status: string;
        fail_reason?: string;
        publicaly_available_post_id?: Array<string | number>;
      }>('/post/publish/status/fetch/', tokens.accessToken, { publish_id: init.publish_id }, 'TikTok status');
      if (status.status === 'PUBLISH_COMPLETE') {
        const postId = status.publicaly_available_post_id?.[0];
        const username = (profile.meta?.username as string | null) ?? null;
        return {
          externalPostId: postId ? String(postId) : init.publish_id,
          externalUrl: postId && username ? `https://www.tiktok.com/@${username}/video/${postId}` : null,
        };
      }
      if (status.status === 'FAILED') throw new Error(`TikTok rechazó el video: ${status.fail_reason ?? 'sin motivo'}`);
    }
    // Still processing: TikTok will finish on its side.
    return { externalPostId: init.publish_id, externalUrl: null };
  }
}
