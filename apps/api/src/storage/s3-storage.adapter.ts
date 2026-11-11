import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import type { EnvConfig } from '../config/env.schema';
import {
  StorageCategory,
  StorageService,
  StoredObject,
} from './storage.types';

@Injectable()
export class S3StorageAdapter extends StorageService implements OnModuleInit {
  private readonly logger = new Logger(S3StorageAdapter.name);
  private client!: S3Client;
  private bucket!: string;
  private prefix!: string;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    super();
  }

  onModuleInit(): void {
    this.bucket = this.config.get('AWS_BUCKET', { infer: true });
    this.prefix = this.config
      .get('S3_PREFIX', { infer: true })
      .replace(/^\/+|\/+$/g, '');
    this.client = new S3Client({
      region: this.config.get('AWS_REGION', { infer: true }),
      credentials: {
        accessKeyId: this.config.get('AWS_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: this.config.get('AWS_SECRET_ACCESS_KEY', {
          infer: true,
        }),
      },
    });
    this.logger.log(
      `S3 storage ready → s3://${this.bucket}/${this.prefix}/`,
    );
  }

  async put(
    category: StorageCategory,
    filename: string,
    data: Buffer,
  ): Promise<StoredObject> {
    const relativePath = `${category}/${filename}`;
    const key = this.toKey(relativePath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: this.contentType(filename),
      }),
    );
    return {
      relativePath,
      publicUrl: this.getPublicUrl(relativePath),
    };
  }

  async read(relativePath: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.toKey(relativePath),
      }),
    );
    return this.streamToBuffer(result.Body as Readable);
  }

  async delete(relativePath: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.toKey(relativePath),
      }),
    );
  }

  async deleteMany(relativePaths: string[]): Promise<void> {
    await Promise.all(relativePaths.map((p) => this.delete(p)));
  }

  getPublicUrl(relativePath: string): string {
    return `/storage/${relativePath.replace(/^\/+/, '')}`;
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: this.toKey(relativePath),
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async getRenderableUrl(relativePath: string): Promise<string> {
    const { url } = await this.getAccessUrl(relativePath, {
      expiresInSec: 60 * 60,
    });
    return url;
  }

  async getAccessUrl(
    relativePath: string,
    options?: { downloadFilename?: string; expiresInSec?: number },
  ): Promise<{ url: string; direct: boolean }> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: this.toKey(relativePath),
      ...(options?.downloadFilename
        ? {
            ResponseContentDisposition: `attachment; filename="${options.downloadFilename.replace(/"/g, '')}"`,
          }
        : {}),
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: options?.expiresInSec ?? 60 * 15,
    });
    return { url, direct: true };
  }

  private toKey(relativePath: string): string {
    const normalized = relativePath.replace(/^\/+/, '');
    return `${this.prefix}/${normalized}`;
  }

  private contentType(filename: string): string {
    if (filename.endsWith('.mp4')) return 'video/mp4';
    if (filename.endsWith('.mp3')) return 'audio/mpeg';
    if (filename.endsWith('.webm')) return 'video/webm';
    if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) {
      return 'image/jpeg';
    }
    if (filename.endsWith('.webp')) return 'image/webp';
    return 'image/png';
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
