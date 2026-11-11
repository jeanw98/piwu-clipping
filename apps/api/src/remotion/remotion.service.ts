import { Injectable, Logger } from '@nestjs/common';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { RemotionCompositionProps } from '@piwu/shared';
import { StorageService } from '../storage/storage.types';

@Injectable()
export class RemotionService {
  private readonly logger = new Logger(RemotionService.name);
  private bundleLocation: string | null = null;

  constructor(private readonly storage: StorageService) {}

  async renderClip(
    jobId: string,
    props: RemotionCompositionProps,
    filename = `${jobId}.mp4`,
  ): Promise<{ relativePath: string; publicUrl: string }> {
    const serveUrl = await this.ensureBundle();
    const inputProps = props as unknown as Record<string, unknown>;
    const composition = await selectComposition({
      serveUrl,
      id: 'ViralClip',
      inputProps,
    });
    const tempOut = path.join(os.tmpdir(), `piwu-render-${filename}`);

    this.logger.log(
      `Rendering ${filename} (${composition.durationInFrames} frames)`,
    );

    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: tempOut,
      inputProps,
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

    const compiled = path.join(__dirname, 'entry.js');
    const source = path.join(__dirname, 'entry.ts');
    const resolvedEntry = await this.resolveEntry(compiled, source);

    this.logger.log(`Bundling Remotion entry: ${resolvedEntry}`);
    this.bundleLocation = await bundle({
      entryPoint: resolvedEntry,
      webpackOverride: (config) => config,
    });
    return this.bundleLocation;
  }

  private async resolveEntry(
    compiled: string,
    source: string,
  ): Promise<string> {
    try {
      await fs.access(compiled);
      return compiled;
    } catch {
      return source;
    }
  }
}
