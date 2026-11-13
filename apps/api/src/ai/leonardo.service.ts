import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { createCanvas, isUsableMedia } from './placeholder-image';
import type { EnvConfig } from '../config/env.schema';

/** Lucid Origin — default stills without character guidance. */
const LUCID_ORIGIN_MODEL = '7b592283-e8a7-4c5a-9ba6-d18c31f258b9';
/** Phoenix 1.0 — supports Character Reference (397) + Style Reference (166). */
const PHOENIX_MODEL = 'de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3';

const PREPROCESSOR = {
  phoenixCharacter: 397,
  phoenixStyle: 166,
  lucidStyle: 431,
  lucidContent: 430,
} as const;

export type LeonardoGuidance = {
  /** First reference → Character Reference (identity). */
  characterInitImageId?: string;
  /** Extra references → Style Reference (look / palette). */
  styleInitImageIds?: string[];
};

@Injectable()
export class LeonardoService {
  private readonly logger = new Logger(LeonardoService.name);
  private readonly openai: OpenAI;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    this.openai = new OpenAI({
      apiKey: this.config.get('OPENAI_API_KEY', { infer: true }),
    });
  }

  /**
   * Upload a local buffer to Leonardo as an init image (for Image Guidance).
   * Returns the Leonardo initImageId.
   */
  async uploadInitImage(
    buffer: Buffer,
    mime: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/png',
  ): Promise<string> {
    const apiKey = this.config.get('LEONARDO_API_KEY', { infer: true });
    const extension =
      mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';

    const createRes = await fetch(
      'https://cloud.leonardo.ai/api/rest/v1/init-image',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({ extension }),
      },
    );
    if (!createRes.ok) {
      const body = await createRes.text();
      throw new Error(`Leonardo init-image ${createRes.status}: ${body}`);
    }

    const createJson = (await createRes.json()) as {
      uploadInitImage?: {
        id?: string;
        url?: string;
        fields?: Record<string, string>;
      };
    };
    const upload = createJson.uploadInitImage;
    if (!upload?.id || !upload.url || !upload.fields) {
      throw new Error('Leonardo init-image missing upload payload');
    }

    const form = new FormData();
    for (const [key, value] of Object.entries(upload.fields)) {
      form.append(key, value);
    }
    form.append(
      'file',
      new Blob([new Uint8Array(buffer)], { type: mime }),
      `ref.${extension}`,
    );

    const putRes = await fetch(upload.url, { method: 'POST', body: form });
    if (!putRes.ok && putRes.status !== 204) {
      const body = await putRes.text();
      throw new Error(`Leonardo S3 upload ${putRes.status}: ${body.slice(0, 200)}`);
    }

    this.logger.log(`Leonardo init image uploaded → ${upload.id}`);
    return upload.id;
  }

  async generateImage(
    prompt: string,
    size: { width: number; height: number } = { width: 768, height: 1344 },
    guidance?: LeonardoGuidance,
  ): Promise<Buffer> {
    const apiKey = this.config.get('LEONARDO_API_KEY', { infer: true });
    const hasCharacter = Boolean(guidance?.characterInitImageId);
    const styleIds = (guidance?.styleInitImageIds ?? []).filter(Boolean).slice(0, 3);

    try {
      const controlnets: Array<Record<string, unknown>> = [];
      if (hasCharacter && guidance?.characterInitImageId) {
        controlnets.push({
          initImageId: guidance.characterInitImageId,
          initImageType: 'UPLOADED',
          preprocessorId: PREPROCESSOR.phoenixCharacter,
          strengthType: 'Mid',
        });
        for (const styleId of styleIds) {
          controlnets.push({
            initImageId: styleId,
            initImageType: 'UPLOADED',
            preprocessorId: PREPROCESSOR.phoenixStyle,
            strengthType: 'High',
          });
        }
      }

      const body: Record<string, unknown> = {
        prompt: prompt.slice(0, 1500),
        width: size.width,
        height: size.height,
        num_images: 1,
      };

      if (controlnets.length) {
        // Phoenix supports Character Reference; Lucid Origin does not.
        body.modelId = PHOENIX_MODEL;
        body.controlnets = controlnets;
        this.logger.log(
          `Leonardo Phoenix + guidance (character=${hasCharacter}, styles=${styleIds.length})`,
        );
      } else {
        body.modelId = LUCID_ORIGIN_MODEL;
        body.contrast = 3.5;
      }

      const createRes = await fetch(
        'https://cloud.leonardo.ai/api/rest/v1/generations',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );

      if (!createRes.ok) {
        const errBody = await createRes.text();
        throw new Error(`Leonardo create ${createRes.status}: ${errBody}`);
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
      // If character-guided Phoenix fails, retry Lucid Origin with style/content only.
      if (guidance?.characterInitImageId) {
        this.logger.warn(
          `Leonardo character guidance failed, retrying Lucid style/content: ${(error as Error).message}`,
        );
        try {
          return await this.generateLucidWithStyleContent(prompt, size, guidance);
        } catch (retryError) {
          this.logger.warn(
            `Leonardo Lucid guidance retry failed: ${(retryError as Error).message}`,
          );
        }
      }
      this.logger.warn(
        `Leonardo failed, trying OpenAI images: ${(error as Error).message}`,
      );
      return this.openaiImageFallback(prompt, size);
    }
  }

  /** Fallback guidance on Lucid Origin: Content + Style (no Character). */
  private async generateLucidWithStyleContent(
    prompt: string,
    size: { width: number; height: number },
    guidance: LeonardoGuidance,
  ): Promise<Buffer> {
    const apiKey = this.config.get('LEONARDO_API_KEY', { infer: true });
    const controlnets: Array<Record<string, unknown>> = [];
    if (guidance.characterInitImageId) {
      controlnets.push({
        initImageId: guidance.characterInitImageId,
        initImageType: 'UPLOADED',
        preprocessorId: PREPROCESSOR.lucidContent,
        strengthType: 'High',
      });
      controlnets.push({
        initImageId: guidance.characterInitImageId,
        initImageType: 'UPLOADED',
        preprocessorId: PREPROCESSOR.lucidStyle,
        strengthType: 'High',
      });
    }
    for (const styleId of (guidance.styleInitImageIds ?? []).slice(0, 2)) {
      controlnets.push({
        initImageId: styleId,
        initImageType: 'UPLOADED',
        preprocessorId: PREPROCESSOR.lucidStyle,
        strengthType: 'Mid',
      });
    }

    const createRes = await fetch(
      'https://cloud.leonardo.ai/api/rest/v1/generations',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt.slice(0, 1500),
          modelId: LUCID_ORIGIN_MODEL,
          width: size.width,
          height: size.height,
          num_images: 1,
          contrast: 3.5,
          controlnets,
        }),
      },
    );
    if (!createRes.ok) {
      throw new Error(`Leonardo Lucid create ${createRes.status}`);
    }
    const createJson = (await createRes.json()) as {
      sdGenerationJob?: { generationId?: string };
    };
    const generationId = createJson.sdGenerationJob?.generationId;
    if (!generationId) throw new Error('Missing Leonardo generationId');

    for (let attempt = 0; attempt < 20; attempt++) {
      await this.sleep(2000);
      const pollRes = await fetch(
        `https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      if (!pollRes.ok) continue;
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
        if (!imageRes.ok) throw new Error('Failed to download Leonardo image');
        return Buffer.from(await imageRes.arrayBuffer());
      }
      if (generation?.status === 'FAILED') {
        throw new Error('Leonardo Lucid generation failed');
      }
    }
    throw new Error('Leonardo Lucid generation timed out');
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
