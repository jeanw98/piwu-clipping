import { Injectable, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  StorageCategory,
  StorageService,
  StoredObject,
} from './storage.types';

@Injectable()
export class LocalStorageAdapter extends StorageService implements OnModuleInit {
  private readonly rootDir = path.resolve(process.cwd(), 'uploads');

  async onModuleInit(): Promise<void> {
    for (const category of [
      'assets',
      'audio',
      'renders',
      'references',
      'sources',
    ] as StorageCategory[]) {
      await fs.mkdir(path.join(this.rootDir, category), { recursive: true });
    }
  }

  async put(
    category: StorageCategory,
    filename: string,
    data: Buffer,
  ): Promise<StoredObject> {
    const relativePath = path.posix.join(category, filename);
    const absolutePath = this.resolveAbsolute(relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, data);
    return {
      relativePath,
      publicUrl: this.getPublicUrl(relativePath),
    };
  }

  async read(relativePath: string): Promise<Buffer> {
    return fs.readFile(this.resolveAbsolute(relativePath));
  }

  async putFile(
    category: StorageCategory,
    filename: string,
    filePath: string,
  ): Promise<StoredObject> {
    const relativePath = path.posix.join(category, filename);
    const absolutePath = this.resolveAbsolute(relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.copyFile(filePath, absolutePath);
    return { relativePath, publicUrl: this.getPublicUrl(relativePath) };
  }

  async presignUpload(): Promise<null> {
    return null;
  }

  async sizeOf(relativePath: string): Promise<number | null> {
    try {
      return (await fs.stat(this.resolveAbsolute(relativePath))).size;
    } catch {
      return null;
    }
  }

  async downloadToFile(relativePath: string, destination: string): Promise<void> {
    await fs.copyFile(this.resolveAbsolute(relativePath), destination);
  }

  async delete(relativePath: string): Promise<void> {
    try {
      await fs.unlink(this.resolveAbsolute(relativePath));
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async deleteMany(relativePaths: string[]): Promise<void> {
    await Promise.all(relativePaths.map((p) => this.delete(p)));
  }

  getPublicUrl(relativePath: string): string {
    return `/storage/${relativePath.replace(/^\/+/, '')}`;
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await fs.access(this.resolveAbsolute(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  async getRenderableUrl(relativePath: string): Promise<string> {
    return `file://${this.resolveAbsolute(relativePath)}`;
  }

  async getAccessUrl(
    relativePath: string,
    options?: { downloadFilename?: string; expiresInSec?: number },
  ): Promise<{ url: string; direct: boolean }> {
    const base = this.getPublicUrl(relativePath);
    const url = options?.downloadFilename
      ? `${base}?download=1&filename=${encodeURIComponent(options.downloadFilename)}`
      : base;
    return { url, direct: false };
  }

  private resolveAbsolute(relativePath: string): string {
    const normalized = relativePath.replace(/^\/+/, '');
    const absolute = path.resolve(this.rootDir, normalized);
    if (!absolute.startsWith(this.rootDir)) {
      throw new Error('Invalid storage path');
    }
    return absolute;
  }
}
