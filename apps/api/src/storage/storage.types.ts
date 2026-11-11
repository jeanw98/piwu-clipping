export type StorageCategory = 'assets' | 'audio' | 'renders' | 'references';

export interface StoredObject {
  /** Path relative to storage root, e.g. assets/job-scene-0.png */
  relativePath: string;
  /** App-facing URL, always `/storage/{relativePath}` */
  publicUrl: string;
}

export abstract class StorageService {
  abstract put(
    category: StorageCategory,
    filename: string,
    data: Buffer,
  ): Promise<StoredObject>;

  abstract read(relativePath: string): Promise<Buffer>;

  abstract delete(relativePath: string): Promise<void>;

  abstract deleteMany(relativePaths: string[]): Promise<void>;

  abstract getPublicUrl(relativePath: string): string;

  abstract exists(relativePath: string): Promise<boolean>;

  /**
   * URL Remotion can fetch (local file:// or signed HTTPS).
   */
  abstract getRenderableUrl(relativePath: string): Promise<string>;

  /**
   * Browser-reachable URL for playback/download.
   * S3 → temporary signed HTTPS; local → `/storage/...` proxy path.
   */
  abstract getAccessUrl(
    relativePath: string,
    options?: { downloadFilename?: string; expiresInSec?: number },
  ): Promise<{ url: string; direct: boolean }>;

  toRelativePath(publicOrRelativeUrl: string): string {
    const cleaned = publicOrRelativeUrl
      .replace(/^https?:\/\/[^/]+/i, '')
      .replace(/^\/storage\//, '')
      .replace(/^\/+/, '');
    // Strip optional S3 folder prefix if present in a full URL path
    return cleaned.replace(/^piwu-clipping\//, '');
  }
}
