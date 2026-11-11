import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import type { WordTimestamp } from '@piwu/shared';
import type { HighlightMoment } from '../ai/anthropic.service';

const execFileAsync = promisify(execFile);
const MAX_SOURCE_SEC = 30 * 60;

export interface YoutubeDownload {
  dir: string;
  videoPath: string;
}

export async function downloadYoutube(url: string): Promise<YoutubeDownload> {
  assertYoutubeUrl(url);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'piwu-yt-'));
  const durationRaw = await run(
    'yt-dlp',
    ['--no-playlist', '--no-warnings', '--print', 'duration', url],
    60_000,
  );
  const duration = Number(durationRaw.trim().split('\n').pop());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('Could not read the YouTube video duration');
  }
  if (duration > MAX_SOURCE_SEC) {
    throw new Error('Video is longer than 30 minutes');
  }

  const template = path.join(dir, 'source.%(ext)s');
  await run(
    'yt-dlp',
    [
      '--no-playlist',
      '--no-warnings',
      '-f',
      'bv*[height<=720]+ba/b[height<=720]/b',
      '-o',
      template,
      url,
    ],
    10 * 60_000,
  );
  const files = await fs.readdir(dir);
  const videoName = files.find((file) => file.startsWith('source.'));
  if (!videoName) {
    throw new Error('yt-dlp did not produce a video file');
  }
  return { dir, videoPath: path.join(dir, videoName) };
}

export async function extractAudioMp3(videoPath: string, dir: string): Promise<string[]> {
  const audioPath = path.join(dir, 'audio.mp3');
  await run(
    'ffmpeg',
    [
      '-y',
      '-i',
      videoPath,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-b:a',
      '64k',
      audioPath,
    ],
    5 * 60_000,
  );
  const stat = await fs.stat(audioPath);
  if (stat.size <= 20 * 1024 * 1024) {
    return [audioPath];
  }
  const pattern = path.join(dir, 'chunk-%03d.mp3');
  await run(
    'ffmpeg',
    [
      '-y',
      '-i',
      audioPath,
      '-f',
      'segment',
      '-segment_time',
      '600',
      '-c',
      'copy',
      pattern,
    ],
    5 * 60_000,
  );
  const files = (await fs.readdir(dir))
    .filter((file) => file.startsWith('chunk-'))
    .sort();
  if (!files.length) {
    throw new Error('Failed to split audio for transcription');
  }
  return files.map((file) => path.join(dir, file));
}

export async function mediaDuration(filePath: string): Promise<number> {
  const raw = await run(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      filePath,
    ],
    30_000,
  );
  const duration = Number(raw.trim());
  if (!Number.isFinite(duration)) {
    throw new Error(`Could not read duration for ${path.basename(filePath)}`);
  }
  return duration;
}

export interface FocusPoint {
  timeSec: number;
  x: number;
  y: number;
}

export interface FocusSample {
  id: string;
  momentIndex: number;
  timeSec: number;
  base64: string;
}

export async function sampleFocusFrames(
  videoPath: string,
  dir: string,
  moments: HighlightMoment[],
): Promise<FocusSample[]> {
  const samples: FocusSample[] = [];
  for (let index = 0; index < moments.length; index++) {
    const moment = moments[index];
    const span = Math.max(0.4, moment.endSec - moment.startSec);
    const offsets = [Math.min(0.4, span * 0.2), span * 0.55];
    for (let sample = 0; sample < offsets.length; sample++) {
      const timeSec = Math.max(0, Math.min(offsets[sample], span - 0.05));
      const file = path.join(dir, `focus-${index}-${sample}.jpg`);
      try {
        await run(
          'ffmpeg',
          [
            '-y',
            '-ss',
            (moment.startSec + timeSec).toFixed(3),
            '-i',
            videoPath,
            '-frames:v',
            '1',
            '-vf',
            'scale=480:-2',
            file,
          ],
          45_000,
        );
        const bytes = await fs.readFile(file);
        if (bytes.length < 500) continue;
        samples.push({
          id: `${index}-${sample}`,
          momentIndex: index,
          timeSec,
          base64: bytes.toString('base64'),
        });
      } catch {
        continue;
      }
    }
  }
  return samples;
}

