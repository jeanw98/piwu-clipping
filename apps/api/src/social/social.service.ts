import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import {
  SOCIAL_PROVIDER_LABELS,
  SOCIAL_PROVIDERS,
  type SocialAccountDto,
  type SocialProvider,
  type SocialProviderStatusDto,
} from '@piwu/shared';
import type { SocialAccount } from '@prisma/client';
import type { EnvConfig } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';
import { InstagramProvider } from './providers/instagram.provider';
import { TikTokProvider } from './providers/tiktok.provider';
import type { ProviderProfile, ProviderTokens, SocialProviderAdapter } from './providers/types';
import { YouTubeProvider } from './providers/youtube.provider';
import { decryptToken, encryptToken, parseTokenKey } from './token-crypto';

/** Refresh tokens this long before they expire (Instagram: a week). */
const REFRESH_MARGIN_MS: Record<SocialProvider, number> = {
  youtube: 5 * 60 * 1000,
  tiktok: 10 * 60 * 1000,
  instagram: 7 * 24 * 3600 * 1000,
};

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);
  private readonly providers: Record<SocialProvider, SocialProviderAdapter>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly jwt: JwtService,
  ) {
    this.providers = {
      youtube: new YouTubeProvider(config),
      instagram: new InstagramProvider(config),
      tiktok: new TikTokProvider(config),
    };
  }

  // ---------- configuration ----------

  private get key(): Buffer | null {
    return parseTokenKey(this.config.get('SOCIAL_TOKEN_KEY', { infer: true }));
  }

  private get apiBase(): string {
    return this.config.get('PUBLIC_API_URL', { infer: true }).replace(/\/+$/, '');
  }

  private get webBase(): string {
    return (
      this.config.get('PUBLIC_WEB_URL', { infer: true }) ||
      this.config.get('CORS_ORIGIN', { infer: true }).split(',')[0]
    ).replace(/\/+$/, '');
  }

  redirectUri(provider: SocialProvider): string {
    return `${this.apiBase}/social/${provider}/callback`;
  }

  adapter(provider: string): SocialProviderAdapter {
    if (!SOCIAL_PROVIDERS.includes(provider as SocialProvider)) {
      throw new NotFoundException(`Proveedor desconocido: ${provider}`);
    }
    return this.providers[provider as SocialProvider];
  }

  statuses(): SocialProviderStatusDto[] {
    return SOCIAL_PROVIDERS.map((provider) => {
      const adapter = this.providers[provider];
      const missing = [
        ...adapter.requiredEnv.filter((name) => !this.config.get(name as keyof EnvConfig, { infer: true })),
        ...(this.key ? [] : ['SOCIAL_TOKEN_KEY']),
        ...(this.apiBase ? [] : ['PUBLIC_API_URL']),
      ];
      return {
        provider,
        label: SOCIAL_PROVIDER_LABELS[provider],
        configured: missing.length === 0,
        missing,
        notes: adapter.notes,
      };
    });
  }

  private assertConfigured(provider: SocialProvider) {
    const status = this.statuses().find((s) => s.provider === provider)!;
    if (!status.configured) {
      throw new BadRequestException(
        `${status.label} no está configurado en el servidor. Faltan: ${status.missing.join(', ')}`,
      );
    }
  }

  // ---------- OAuth ----------

  private stateSecret() {
    return `${this.config.get('JWT_SECRET', { infer: true })}:social-oauth`;
  }

  connectUrl(userId: string, provider: SocialProvider): string {
    this.assertConfigured(provider);
    const state = this.jwt.sign(
      { sub: userId, provider, nonce: randomBytes(8).toString('hex') },
      { secret: this.stateSecret(), expiresIn: '15m' },
    );
    return this.adapter(provider).authUrl(state, this.redirectUri(provider));
  }

  /** OAuth callback → store the account → URL to send the browser back to. */
  async handleCallback(
    provider: SocialProvider,
    query: { code?: string; state?: string; error?: string; error_description?: string },
  ): Promise<string> {
    const back = (params: Record<string, string>) =>
      `${this.webBase}/dashboard/accounts?${new URLSearchParams(params)}`;
    if (query.error) {
      return back({ error: query.error_description || query.error, provider });
    }
    try {
      if (!query.code || !query.state) throw new Error('Faltan code/state en la respuesta');
      const payload = this.jwt.verify<{ sub: string; provider: string }>(query.state, {
        secret: this.stateSecret(),
      });
      if (payload.provider !== provider) throw new Error('El state no corresponde al proveedor');
      const adapter = this.adapter(provider);
      const tokens = await adapter.exchangeCode(query.code, this.redirectUri(provider));
      const profile = await adapter.profile(tokens);
      await this.saveAccount(payload.sub, provider, tokens, profile);
      return back({ linked: provider });
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn(`OAuth ${provider} failed: ${message}`);
      const friendly = /jwt|token expired|invalid signature/i.test(message)
        ? 'El enlace de vinculación expiró o no es válido. Inténtalo de nuevo.'
        : message.slice(0, 300);
      return back({ error: friendly, provider });
    }
  }

  private async saveAccount(
    userId: string,
    provider: SocialProvider,
    tokens: ProviderTokens,
    profile: ProviderProfile,
  ) {
    const key = this.key;
    if (!key) throw new Error('SOCIAL_TOKEN_KEY no configurada');
    const data = {
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl ?? null,
      accessTokenEnc: encryptToken(tokens.accessToken, key),
      refreshTokenEnc: tokens.refreshToken ? encryptToken(tokens.refreshToken, key) : null,
      expiresAt: tokens.expiresAt ?? null,
      scopes: tokens.scopes,
      meta: (profile.meta ?? {}) as object,
    };
    await this.prisma.socialAccount.upsert({
      where: { userId_provider_externalId: { userId, provider, externalId: profile.externalId } },
      create: { userId, provider, externalId: profile.externalId, ...data },
      update: data,
    });
  }

  // ---------- accounts ----------

  async list(userId: string): Promise<SocialAccountDto[]> {
    const rows = await this.prisma.socialAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      provider: row.provider as SocialProvider,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.prisma.socialAccount.deleteMany({ where: { id, userId } });
    if (!deleted.count) throw new NotFoundException('Cuenta no encontrada');
  }

  /** Decrypted, refreshed-if-needed tokens + profile for publishing. */
  async credentials(account: SocialAccount): Promise<{ tokens: ProviderTokens; profile: ProviderProfile }> {
    const key = this.key;
    if (!key) throw new Error('SOCIAL_TOKEN_KEY no configurada');
    const provider = account.provider as SocialProvider;
    let tokens: ProviderTokens = {
      accessToken: decryptToken(account.accessTokenEnc, key),
      refreshToken: account.refreshTokenEnc ? decryptToken(account.refreshTokenEnc, key) : null,
      expiresAt: account.expiresAt,
      scopes: account.scopes,
    };
    const adapter = this.adapter(provider);
    const dueAt = (account.expiresAt?.getTime() ?? Infinity) - REFRESH_MARGIN_MS[provider];
    if (adapter.refresh && Date.now() >= dueAt) {
      tokens = await adapter.refresh(tokens);
      await this.prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          accessTokenEnc: encryptToken(tokens.accessToken, key),
          refreshTokenEnc: tokens.refreshToken ? encryptToken(tokens.refreshToken, key) : null,
          expiresAt: tokens.expiresAt ?? null,
          scopes: tokens.scopes,
        },
      });
    }
    return {
      tokens,
      profile: {
        externalId: account.externalId,
        displayName: account.displayName,
        avatarUrl: account.avatarUrl,
        meta: (account.meta as Record<string, unknown> | null) ?? {},
      },
    };
  }
}
