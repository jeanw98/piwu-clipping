import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { updateYtDlp } from './youtube-media';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * YouTube/Instagram change often and old yt-dlp builds stop working.
 * In production, update the binary on boot and once a day (in background).
 */
@Injectable()
export class YtDlpUpdaterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(YtDlpUpdaterService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV !== 'production') return;
    if (!this.config.get('YTDLP_AUTO_UPDATE', { infer: true })) return;
    setTimeout(() => void this.update(), 30_000).unref();
    this.timer = setInterval(() => void this.update(), DAY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async update(): Promise<void> {
    try {
      this.logger.log(`yt-dlp: ${await updateYtDlp()}`);
    } catch (error) {
      this.logger.warn(`yt-dlp update failed: ${(error as Error).message.slice(0, 200)}`);
    }
  }
}