export interface JumpCutPlan {
  segments: Array<{ startSec: number; endSec: number }>;
  words: WordTimestamp[];
}

/** Drop pauses longer than `gapSec` and remap word times onto the tightened clip. */
export function planJumpCuts(
  words: WordTimestamp[],
  startSec: number,
  endSec: number,
  gapSec = 0.45,
): JumpCutPlan {
  const inside = words
    .filter((word) => word.end > startSec + 0.02 && word.start < endSec - 0.02)
    .sort((a, b) => a.start - b.start);
  if (inside.length < 2) {
    return {
      segments: [{ startSec, endSec }],
      words: shiftWordsToCuts(words, [
        {
          startSec,
          endSec,
          title: '',
          score: 0,
          reason: '',
        },
      ]),
    };
  }

  const groups: WordTimestamp[][] = [[inside[0]]];
  for (let index = 1; index < inside.length; index++) {
    const word = inside[index];
    const current = groups[groups.length - 1];
    const last = current[current.length - 1];
    if (word.start - last.end > gapSec) {
      groups.push([word]);
    } else {
      current.push(word);
    }
  }

  const segments = groups
    .map((group) => ({
      startSec: Math.max(startSec, group[0].start - 0.04),
      endSec: Math.min(endSec, group[group.length - 1].end + 0.06),
    }))
    .filter((segment) => segment.endSec - segment.startSec >= 0.25);

  const mapped: WordTimestamp[] = [];
  let cursor = 0;
  for (const segment of segments) {
    for (const word of inside) {
      if (word.end <= segment.startSec || word.start >= segment.endSec) continue;
      const start = cursor + Math.max(0, word.start - segment.startSec);
      const end =
        cursor +
        Math.max(0.05, Math.min(word.end, segment.endSec) - segment.startSec);
      mapped.push({ word: word.word, start, end: Math.max(start + 0.05, end) });
    }
    cursor += segment.endSec - segment.startSec;
  }

  return {
    segments: segments.length ? segments : [{ startSec, endSec }],
    words: mapped,
  };
}

export async function cutClip(input: {
  videoPath: string;
  dir: string;
  index: number;
  moment: HighlightMoment;
  width: number;
  height: number;
  fps: number;
  focus?: FocusPoint[];
  words: WordTimestamp[];
}): Promise<{
  videoPath: string;
  audioPath: string;
  durationSec: number;
  words: WordTimestamp[];
}> {
  const plan = planJumpCuts(input.words, input.moment.startSec, input.moment.endSec);
  if (plan.segments.length <= 1) {
    const cut = await cutHighlight(input);
    return { ...cut, words: plan.words };
  }

  const videos: string[] = [];
  const audios: string[] = [];
  for (let index = 0; index < plan.segments.length; index++) {
    const segment = plan.segments[index];
    const origin = segment.startSec - input.moment.startSec;
    const span = segment.endSec - segment.startSec;
    const localFocus = (input.focus ?? [])
      .map((point) => ({
        timeSec: point.timeSec - origin,
        x: point.x,
        y: point.y,
      }))
      .filter((point) => point.timeSec >= -0.2 && point.timeSec <= span + 0.2);
    const cut = await cutHighlight({
      ...input,
      stem: `cut-${input.index}-${index}`,
      moment: { ...input.moment, startSec: segment.startSec, endSec: segment.endSec },
      focus: localFocus.length ? localFocus : undefined,
    });
    videos.push(cut.videoPath);
    audios.push(cut.audioPath);
  }

  const videoPath = await concatCopy(
    input.dir,
    videos,
    `cut-${input.index}.mp4`,
  );
  const audioPath = await concatCopy(
    input.dir,
    audios,
    `cut-${input.index}.mp3`,
  );
  const durationSec = plan.segments.reduce(
    (sum, segment) => sum + (segment.endSec - segment.startSec),
    0,
  );
  return { videoPath, audioPath, durationSec, words: plan.words };
}

