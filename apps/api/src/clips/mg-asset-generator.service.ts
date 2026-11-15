import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { MotionGraphicsSpec } from '@piwu/shared';
import type { EnvConfig } from '../config/env.schema';
import { StorageService } from '../storage/storage.types';
import { resolveSpecAssets, slugify } from './mg-assets';

/** List price per generated object (gpt-image-1-mini, low, 1024²). */
export const MG_ASSET_UNIT_USD = 0.011;

/**
 * Objects missing from the library are generated ONCE as flat 2D
 * illustrations with a transparent background and cached in storage
 * (assets/mg-object-<slug>.png). Every later clip reuses the cached file.
 */
@Injectable()
export class MgAssetGeneratorService {
  private readonly logger = new Logger(MgAssetGeneratorService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly storage: StorageService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get('OPENAI_API_KEY', { infer: true }),
    });
  }

  /**
   * Resolve library objects, then fill the missing ones from cache or by
   * generating them (capped by MG_MAX_GENERATED_ASSETS per clip).
   */
  async complete(
    input: MotionGraphicsSpec,
  ): Promise<{ spec: MotionGraphicsSpec; generated: number; skipped: string[] }> {
    const { spec, missing } = resolveSpecAssets(input);
    if (!missing.length) return { spec, generated: 0, skipped: [] };

    const cap = this.config.get('MG_MAX_GENERATED_ASSETS', { infer: true });
    const srcByName = new Map<string, string>();
    const skipped: string[] = [];
    let generated = 0;
    for (const name of missing) {
      const file = `mg-object-${slugify(name)}.png`;
      const relativePath = `assets/${file}`;
      if (await this.exists(relativePath)) {
        srcByName.set(name, `storage:${relativePath}`);
        continue;
      }
      if (generated >= cap) {
        skipped.push(name);
        continue;
      }
      const png = await this.generate(name);
      if (!png) {
        skipped.push(name);
        continue;
      }
      const stored = await this.storage.put('assets', file, png);
      srcByName.set(name, `storage:${stored.relativePath}`);
      generated += 1;
    }
    if (skipped.length) {
      this.logger.warn(`Motion Graphics objects skipped (no asset): ${skipped.join(', ')}`);
    }

    const scenes = spec.scenes.map((scene) => ({
      ...scene,
      elements: scene.elements?.map((el) => {
        if (!('asset' in el) || el.src) return el;
        const src = srcByName.get(el.asset.trim().toLowerCase());
        return src ? { ...el, src } : el;
      }),
    }));
    return { spec: { ...spec, scenes }, generated, skipped };
  }

  /** storage:<path> srcs → renderable URLs for Remotion. */
  async renderableUrls(spec: MotionGraphicsSpec): Promise<Record<string, string>> {
    const urls: Record<string, string> = {};
    for (const scene of spec.scenes) {
      for (const el of scene.elements ?? []) {
        if (!('asset' in el) || !el.src?.startsWith('storage:') || urls[el.src]) continue;
        urls[el.src] = await this.storage.getRenderableUrl(el.src.slice('storage:'.length));
      }
    }
    return urls;
  }

  private async exists(relativePath: string): Promise<boolean> {
    try {
      const buffer = await this.storage.read(relativePath);
      return buffer.length > 1024;
    } catch {
      return false;
    }
  }

  private async generate(name: string): Promise<Buffer | null> {
    try {
      const result = await this.openai.images.generate({
        model: 'gpt-image-1-mini',
        prompt: `A single ${name}, flat 2D vector illustration in the style of a modern emoji: bold simple shapes, soft gradients, centered, full object visible, no text, no background, no shadow on the ground.`,
        size: '1024x1024',
        quality: 'low',
        background: 'transparent',
        n: 1,
      });
      const b64 = result.data?.[0]?.b64_json;
      if (!b64) throw new Error('no image data');
      this.logger.log(`Generated Motion Graphics object "${name}"`);
      return Buffer.from(b64, 'base64');
    } catch (error) {
      this.logger.warn(`Object generation failed for "${name}": ${(error as Error).message}`);
      return null;
    }
  }
}
