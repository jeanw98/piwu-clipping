import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import type { WordTimestamp } from '@piwu/shared';

const execFileAsync = promisify(execFile);

/** Voice longer than this gets sped up (pitch-preserving atempo). */
export const MAX_VOICE_SEC = 62;
export const TARGET_VOICE_SEC = 60;
export const MAX_TEMPO = 1.15;

/** atempo factor needed to bring `durationSec` near the target, capped at 1.15. */
export function tempoFor(durationSec: number): number {
  if (durationSec <= MAX_VOICE_SEC) return 1;
  return Math.min(MAX_TEMPO, Math.round((durationSec / TARGET_VOICE_SEC) * 1000) / 1000);
}

/** Speed up an MP3 with ffmpeg atempo (keeps pitch). */
export async function speedUpMp3(audio: Buffer, tempo: number): Promise<Buffer> {
  if (tempo <= 1.001) return audio;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'piwu-tempo-'));
  const input = path.join(dir, 'in.mp3');
  const output = path.join(dir, 'out.mp3');
  try {
    await fs.writeFile(input, audio);
    await execFileAsync(
      'ffmpeg',
      ['-y', '-loglevel', 'error', '-i', input, '-filter:a', `atempo=${tempo}`, '-c:a', 'libmp3lame', '-b:a', '128k', output],
      { timeout: 120_000 },
    );
    return await fs.readFile(output);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** Word timestamps after an atempo change. */
export function scaleWords(words: WordTimestamp[], tempo: number): WordTimestamp[] {
  if (tempo <= 1.001) return words;
  return words.map((w) => ({ ...w, start: w.start / tempo, end: w.end / tempo }));
}
