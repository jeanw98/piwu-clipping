import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { createCanvas, isUsableMedia } from './placeholder-image';
import type { EnvConfig } from '../config/env.schema';

@Injectable()
export class LeonardoService {
  private readonly logger = new Logger(LeonardoService.name);
  private readonly openai: OpenAI;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    this.openai = new OpenAI({
      apiKey: this.config.get('OPENAI_API_KEY', { infer: true }),
    });
  }

  async generateImage(
    prompt: string,
    size: { width: number; height: number } = { width: 768, height: 1344 },
  ): Promise<Buffer> {
    const apiKey = this.config.get('LEONARDO_API_KEY', { infer: true });

    try {
      const createRes = await fetch(
        'https://cloud.leonardo.ai/api/rest/v1/generations',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt,
            modelId: '7b592283-e8a7-4c5a-9ba6-d18c31f258b9', // Lucid Origin
            width: size.width,
            height: size.height,
            num_images: 1,
          }),
        },
      );

      if (!createRes.ok) {
        const body = await createRes.text();
        throw new Error(`Leonardo create ${createRes.status}: ${body}`);
      }

      const createJson = (await createRes.json()) as {
        sdGenerationJob?: { generationId?: string };
      };
      const generationId = createJson.sdGenerationJob?.generationId;
      if (!generationId) {
        throw new Error('Missing Leonardo generationId');
      }

      for (let attempt = 0; attempt < 20; attempt++) {
        await this.sleep(2000);
        const pollRes = await fetch(
          `https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
          },
        );
        if (!pollRes.ok) {
          continue;
        }
        const pollJson = (await pollRes.json()) as {
          generations_by_pk?: {
            status?: string;
            generated_images?: Array<{ url: string }>;
          };
        };
        const generation = pollJson.generations_by_pk;
        if (
          generation?.status === 'COMPLETE' &&
          generation.generated_images?.[0]?.url
        ) {
          const imageRes = await fetch(generation.generated_images[0].url);
          if (!imageRes.ok) {
            throw new Error('Failed to download Leonardo image');
          }
          return Buffer.from(await imageRes.arrayBuffer());
        }
        if (generation?.status === 'FAILED') {
          throw new Error('Leonardo generation failed');
        }
      }

      throw new Error('Leonardo generation timed out');
    } catch (error) {
      this.logger.warn(
        `Leonardo failed, trying OpenAI images: ${(error as Error).message}`,
      );
      return this.openaiImageFallback(prompt, size);
    }
  }

  private async openaiImageFallback(
    prompt: string,
    size: { width: number; height: number },
  ): Promise<Buffer> {
    const safePrompt = `${prompt}`.slice(0, 900);
    const gptSize =
      size.height > size.width
        ? '1024x1536'
        : size.width > size.height
          ? '1536x1024'
          : '1024x1024';
    try {
      const result = await this.openai.images.generate({
        model: 'gpt-image-1-mini',
        prompt: safePrompt,
        size: gptSize,
        quality: 'low',
        n: 1,
      });
      const image = result.data?.[0];
      const buffer = image?.b64_json
        ? Buffer.from(image.b64_json, 'base64')
        : image?.url
          ? Buffer.from(await (await fetch(image.url)).arrayBuffer())
          : null;
      if (!buffer || !isUsableMedia(buffer)) {
        throw new Error('OpenAI image missing data');
      }
      this.logger.log('OpenAI image generated as Leonardo fallback');
      return buffer;
    } catch (error) {
      this.logger.warn(
        `OpenAI image fallback failed, using prompt-only visual: ${(error as Error).message}`,
      );
      return createCanvas(prompt);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
