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

  /**
   * Step 1 of a direct upload: a signed URL to PUT the file straight to S3
   * (the droplet never carries the bytes). `mode: 'api'` when the storage
   * can't sign (local disk) → use PUT /clips/uploads.
   */
  async init(
    userId: string,
    meta: { filename?: string; contentType?: string; sizeBytes?: number },
  ): Promise<
    | { mode: 'direct'; uploadUrl: string; headers: Record<string, string>; sourceRef: string }
    | { mode: 'api' }
  > {
    const maxBytes = this.maxBytes();
    const original = String(meta.filename || 'video.mp4').slice(0, 200);
    const contentType = String(meta.contentType || '');
    if (contentType && !/^video\//.test(contentType)) {
      throw new BadRequestException('Sube un archivo de video (MP4, MOV, WEBM…).');
    }
    if (!VIDEO_EXT.test(original) && !contentType) {
      throw new BadRequestException('Sube un archivo de video (MP4, MOV, WEBM…).');
    }
    const size = Number(meta.sizeBytes);
    if (Number.isFinite(size) && size > maxBytes) {
      throw new PayloadTooLargeException(`El archivo supera el máximo de ${Math.round(maxBytes / 1024 / 1024)} MB.`);
    }
    const ext = this.extFor(original, contentType);
    const relative = `sources/${userId}/${randomUUID()}.${ext}`;
    const type = contentType || 'video/mp4';
    const signed = await this.storage.presignUpload(relative, type, 60 * 60);
    if (!signed) return { mode: 'api' };
    return { mode: 'direct', uploadUrl: signed.url, headers: signed.headers, sourceRef: `storage:${relative}` };
  }

  /** Step 2: validate what landed in storage (ffprobe reads it remotely). */
  async complete(userId: string, sourceRef: string, filename?: string): Promise<SourceUploadDto> {
    const relative = ownedSourcePath(sourceRef, userId);
    if (!relative) throw new BadRequestException('Subida inválida.');
    const size = await this.storage.sizeOf(relative);
    if (size == null) throw new BadRequestException('El archivo no llegó al almacenamiento. Vuelve a subirlo.');
    const reject = async (message: string) => {
      await this.storage.delete(relative).catch(() => undefined);
      return new BadRequestException(message);
    };
    if (size > this.maxBytes()) {
      throw await reject(`El archivo supera el máximo de ${Math.round(this.maxBytes() / 1024 / 1024)} MB.`);
    }
    const url = (await this.storage.getRenderableUrl(relative)).replace(/^file:\/\//, '');
    let probe: Awaited<ReturnType<typeof probeUploadedVideo>>;
    try {
      probe = await probeUploadedVideo(url);
    } catch (error) {
      if (error instanceof SourceVideoError) throw await reject(error.message);
      throw error;
    }
    this.logger.log(`Direct source upload ${relative} (${(size / 1024 / 1024).toFixed(1)} MB, ${probe.durationSec.toFixed(0)}s)`);
    return {
      sourceRef: `storage:${relative}`,
      filename: String(filename || path.basename(relative)).slice(0, 200),
      sizeBytes: size,
      durationSec: probe.durationSec,
    };
  }

  private maxBytes() {
    return this.config.get('MAX_UPLOAD_MB', { infer: true }) * 1024 * 1024;
  }

  private extFor(filename: string, contentType: string) {
    return (VIDEO_EXT.exec(filename)?.[1] ?? (contentType.includes('quicktime') ? 'mov' : contentType.includes('webm') ? 'webm' : 'mp4')).toLowerCase();
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
