import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.schema';
import {
  fetchJson,
  form,
  type ProviderProfile,
  type ProviderTokens,
  type PublishInput,
  type PublishResult,
  type SocialProviderAdapter,
} from './types';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

/**
 * YouTube Shorts via YouTube Data API v3.
 * A vertical video ≤ 60 s uploaded with videos.insert is published as a Short.
 */
export class YouTubeProvider implements SocialProviderAdapter {
  readonly id = 'youtube' as const;
  readonly requiredEnv = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
  readonly notes = [
    'Requiere un proyecto de Google Cloud con YouTube Data API v3 y pantalla de consentimiento OAuth.',
    'Mientras el proyecto no pase la auditoría de YouTube, los videos subidos por API quedan en privado.',
    'Cuota diaria por defecto: 10.000 unidades (cada subida usa ~1.600: unas 6 subidas al día).',
  ];

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  private get clientId() {
    return this.config.get('GOOGLE_CLIENT_ID', { infer: true });
  }
  private get clientSecret() {
    return this.config.get('GOOGLE_CLIENT_SECRET', { infer: true });
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  authUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<ProviderTokens> {
    const json = await fetchJson<{
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
    }>(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({
          code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      },
      'Google token',
    );
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? null,
      expiresAt: new Date(Date.now() + json.expires_in * 1000),
      scopes: (json.scope ?? SCOPES.join(' ')).split(' '),
    };
  }

  async refresh(tokens: ProviderTokens): Promise<ProviderTokens> {
    if (!tokens.refreshToken) throw new Error('YouTube: no refresh token, vuelve a vincular la cuenta');
    const json = await fetchJson<{ access_token: string; expires_in: number; scope?: string }>(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: tokens.refreshToken,
          grant_type: 'refresh_token',
        }),
      },
      'Google refresh',
    );
    return {
      accessToken: json.access_token,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(Date.now() + json.expires_in * 1000),
      scopes: json.scope ? json.scope.split(' ') : tokens.scopes,
    };
  }

  async profile(tokens: ProviderTokens): Promise<ProviderProfile> {
    const json = await fetchJson<{
      items?: Array<{ id: string; snippet: { title: string; thumbnails?: { default?: { url: string } } } }>;
    }>(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
      'YouTube channel',
    );
    const channel = json.items?.[0];
    if (!channel) throw new Error('Esta cuenta de Google no tiene un canal de YouTube');
    return {
      externalId: channel.id,
      displayName: channel.snippet.title,
      avatarUrl: channel.snippet.thumbnails?.default?.url ?? null,
    };
  }

  async publish(tokens: ProviderTokens, _profile: ProviderProfile, input: PublishInput): Promise<PublishResult> {
    const shortsTag = ' #Shorts';
    const baseTitle = (input.title || input.caption || 'Short').replace(/\s+/g, ' ').trim();
    const title = (baseTitle.length + shortsTag.length <= 100 ? baseTitle + shortsTag : baseTitle.slice(0, 100)).trim();
    // 1. Start a resumable upload session with the metadata.
    const start = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Length': String(input.video.length),
          'X-Upload-Content-Type': 'video/mp4',
        },
        body: JSON.stringify({
          snippet: {
            title,
            description: input.caption.slice(0, 4900),
            categoryId: '22',
          },
          status: {
            privacyStatus: input.privacy,
            selfDeclaredMadeForKids: false,
          },
        }),
      },
    );
    if (!start.ok) {
      const text = await start.text();
      let detail = text.slice(0, 300);
      try {
        detail = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? detail;
      } catch {
        /* keep raw text */
      }
      throw new Error(`YouTube upload init ${start.status}: ${detail}`);
    }
    const location = start.headers.get('location');
    if (!location) throw new Error('YouTube upload init: missing session URL');
    // 2. Send the bytes in one request.
    const video = await fetchJson<{ id: string }>(
      location,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(input.video.length) },
        body: new Uint8Array(input.video),
      },
      'YouTube upload',
    );
    return { externalPostId: video.id, externalUrl: `https://www.youtube.com/shorts/${video.id}` };
  }
}
