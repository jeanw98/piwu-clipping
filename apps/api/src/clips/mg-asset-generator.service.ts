import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { mgImageSrcs, type MotionGraphicsSpec } from '@piwu/shared';
import type { EnvConfig } from '../config/env.schema';
import { StorageService } from '../storage/storage.types';
import { resolveSpecAssets, slugify } from './mg-assets';

/** List price per generated object (gpt-image-1-mini, low, 1024²). */
export const MG_ASSET_UNIT_USD = 0.011;
/** List price per generated background (gpt-image-1-mini, medium, 1024×1536). */
export const MG_BACKGROUND_UNIT_USD = 0.015;

/** Shared art direction so generated pieces match the library + code shapes. */
export const MG_STYLE =
  'flat 2D vector illustration in the style of modern emoji and explainer motion graphics: bold simple shapes, clean edges, soft gradients, limited vibrant palette, no outlines texture, no text, no letters, no logos, no watermark';

/**
 * Objects missing from the library are generated ONCE as flat 2D
 * illustrations with a transparent background and cached in storage
 * (assets/mg-object-<slug>.png). Every later clip reuses the cached file.
 */
export function mgBackgroundPrompt(place: string): string {
  return `Vertical 9:16 background scene: ${place}. ${MG_STYLE}. Empty scene with no people and no animals. The horizon / back wall meets the floor at about 65% of the image height; the lower third is an open, uncluttered floor area where objects can be placed later. Keep the top 25% simple (sky or plain wall) so headline text stays readable.`;
}

export function mgObjectPrompt(name: string): string {
  return `A single ${name}, ${MG_STYLE}. Centered, the whole object visible, isolated on a transparent background, no ground shadow, no scenery.`;
}

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
  async complete(input: MotionGraphicsSpec): Promise<{
    spec: MotionGraphicsSpec;
    generated: number;
    generatedBackgrounds: number;
    skipped: string[];
  }> {
    const resolved = resolveSpecAssets(input);
    const { missing } = resolved;
    const bg = await this.completeBackgrounds(resolved.spec, resolved.backgrounds);
    const spec = bg.spec;
    if (!missing.length) {
      return { spec, generated: 0, generatedBackgrounds: bg.generated, skipped: bg.skipped };
    }

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
    return {
      spec: { ...spec, scenes },
      generated,
      generatedBackgrounds: bg.generated,
      skipped: [...skipped, ...bg.skipped],
    };
  }

  /**
   * Generate (or reuse from cache) one full background per specific place.
   * Failures fall back to the procedural scenery (no backgroundSrc).
   */
  private async completeBackgrounds(
    spec: MotionGraphicsSpec,
    backgrounds: string[],
  ): Promise<{ spec: MotionGraphicsSpec; generated: number; skipped: string[] }> {
    if (!backgrounds.length) return { spec, generated: 0, skipped: [] };
    const cap = this.config.get('MG_MAX_GENERATED_BACKGROUNDS', { infer: true });
    const srcByName = new Map<string, string>();
    const skipped: string[] = [];
    let generated = 0;
    for (const name of backgrounds) {
      const file = `mg-bg-${slugify(name).slice(0, 80)}.png`;
      const relativePath = `assets/${file}`;
      if (await this.exists(relativePath)) {
        srcByName.set(name, `storage:${relativePath}`);
        continue;
      }
      if (generated >= cap) {
        skipped.push(name);
        continue;
      }
      const png = await this.generateBackground(name);
      if (!png) {
        skipped.push(name);
        continue;
      }
      const stored = await this.storage.put('assets', file, png);
      srcByName.set(name, `storage:${stored.relativePath}`);
      generated += 1;
    }
    const apply = <T extends MotionGraphicsSpec['setting']>(setting: T): T => {
      if (!setting?.background || setting.backgroundSrc) return setting;
      const src = srcByName.get(setting.background.trim().toLowerCase());
      return src ? { ...setting, backgroundSrc: src } : setting;
    };
    return {
      spec: {
        ...spec,
        setting: apply(spec.setting),
        scenes: spec.scenes.map((scene) => ({ ...scene, setting: apply(scene.setting) })),
      },
      generated,
      skipped,
    };
  }

  /** Portrait background, horizon at ~65 % height, empty floor for objects. */
  async generateBackground(place: string): Promise<Buffer | null> {
    try {
      const result = await this.openai.images.generate({
        model: 'gpt-image-1-mini',
        prompt: mgBackgroundPrompt(place),
        size: '1024x1536',
        quality: 'medium',
        n: 1,
      });
      const b64 = result.data?.[0]?.b64_json;
      if (!b64) throw new Error('no image data');
      this.logger.log(`Generated Motion Graphics background "${place}"`);
      return Buffer.from(b64, 'base64');
    } catch (error) {
      this.logger.warn(`Background generation failed for "${place}": ${(error as Error).message}`);
      return null;
    }
  }

  /** storage:<path> srcs → renderable URLs for Remotion. */
  async renderableUrls(spec: MotionGraphicsSpec): Promise<Record<string, string>> {
    const urls: Record<string, string> = {};
    for (const src of mgImageSrcs(spec)) {
      if (!src.startsWith('storage:') || urls[src]) continue;
      urls[src] = await this.storage.getRenderableUrl(src.slice('storage:'.length));
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
        prompt: mgObjectPrompt(name),
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
