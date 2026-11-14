import { Injectable, Logger } from '@nestjs/common';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { setDefaultResultOrder } from 'dns';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import type {
  MotionGraphicsCompositionProps,
  RemotionCompositionProps,
} from '@piwu/shared';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { StorageService } from '../storage/storage.types';

// Remotion serves staticFile() assets on http://localhost:<port>. Node ≥17
// resolves localhost to ::1 first while that server listens on IPv4.
setDefaultResultOrder('ipv4first');

/** apps/api/assets — fonts, music, sfx. Served as Remotion `staticFile()`. */
export const REMOTION_PUBLIC_DIR = path.resolve(__dirname, '../../assets');

/** Bundle the Remotion entry (shared by the service and CLI scripts). */
export async function bundleRemotion(outDir?: string): Promise<string> {
  const compiled = path.join(__dirname, 'entry.js');
  const source = path.join(__dirname, 'entry.ts');
  const entryPoint = await fs
    .access(compiled)
    .then(() => compiled)
    .catch(() => source);
  return bundle({
    entryPoint,
    publicDir: REMOTION_PUBLIC_DIR,
    ...(outDir ? { outDir } : {}),
    webpackOverride: (config) => config,
  });
}

/**
 * Render settings tuned for the 2 GB droplet: one Chrome tab, JPEG frames,
 * fast x264 preset, small offthread cache and a single decoding thread.
 */
export const RENDER_MEDIA_OPTIONS = {
  codec: 'h264',
  imageFormat: 'jpeg',
  jpegQuality: 80,
  x264Preset: 'veryfast',
  crf: 20,
  concurrency: 1,
  offthreadVideoCacheSizeInBytes: 64 * 1024 * 1024,
  offthreadVideoThreads: 1,
  chromiumOptions: { disableWebSecurity: true },
} as const;

export type RenderProgress = (progress: number) => void;

type CompositionId = 'ViralClip' | 'MotionGraphicsClip';

@Injectable()
export class RemotionService {
  private readonly logger = new Logger(RemotionService.name);
  private bundleLocation: string | null = null;

  constructor(
    private readonly storage: StorageService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  renderClip(
    jobId: string,
    props: RemotionCompositionProps,
    filename = `${jobId}.mp4`,
    onProgress?: RenderProgress,
  ): Promise<{ relativePath: string; publicUrl: string }> {
    return this.renderComposition('ViralClip', jobId, props, filename, onProgress);
  }

  renderMotionGraphics(
    jobId: string,
    props: MotionGraphicsCompositionProps,
    filename = `${jobId}.mp4`,
    onProgress?: RenderProgress,
  ): Promise<{ relativePath: string; publicUrl: string }> {
    return this.renderComposition(
      'MotionGraphicsClip',
      jobId,
      props,
      filename,
      onProgress,
    );
  }

  private async renderComposition(
    id: CompositionId,
    jobId: string,
    props: RemotionCompositionProps | MotionGraphicsCompositionProps,
    filename: string,
    onProgress?: RenderProgress,
  ): Promise<{ relativePath: string; publicUrl: string }> {
    const serveUrl = await this.ensureBundle();
    const inputProps = props as unknown as Record<string, unknown>;
    const composition = await selectComposition({
      serveUrl,
      id,
      inputProps,
    });
    const tempOut = path.join(os.tmpdir(), `piwu-render-${filename}`);

    this.logger.log(
      `Rendering ${id} ${filename} (${composition.durationInFrames} frames) for ${jobId}`,
    );

    const started = Date.now();
    await renderMedia({
      ...RENDER_MEDIA_OPTIONS,
      composition,
      serveUrl,
      outputLocation: tempOut,
      inputProps,
      onProgress: onProgress
        ? ({ progress }) => onProgress(progress)
        : undefined,
    });
    this.logger.log(
      `Rendered ${filename} in ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );

    const buffer = await fs.readFile(tempOut);
    const stored = await this.storage.put('renders', filename, buffer);
    await fs.unlink(tempOut).catch(() => undefined);

    return {
      relativePath: stored.relativePath,
      publicUrl: stored.publicUrl,
    };
  }

  private async ensureBundle(): Promise<string> {
    if (this.bundleLocation) {
      return this.bundleLocation;
    }
    // Production: the image ships a pre-built bundle (Dockerfile.api).
    const prebuilt = this.config.get('REMOTION_SERVE_URL', { infer: true });
    if (prebuilt) {
      const indexHtml = path.join(prebuilt, 'index.html');
      if (/^https?:/.test(prebuilt) || (await fs.access(indexHtml).then(() => true, () => false))) {
        this.logger.log(`Using pre-built Remotion bundle: ${prebuilt}`);
        this.bundleLocation = prebuilt;
        return prebuilt;
      }
      this.logger.warn(`REMOTION_SERVE_URL=${prebuilt} has no index.html — bundling at runtime`);
    }
    this.logger.log('Bundling Remotion entry (development)');
    this.bundleLocation = await bundleRemotion();
    return this.bundleLocation;
  }
}
