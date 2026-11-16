export type StorageCategory = 'assets' | 'audio' | 'renders' | 'references' | 'sources';

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

  /** Store a (possibly large) file from disk without loading it in memory. */
  abstract putFile(
    category: StorageCategory,
    filename: string,
    filePath: string,
  ): Promise<StoredObject>;

  /**
   * Signed URL the browser can PUT a file to directly (S3). `null` when the
   * driver can't (local disk): upload through the API instead.
   */
  abstract presignUpload(
    relativePath: string,
    contentType: string,
    expiresInSec?: number,
  ): Promise<{ url: string; headers: Record<string, string> } | null>;

  /** Size in bytes of a stored object, or null if missing. */
  abstract sizeOf(relativePath: string): Promise<number | null>;

  /** Copy a stored object to a local file (streamed). */
  abstract downloadToFile(relativePath: string, destination: string): Promise<void>;

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
