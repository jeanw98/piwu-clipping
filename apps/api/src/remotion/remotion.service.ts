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
import { StorageService } from '../storage/storage.types';

// Remotion serves staticFile() assets on http://localhost:<port>. Node ≥17
// resolves localhost to ::1 first while that server listens on IPv4.
setDefaultResultOrder('ipv4first');

/** apps/api/assets — fonts, music, sfx. Served as Remotion `staticFile()`. */
export const REMOTION_PUBLIC_DIR = path.resolve(__dirname, '../../assets');

/** Bundle the Remotion entry (shared by the service and CLI scripts). */
export async function bundleRemotion(): Promise<string> {
  const compiled = path.join(__dirname, 'entry.js');
  const source = path.join(__dirname, 'entry.ts');
  const entryPoint = await fs
    .access(compiled)
    .then(() => compiled)
    .catch(() => source);
  return bundle({
    entryPoint,
    publicDir: REMOTION_PUBLIC_DIR,
    webpackOverride: (config) => config,
  });
}

type CompositionId = 'ViralClip' | 'MotionGraphicsClip';

@Injectable()
export class RemotionService {
  private readonly logger = new Logger(RemotionService.name);
  private bundleLocation: string | null = null;

  constructor(private readonly storage: StorageService) {}

  renderClip(
    jobId: string,
    props: RemotionCompositionProps,
    filename = `${jobId}.mp4`,
  ): Promise<{ relativePath: string; publicUrl: string }> {
    return this.renderComposition('ViralClip', jobId, props, filename);
  }

  renderMotionGraphics(
    jobId: string,
    props: MotionGraphicsCompositionProps,
    filename = `${jobId}.mp4`,
  ): Promise<{ relativePath: string; publicUrl: string }> {
    return this.renderComposition('MotionGraphicsClip', jobId, props, filename);
  }

  private async renderComposition(
    id: CompositionId,
    jobId: string,
    props: RemotionCompositionProps | MotionGraphicsCompositionProps,
    filename: string,
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

    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: tempOut,
      inputProps,
      // Droplet has ~2GB RAM — one Chrome tab + low offthread cache avoids OOM stalls.
      concurrency: 1,
      offthreadVideoCacheSizeInBytes: 64 * 1024 * 1024,
      chromiumOptions: {
        disableWebSecurity: true,
      },
    });

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
    this.logger.log('Bundling Remotion entry');
    this.bundleLocation = await bundleRemotion();
    return this.bundleLocation;
  }
}
