import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ProviderUsageDto, ProviderUsageResponse } from '@piwu/shared';
import type { EnvConfig } from '../config/env.schema';

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);
  private cache: { at: number; value: ProviderUsageResponse } | null = null;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  async getUsage(): Promise<ProviderUsageResponse> {
    if (this.cache && Date.now() - this.cache.at < 60_000) {
      return this.cache.value;
    }
    const providers = await Promise.all([
      this.elevenLabs(),
      this.leonardo(),
      this.minimax(),
      this.openai(),
      this.anthropic(),
    ]);
    const value: ProviderUsageResponse = {
      checkedAt: new Date().toISOString(),
      providers,
      video: {
        model: this.config.get('MINIMAX_VIDEO_MODEL', { infer: true }),
        resolution: this.config.get('MINIMAX_VIDEO_RESOLUTION', {
          infer: true,
        }),
      },
    };
    this.cache = { at: Date.now(), value };
    return value;
  }

  private async elevenLabs(): Promise<ProviderUsageDto> {
    const key = this.config.get('ELEVENLABS_API_KEY', { infer: true });
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
        headers: { 'xi-api-key': key },
      });
      if (!res.ok) {
        return unavailable('elevenlabs', 'ElevenLabs', await errorText(res));
      }
      const data = (await res.json()) as {
        character_count?: number;
        character_limit?: number;
        status?: string;
        tier?: string;
      };
      const used = data.character_count ?? 0;
      const limit = data.character_limit ?? 0;
      const remaining = Math.max(0, limit - used);
      const ratio = limit > 0 ? remaining / limit : 1;
      return {
        id: 'elevenlabs',
        name: 'ElevenLabs',
        status: remaining <= 0 ? 'empty' : ratio < 0.15 ? 'low' : 'ok',
        summary: `${formatNumber(remaining)} characters left`,
        detail: `${formatNumber(used)} / ${formatNumber(limit)} used · ${data.tier ?? 'plan'} · ${data.status ?? 'unknown'}`,
      };
    } catch (error) {
      return unavailable('elevenlabs', 'ElevenLabs', (error as Error).message);
    }
  }

  private async leonardo(): Promise<ProviderUsageDto> {
    const key = this.config.get('LEONARDO_API_KEY', { infer: true });
    try {
      const res = await fetch('https://cloud.leonardo.ai/api/rest/v1/me', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        return unavailable('leonardo', 'Leonardo', await errorText(res));
      }
      const data = (await res.json()) as {
        user_details?: Array<{
          apiCredit?: number;
          subscriptionTokens?: number;
        }>;
      };
      const account = data.user_details?.[0];
      const apiCredit = account?.apiCredit ?? 0;
      const tokens = account?.subscriptionTokens ?? 0;
      const total = apiCredit + tokens;
      return {
        id: 'leonardo',
        name: 'Leonardo',
        status: total <= 0 ? 'empty' : total < 50 ? 'low' : 'ok',
        summary: `${formatNumber(total)} credits left`,
        detail: `${formatNumber(apiCredit)} API credits · ${formatNumber(tokens)} subscription tokens`,
      };
    } catch (error) {
      return unavailable('leonardo', 'Leonardo', (error as Error).message);
    }
  }

  private async minimax(): Promise<ProviderUsageDto> {
    const key = this.config.get('MINIMAX_API_KEY', { infer: true });
    if (!key) {
      return unavailable('minimax', 'MiniMax', 'MINIMAX_API_KEY is not set');
    }
    const model = this.config.get('MINIMAX_VIDEO_MODEL', { infer: true });
    const resolution = this.config.get('MINIMAX_VIDEO_RESOLUTION', {
      infer: true,
    });
    return {
      id: 'minimax',
      name: 'MiniMax',
      status: 'ok',
      summary: `${model} · ${resolution}`,
      detail: 'Hailuo image→video (usage not exposed by API)',
    };
  }

  private async openai(): Promise<ProviderUsageDto> {
    const key = this.config.get('OPENAI_API_KEY', { infer: true });
    const start = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 30;
    try {
      const res = await fetch(
        `https://api.openai.com/v1/organization/costs?start_time=${start}&limit=1`,
        { headers: { Authorization: `Bearer ${key}` } },
      );
      if (!res.ok) {
        return unavailable(
          'openai',
          'OpenAI',
          'Billing is not available with this key. Whisper and images still work.',
        );
      }
      const data = (await res.json()) as {
        data?: Array<{
          results?: Array<{ amount?: { value?: number; currency?: string } }>;
        }>;
      };
      const amount = data.data?.[0]?.results?.[0]?.amount;
      if (!amount?.value && amount?.value !== 0) {
        return unavailable('openai', 'OpenAI', 'No cost rows returned');
      }
      return {
        id: 'openai',
        name: 'OpenAI',
        status: 'ok',
        summary: `${amount.value.toFixed(2)} ${amount.currency ?? 'usd'} this period`,
        detail: 'Organization cost report',
      };
    } catch (error) {
      this.logger.warn(`OpenAI usage check failed: ${(error as Error).message}`);
      return unavailable('openai', 'OpenAI', 'Billing check failed');
    }
  }

  private async anthropic(): Promise<ProviderUsageDto> {
    const key = this.config.get('ANTHROPIC_API_KEY', { infer: true });
    const ending = new Date();
    const starting = new Date(ending.getTime() - 30 * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      starting_at: starting.toISOString(),
      ending_at: ending.toISOString(),
      bucket_width: '1d',
    });
    try {
      const res = await fetch(
        `https://api.anthropic.com/v1/organizations/cost_report?${params}`,
        {
          headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
          },
        },
      );
      if (!res.ok) {
        return unavailable(
          'anthropic',
          'Anthropic',
          'Billing needs an admin key. Script generation still works.',
        );
      }
      const data = (await res.json()) as {
        data?: Array<{
          results?: Array<{ amount?: string; currency?: string }>;
        }>;
      };
      const cents = (data.data ?? []).reduce((sum, bucket) => {
        const value = Number(bucket.results?.[0]?.amount ?? 0);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0);
      return {
        id: 'anthropic',
        name: 'Anthropic',
        status: 'ok',
        summary: `$${(cents / 100).toFixed(2)} last 30 days`,
        detail: 'Organization cost report',
      };
    } catch (error) {
      this.logger.warn(`Anthropic usage check failed: ${(error as Error).message}`);
      return unavailable('anthropic', 'Anthropic', 'Billing check failed');
    }
  }
}

function unavailable(id: string, name: string, detail: string): ProviderUsageDto {
  return {
    id,
    name,
    status: 'unavailable',
    summary: 'Usage hidden',
    detail: detail.slice(0, 180),
  };
}

async function errorText(res: Response): Promise<string> {
  const body = await res.text();
  return body.slice(0, 180) || `HTTP ${res.status}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}
