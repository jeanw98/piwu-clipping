import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import type { StorageService } from '../storage/storage.types';

const execFileAsync = promisify(execFile);

export interface ZipVideo {
  relativePath: string;
  /** File name inside the zip (without extension). */
  name: string;
  summary: string;
}

/** ASCII-only, short, filesystem-safe slug. */
export function slugify(text: string, max = 40): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, max)
      .replace(/-+$/g, '') || 'video'
  );
}

/**
 * Downloads the rendered videos, writes resumen.txt and zips them (stored,
 * not compressed: mp4 does not shrink). Returns the local zip path; the
 * caller uploads it and removes `dir`.
 */
export async function buildRunZip(
  storage: StorageService,
  videos: ZipVideo[],
  header: string,
): Promise<{ dir: string; zipPath: string; count: number }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'piwu-zip-'));
  const files: string[] = [];
  const lines: string[] = [header, ''];
  for (const video of videos) {
    const file = path.join(dir, `${video.name}.mp4`);
    try {
      await storage.downloadToFile(video.relativePath, file);
      files.push(file);
      lines.push(`${video.name}.mp4`, video.summary, '');
    } catch (error) {
      lines.push(`${video.name}.mp4: no se pudo descargar (${(error as Error).message.slice(0, 120)})`, '');
    }
  }
  const summaryPath = path.join(dir, 'resumen.txt');
  await fs.writeFile(summaryPath, lines.join('\n'), 'utf8');
  const zipPath = path.join(dir, 'out.zip');
  await execFileAsync('zip', ['-q', '-0', '-j', zipPath, summaryPath, ...files], {
    timeout: 10 * 60_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { dir, zipPath, count: files.length };
}
