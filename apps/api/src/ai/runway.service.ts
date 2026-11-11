import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCanvas } from './placeholder-image';
import type { EnvConfig } from '../config/env.schema';

interface RunwayTaskResponse {
  id?: string;
  status?: string;
  output?: string[] | string;
  failure?: string;
  failureCode?: string;
}

@Injectable()
export class RunwayService {
  private readonly logger = new Logger(RunwayService.name);
  private readonly baseUrl = 'https://api.dev.runwayml.com/v1';
  private readonly apiVersion = '2024-11-06';
  private creditsExhausted = false;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  async generateVideo(
    prompt: string,
  ): Promise<{ buffer: Buffer; isVideo: boolean }> {
    const apiSecret = this.config.get('RUNWAY_API_SECRET', { infer: true });
    if (!apiSecret || this.creditsExhausted) {
      this.logger.warn(
        this.creditsExhausted
          ? 'Runway credits exhausted; skipping T2V'
          : 'RUNWAY_API_SECRET missing; using image placeholder',
      );
      return { buffer: createCanvas(prompt), isVideo: false };
    }

    try {
      const buffer = await this.createAndDownload(apiSecret, 'text_to_video', {
        promptText: prompt.slice(0, 900),
        model: 'gen4.5',
        ratio: '720:1280',
        duration: 5,
      });
      this.logger.log(`Runway T2V ready (${buffer.length} bytes)`);
      return { buffer, isVideo: true };
    } catch (error) {
      this.logger.warn(
        `Runway T2V failed, using placeholder: ${(error as Error).message}`,
      );
      return { buffer: createCanvas(prompt), isVideo: false };
    }
  }

  /**
   * Animate a Leonardo (or other) still via Runway image_to_video.
   * Uses a data URI so we don't need a publicly fetchable image URL.
   */
  async generateVideoFromImage(
    image: Buffer,
    promptText: string,
    size?: { width: number; height: number },
  ): Promise<{ buffer: Buffer; isVideo: boolean }> {
    const apiSecret = this.config.get('RUNWAY_API_SECRET', { infer: true });
    if (!apiSecret || this.creditsExhausted) {
      this.logger.warn(
        this.creditsExhausted
          ? 'Runway credits exhausted; skipping I2V'
          : 'RUNWAY_API_SECRET missing; skipping I2V',
      );
      return { buffer: createCanvas(promptText), isVideo: false };
    }

    try {
      const mime = this.detectImageMime(image);
      const dataUri = `data:${mime};base64,${image.toString('base64')}`;
      const buffer = await this.createAndDownload(apiSecret, 'image_to_video', {
        promptImage: dataUri,
        promptText: promptText.slice(0, 900),
        model: 'gen4.5',
        ratio: this.ratioFor(size),
        duration: 5,
      });
      this.logger.log(`Runway I2V ready (${buffer.length} bytes)`);
      return { buffer, isVideo: true };
    } catch (error) {
      this.logger.warn(
        `Runway I2V failed: ${(error as Error).message}`,
      );
      return { buffer: Buffer.alloc(0), isVideo: false };
    }
  }

  private ratioFor(size?: { width: number; height: number }): string {
    if (!size || size.height > size.width) return '720:1280';
    if (size.width === size.height) return '960:960';
    return '1280:720';
  }

  private async createAndDownload(
    apiSecret: string,
    endpoint: 'text_to_video' | 'image_to_video',
    body: Record<string, unknown>,
  ): Promise<Buffer> {
    const createRes = await fetch(`${this.baseUrl}/${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiSecret}`,
        'Content-Type': 'application/json',
        'X-Runway-Version': this.apiVersion,
      },
      body: JSON.stringify(body),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text();
      if (/enough credits/i.test(errBody)) {
        this.creditsExhausted = true;
      }
      throw new Error(`Runway ${endpoint} ${createRes.status}: ${errBody}`);
    }

    const created = (await createRes.json()) as RunwayTaskResponse;
    if (!created.id) {
      throw new Error('Runway response missing task id');
    }

    const outputUrl = await this.pollTask(apiSecret, created.id);
    const videoRes = await fetch(outputUrl);
    if (!videoRes.ok) {
      throw new Error(`Failed downloading Runway video ${videoRes.status}`);
    }
    return Buffer.from(await videoRes.arrayBuffer());
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

  private async pollTask(apiSecret: string, taskId: string): Promise<string> {
    for (let attempt = 0; attempt < 90; attempt++) {
      await this.sleep(4000);
      const res = await fetch(`${this.baseUrl}/tasks/${taskId}`, {
        headers: {
          Authorization: `Bearer ${apiSecret}`,
          'X-Runway-Version': this.apiVersion,
        },
      });
      if (!res.ok) {
        continue;
      }
      const task = (await res.json()) as RunwayTaskResponse;
      if (task.status === 'SUCCEEDED') {
        const output = Array.isArray(task.output) ? task.output[0] : task.output;
        if (!output) {
          throw new Error('Runway succeeded without output URL');
        }
        return output;
      }
      if (task.status === 'FAILED') {
        throw new Error(task.failure || task.failureCode || 'Runway task failed');
      }
    }
    throw new Error('Runway task timed out');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
