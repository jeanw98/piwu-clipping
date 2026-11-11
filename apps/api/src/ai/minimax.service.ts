import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';

export interface AnimateImageInput {
  image: Buffer;
  prompt: string;
  durationSec: number;
  size?: { width: number; height: number };
}

export interface AnimateImageResult {
  buffer: Buffer;
  isVideo: boolean;
  durationSec: number;
  provider: 'minimax';
}

interface MinimaxBaseResp {
  status_code?: number;
  status_msg?: string;
}

interface MinimaxCreateResponse {
  task_id?: string;
  base_resp?: MinimaxBaseResp;
}

interface MinimaxQueryResponse {
  status?: string;
  file_id?: string;
  base_resp?: MinimaxBaseResp;
}

interface MinimaxFileResponse {
  file?: { download_url?: string; file_id?: string };
  base_resp?: MinimaxBaseResp;
}

@Injectable()
export class MinimaxService {
  private readonly logger = new Logger(MinimaxService.name);
  private readonly baseUrl = 'https://api.minimax.io';

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  async animateImage(input: AnimateImageInput): Promise<AnimateImageResult> {
    const apiKey = this.config.get('MINIMAX_API_KEY', { infer: true });
    const model = this.config.get('MINIMAX_VIDEO_MODEL', { infer: true });
    const resolution = this.config.get('MINIMAX_VIDEO_RESOLUTION', {
      infer: true,
    });
    if (!apiKey) {
      this.logger.warn('MINIMAX_API_KEY missing; skipping I2V');
      return {
        buffer: Buffer.alloc(0),
        isVideo: false,
        durationSec: input.durationSec,
        provider: 'minimax',
      };
    }

    if (input.size) {
      const shortEdge = Math.min(input.size.width, input.size.height);
      if (shortEdge <= 300) {
        this.logger.warn(
          `MiniMax first frame too small (${input.size.width}x${input.size.height}); short edge must be > 300`,
        );
        return {
          buffer: Buffer.alloc(0),
          isVideo: false,
          durationSec: input.durationSec,
          provider: 'minimax',
        };
      }
      if (input.size.height <= input.size.width) {
        this.logger.warn(
          `MiniMax first frame is not vertical (${input.size.width}x${input.size.height})`,
        );
      }
    }

    const duration = this.mapDuration(input.durationSec, resolution);
    const mime = this.detectImageMime(input.image);
    const firstFrame = `data:${mime};base64,${input.image.toString('base64')}`;
    const prompt = input.prompt.replace(/\s+/g, ' ').trim().slice(0, 2000);

    try {
      const taskId = await this.createTaskWithRetry(apiKey, {
        model,
        first_frame_image: firstFrame,
        prompt,
        duration,
        resolution,
        prompt_optimizer: true,
      });
      const fileId = await this.pollTask(apiKey, taskId);
      const buffer = await this.downloadFile(apiKey, fileId);
      this.logger.log(
        `MiniMax I2V ready via ${model} ${resolution} ${duration}s (${buffer.length} bytes)`,
      );
      return {
        buffer,
        isVideo: true,
        durationSec: duration,
        provider: 'minimax',
      };
    } catch (error) {
      this.logger.warn(`MiniMax I2V failed: ${(error as Error).message}`);
      return {
        buffer: Buffer.alloc(0),
        isVideo: false,
        durationSec: input.durationSec,
        provider: 'minimax',
      };
    }
  }

  private mapDuration(
    requested: number,
    resolution: string,
  ): 6 | 10 {
    // 1080P only supports 6s on Hailuo 2.3 / 2.3 Fast / 02.
    if (resolution === '1080P') return 6;
    return requested <= 6 ? 6 : 10;
  }