export async function cutHighlight(input: {
  videoPath: string;
  dir: string;
  index: number;
  moment: HighlightMoment;
  width: number;
  height: number;
  fps: number;
  focus?: FocusPoint[];
  stem?: string;
}): Promise<{ videoPath: string; audioPath: string; durationSec: number }> {
  const durationSec = Math.max(0.2, input.moment.endSec - input.moment.startSec);
  const stem = input.stem ?? `cut-${input.index}`;
  const videoOut = path.join(input.dir, `${stem}.mp4`);
  const audioOut = path.join(input.dir, `${stem}.mp3`);
  const frame = await videoFrameSize(input.videoPath);
  const videoFilter = frame
    ? subjectZoomFilter(frame, input.width, input.height, input.fps, input.focus)
    : [
        '-vf',
        `scale=${input.width}:${input.height}:force_original_aspect_ratio=increase,crop=${input.width}:${input.height},setsar=1`,
      ];
  await run(
    'ffmpeg',
    [
      '-y',
      '-ss',
      input.moment.startSec.toFixed(3),
      '-i',
      input.videoPath,
      '-t',
      durationSec.toFixed(3),
      ...videoFilter,
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      videoOut,
    ],
    3 * 60_000,
  );
  await run(
    'ffmpeg',
    [
      '-y',
      '-ss',
      input.moment.startSec.toFixed(3),
      '-i',
      input.videoPath,
      '-t',
      durationSec.toFixed(3),
      '-vn',
      '-ac',
      '1',
      '-ar',
      '44100',
      '-b:a',
      '128k',
      audioOut,
    ],
    3 * 60_000,
  );
  return { videoPath: videoOut, audioPath: audioOut, durationSec };
}

export async function concatAudio(dir: string, parts: string[]): Promise<string> {
  return concatCopy(dir, parts, 'stitched.mp3');
}

async function concatCopy(
  dir: string,
  parts: string[],
  outputName: string,
): Promise<string> {
  const output = path.join(dir, outputName);
  if (parts.length === 1) {
    await fs.copyFile(parts[0], output);
    return output;
  }
  const listPath = path.join(dir, `${outputName}.txt`);
  const body = parts
    .map((part) => `file '${part.replace(/'/g, "'\\''")}'`)
    .join('\n');
  await fs.writeFile(listPath, body);
  await run(
    'ffmpeg',
    ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', output],
    120_000,
  );
  return output;
}

export function shiftWordsToCuts(
  words: WordTimestamp[],
  moments: HighlightMoment[],
): WordTimestamp[] {
  const shifted: WordTimestamp[] = [];
  let offset = 0;
  for (const moment of moments) {
    const span = moment.endSec - moment.startSec;
    for (const word of words) {
      if (word.end <= moment.startSec || word.start >= moment.endSec) continue;
      const start = Math.max(0, word.start - moment.startSec) + offset;
      const end = Math.max(
        start + 0.05,
        Math.min(span, word.end - moment.startSec) + offset,
      );
      shifted.push({ word: word.word, start, end });
    }
    offset += span;
  }
  return shifted;
}

export async function removeDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

async function videoFrameSize(
  filePath: string,
): Promise<{ width: number; height: number } | null> {
  try {
    const raw = await run(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height,sample_aspect_ratio',
        '-of',
        'json',
        filePath,
      ],
      30_000,
    );
    const parsed = JSON.parse(raw) as {
      streams?: Array<{
        width?: number;
        height?: number;
        sample_aspect_ratio?: string;
      }>;
    };
    const stream = parsed.streams?.[0];
    if (!stream?.width || !stream.height) return null;
    const [sarW, sarH] = (stream.sample_aspect_ratio || '1:1')
      .split(':')
      .map(Number);
    const sar = sarW > 0 && sarH > 0 ? sarW / sarH : 1;
    return {
      width: Math.round(stream.width * sar),
      height: stream.height,
    };
  } catch {
    return null;
  }
}

