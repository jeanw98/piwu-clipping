import { BadRequestException, Injectable, Logger, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { createWriteStream, promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Readable } from 'stream';
import type { SourceUploadDto } from '@piwu/shared';
import type { EnvConfig } from '../config/env.schema';
import { StorageService } from '../storage/storage.types';
import { probeUploadedVideo, removeDir, SourceVideoError } from './youtube-media';

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv)$/i;

/** `storage:sources/<userId>/<uuid>.<ext>` → relative storage path, if owned. */
export function ownedSourcePath(ref: string | null | undefined, userId: string): string | null {
  const match = /^storage:(sources\/([\w-]+)\/[\w-]+\.(?:mp4|mov|m4v|webm|mkv))$/i.exec((ref ?? '').trim());
  if (!match || match[2] !== userId) return null;
  return match[1];
}

/**
 * Source videos uploaded by the user (instead of a YouTube/Instagram link).
 * The body is streamed to a temp file (never buffered in memory), validated
 * with ffprobe and stored under `sources/<userId>/`.
 */
@Injectable()
export class SourceUploadService {
  private readonly logger = new Logger(SourceUploadService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async receive(
    userId: string,
    body: Readable,
    meta: { filename?: string; contentLength?: number; contentType?: string },
  ): Promise<SourceUploadDto> {
    const maxBytes = this.config.get('MAX_UPLOAD_MB', { infer: true }) * 1024 * 1024;
    const original = decodeURIComponent(meta.filename || 'video.mp4').slice(0, 200);
    const ext = (VIDEO_EXT.exec(original)?.[1] ?? (meta.contentType?.includes('quicktime') ? 'mov' : 'mp4')).toLowerCase();
    if (meta.contentType && !/^video\/|application\/octet-stream/.test(meta.contentType)) {
      throw new BadRequestException('Sube un archivo de video (MP4, MOV, WEBM…).');
    }
    if (meta.contentLength && meta.contentLength > maxBytes) {
      throw new PayloadTooLargeException(`El archivo supera el máximo de ${Math.round(maxBytes / 1024 / 1024)} MB.`);
    }

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'piwu-upload-'));
    const tmp = path.join(dir, `upload.${ext}`);
    try {
      const size = await this.streamToFile(body, tmp, maxBytes);
      if (size < 10 * 1024) throw new BadRequestException('El archivo está vacío o incompleto.');
      let probe: Awaited<ReturnType<typeof probeUploadedVideo>>;
      try {
        probe = await probeUploadedVideo(tmp);
      } catch (error) {
        if (error instanceof SourceVideoError) throw new BadRequestException(error.message);
        throw error;
      }
      const stored = await this.storage.putFile('sources', `${userId}/${randomUUID()}.${ext}`, tmp);
      this.logger.log(`Source upload ${stored.relativePath} (${(size / 1024 / 1024).toFixed(1)} MB, ${probe.durationSec.toFixed(0)}s)`);
      return {
        sourceRef: `storage:${stored.relativePath}`,
        filename: original,
        sizeBytes: size,
        durationSec: probe.durationSec,
      };
    } finally {
      await removeDir(dir);
    }
  }

  private streamToFile(body: Readable, destination: string, maxBytes: number): Promise<number> {
    return new Promise((resolve, reject) => {
      let size = 0;
      let failed = false;
      const out = createWriteStream(destination);
      const fail = (error: Error) => {
        if (failed) return;
        failed = true;
        body.unpipe(out);
        out.destroy();
        body.resume();
        reject(error);
      };
      body.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          fail(new PayloadTooLargeException(`El archivo supera el máximo de ${Math.round(maxBytes / 1024 / 1024)} MB.`));
        }
      });
      body.on('aborted', () => fail(new BadRequestException('La subida se interrumpió.')));
      body.on('error', (error) => fail(error));
      out.on('error', (error) => fail(error));
      out.on('finish', () => {
        if (!failed) resolve(size);
      });
      body.pipe(out);
    });
  }
}