  private async createTaskWithRetry(
    apiKey: string,
    body: Record<string, unknown>,
  ): Promise<string> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.createTask(apiKey, body);
      } catch (error) {
        lastError = error as Error;
        if (!this.isRetryableCreateError(lastError) || attempt === 2) {
          throw lastError;
        }
        const delayMs = (attempt + 1) * 2000;
        this.logger.warn(
          `MiniMax create retry ${attempt + 1} in ${delayMs}ms: ${lastError.message}`,
        );
        await this.sleep(delayMs);
      }
    }
    throw lastError ?? new Error('MiniMax create failed');
  }

  private isRetryableCreateError(error: Error): boolean {
    return /MiniMax create (429|5\d\d)|network|fetch failed|ECONNRESET|ETIMEDOUT/i.test(
      error.message,
    );
  }

  private async createTask(
    apiKey: string,
    body: Record<string, unknown>,
  ): Promise<string> {
    let createRes: Response;
    try {
      createRes = await fetch(`${this.baseUrl}/v1/video_generation`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new Error(`MiniMax create network: ${(error as Error).message}`);
    }

    const json = (await createRes.json()) as MinimaxCreateResponse;
    this.assertBaseResp(json.base_resp, 'create');
    if (!createRes.ok) {
      throw new Error(
        `MiniMax create ${createRes.status}: ${json.base_resp?.status_msg ?? createRes.statusText}`,
      );
    }
    if (!json.task_id) {
      throw new Error('MiniMax response missing task_id');
    }
    return json.task_id;
  }

  private async pollTask(apiKey: string, taskId: string): Promise<string> {
    const timeoutMs = this.config.get('MINIMAX_VIDEO_TIMEOUT_MS', {
      infer: true,
    });
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      await this.sleep(10_000);
      const res = await fetch(
        `${this.baseUrl}/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      );
      if (!res.ok) {
        continue;
      }
      const json = (await res.json()) as MinimaxQueryResponse;
      this.assertBaseResp(json.base_resp, 'query');
      const status = (json.status ?? '').toLowerCase();
      if (status === 'success' || status === 'succeeded') {
        if (!json.file_id) {
          throw new Error('MiniMax succeeded without file_id');
        }
        return json.file_id;
      }
      if (status === 'fail' || status === 'failed') {
        throw new Error(
          json.base_resp?.status_msg || 'MiniMax task failed (content)',
        );
      }
    }
    throw new Error('MiniMax task timed out');
  }

  private async downloadFile(apiKey: string, fileId: string): Promise<Buffer> {
    const res = await fetch(
      `${this.baseUrl}/v1/files/retrieve?file_id=${encodeURIComponent(fileId)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    );
    const json = (await res.json()) as MinimaxFileResponse;
    this.assertBaseResp(json.base_resp, 'retrieve');
    const downloadUrl = json.file?.download_url;
    if (!downloadUrl) {
      throw new Error('MiniMax retrieve missing download_url');
    }
    const videoRes = await fetch(downloadUrl);
    if (!videoRes.ok) {
      throw new Error(`Failed downloading MiniMax video ${videoRes.status}`);
    }
    return Buffer.from(await videoRes.arrayBuffer());
  }

  private assertBaseResp(
    base: MinimaxBaseResp | undefined,
    step: string,
  ): void {
    if (!base) return;
    if (base.status_code !== undefined && base.status_code !== 0) {
      throw new Error(
        `MiniMax ${step}: ${base.status_msg || `status_code ${base.status_code}`}`,
      );
    }
  }

  private detectImageMime(image: Buffer): string {
    if (image.length >= 3 && image[0] === 0xff && image[1] === 0xd8) {
      return 'image/jpeg';
    }
    if (
      image.length >= 8 &&
      image[0] === 0x89 &&
      image[1] === 0x50 &&
      image[2] === 0x4e &&
      image[3] === 0x47
    ) {
      return 'image/png';
    }
    if (
      image.length >= 12 &&
      image.toString('ascii', 0, 4) === 'RIFF' &&
      image.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return 'image/webp';
    }
    return 'image/png';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