function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

function clampUnit(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(0.92, Math.max(0.08, value));
}

/** Piecewise line over frame number `n`. Crop evaluates `n`, not `t`. */
function piecewise(
  points: Array<{ t: number; v: number }>,
  fps: number,
): string {
  const clean = points
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v))
    .sort((a, b) => a.t - b.t);
  if (!clean.length) return '0.5000';
  if (clean.length === 1) return clean[0].v.toFixed(4);
  let expr = clean[clean.length - 1].v.toFixed(4);
  for (let index = clean.length - 2; index >= 0; index--) {
    const from = clean[index];
    const to = clean[index + 1];
    const frames = Math.max(1, (to.t - from.t) * fps);
    const piece = `${from.v.toFixed(4)}+${(to.v - from.v).toFixed(4)}*((n-${(from.t * fps).toFixed(2)})/${frames.toFixed(2)})`;
    expr = `if(lt(n,${(to.t * fps).toFixed(2)}),${piece},${expr})`;
  }
  return expr;
}

/**
 * Scale the shot up, then crop a window that eases in and follows the
 * subject. x/y are 0–1 in the source frame.
 */
function subjectZoomFilter(
  frame: { width: number; height: number },
  width: number,
  height: number,
  fps: number,
  focus?: FocusPoint[],
): string[] {
  const zMax = 1.5;
  const cover = Math.max(width / frame.width, height / frame.height);
  const scaledW = even(frame.width * cover * zMax);
  const scaledH = even(frame.height * cover * zMax);
  const points = (focus?.length ? focus : [{ timeSec: 0, x: 0.5, y: 0.38 }]).map(
    (point) => ({
      t: Math.max(0, point.timeSec),
      x: clampUnit(point.x, 0.5),
      y: clampUnit(point.y, 0.38),
    }),
  );
  const xExpr = piecewise(
    points.map((point) => ({ t: point.t, v: point.x })),
    fps,
  );
  const yExpr = piecewise(
    points.map((point) => ({ t: point.t, v: point.y })),
    fps,
  );
  const z = `1.12+0.30*(1-exp(-3.5*n/${fps}))`;
  const winW = `(${width}*${zMax}/(${z}))`;
  const winH = `(${height}*${zMax}/(${z}))`;
  const cropX = `min(max(0,(${xExpr})*${scaledW}-${winW}/2),${scaledW}-${winW})`;
  const cropY = `min(max(0,(${yExpr})*${scaledH}-${winH}*0.42),${scaledH}-${winH})`;
  return [
    '-vf',
    [
      `scale=${scaledW}:${scaledH}:flags=bicubic`,
      `crop=w='trunc(${winW}/2)*2':h='trunc(${winH}/2)*2':x='${cropX}':y='${cropY}'`,
      `scale=${width}:${height}:flags=bicubic`,
      `fps=${fps}`,
      'setsar=1',
    ].join(','),
  ];
}

function assertYoutubeUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid YouTube URL');
  }
  const host = parsed.hostname.replace(/^www\./, '');
  const allowed =
    (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') &&
    (parsed.pathname.startsWith('/watch') ||
      parsed.pathname.startsWith('/shorts/') ||
      host === 'youtu.be');
  if (!allowed) {
    throw new Error('Only public YouTube watch or shorts URLs are supported');
  }
}

async function run(
  command: string,
  args: string[],
  timeout: number,
): Promise<string> {
  try {
    const result = await execFileAsync(command, args, {
      timeout,
      maxBuffer: 20 * 1024 * 1024,
    });
    return result.stdout?.toString() ?? '';
  } catch (error) {
    const err = error as { stderr?: string; message?: string; code?: string };
    if (err.code === 'ENOENT') {
      throw new Error(`${command} is not installed`);
    }
    const detail = (err.stderr || err.message || 'command failed').slice(0, 500);
    throw new Error(`${command} failed: ${detail}`);
  }
}
