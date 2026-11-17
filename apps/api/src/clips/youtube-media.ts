import { execFile, spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import {
  detectSocialVideoSource,
  socialSourceLabel,
  type WordTimestamp,
} from '@piwu/shared';
import type { HighlightMoment } from '../ai/anthropic.service';

const execFileAsync = promisify(execFile);
export const MAX_SOURCE_SEC = 30 * 60;

export interface YoutubeDownload {
  dir: string;
  videoPath: string;
  title?: string | null;
  durationSec?: number;
}

export interface SourceDownloadOptions {
  /** Netscape cookies.txt exported from a browser session (YTDLP_COOKIES_FILE). */
  cookiesFile?: string | null;
  /** HTTP/SOCKS proxy for yt-dlp (YTDLP_PROXY). */
  proxy?: string | null;
  /** Raw --extractor-args value (YTDLP_EXTRACTOR_ARGS). */
  extractorArgs?: string | null;
  /** Download progress 0–1. */
  onProgress?: (fraction: number) => void;
}

/** A source problem the user can act on (shown as-is in the UI). */
export class SourceVideoError extends Error {
  constructor(message: string, readonly detail?: string) {
    super(message);
    this.name = 'SourceVideoError';
  }
}

export interface YoutubeSearchResult {
  id: string;
  url: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
  viewCount: number | null;
}

/** YouTube video id from a watch / shorts / youtu.be URL. */
export function youtubeVideoId(url: string | null | undefined): string | null {
  const match = /(?:[?&]v=|youtu\.be\/|\/shorts\/)([\w-]{11})/.exec(url ?? '');
  return match ? match[1] : null;
}

/** Search YouTube with yt-dlp (one request, no downloads). */
export async function searchYoutube(
  query: string,
  limit: number,
  options: Omit<SourceDownloadOptions, 'onProgress'> = {},
): Promise<YoutubeSearchResult[]> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'piwu-search-'));
  try {
    const args = ['--flat-playlist', '-J', '--no-warnings', '--ignore-config'];
    if (options.proxy) args.push('--proxy', options.proxy);
    if (options.extractorArgs) args.push('--extractor-args', options.extractorArgs);
    if (options.cookiesFile) {
      const jar = path.join(dir, 'cookies.txt');
      try {
        await fs.copyFile(options.cookiesFile, jar);
        args.push('--cookies', jar);
      } catch {
        /* missing cookies file: continue without */
      }
    }
    const safeLimit = Math.max(1, Math.min(25, Math.floor(limit)));
    args.push(`ytsearch${safeLimit}:${query.replace(/\s+/g, ' ').trim().slice(0, 150)}`);
    const raw = await run('yt-dlp', args, 90_000);
    const parsed = JSON.parse(raw.trim().split('\n').pop() ?? '{}') as {
      entries?: Array<{
        id?: string;
        title?: string;
        channel?: string;
        uploader?: string;
        duration?: number;
        view_count?: number;
        live_status?: string;
      }>;
    };
    return (parsed.entries ?? [])
      .filter((entry) => entry.id && entry.title && entry.live_status !== 'is_live' && entry.live_status !== 'is_upcoming')
      .map((entry) => ({
        id: entry.id as string,
        url: `https://www.youtube.com/watch?v=${entry.id}`,
        title: entry.title as string,
        channel: entry.channel ?? entry.uploader ?? null,
        durationSec: typeof entry.duration === 'number' ? entry.duration : null,
        viewCount: typeof entry.view_count === 'number' ? entry.view_count : null,
      }));
  } finally {
    await removeDir(dir);
  }
}

/** @deprecated Use downloadSocialVideo — kept for call-site compatibility. */
export async function downloadYoutube(url: string): Promise<YoutubeDownload> {
  return downloadSocialVideo(url);
}

/**
 * Turn yt-dlp stderr into a clear Spanish message with what to do next.
 */
export function explainDownloadError(
  stderr: string,
  source: 'youtube' | 'instagram',
): string {
  const text = stderr.toLowerCase();
  const upload = 'Puedes descargar el video y subirlo como archivo en «Desde video → Subir archivo».';
  if (/not a bot|sign in to confirm you|confirm you.?re not a bot/.test(text)) {
    return `YouTube bloqueó la descarga desde el servidor (verificación anti-bots). ${upload} Para que los links vuelvan a funcionar, el administrador puede configurar cookies de YouTube en el servidor (YTDLP_COOKIES_FILE).`;
  }
  if (/confirm your age|age.restricted|inappropriate for some users/.test(text)) {
    return `El video tiene restricción de edad y no se puede descargar sin sesión. ${upload}`;
  }
  if (/private video|this video is private|is private/.test(text)) {
    return 'El video es privado. Solo se pueden usar videos públicos.';
  }
  if (/members.only|join this channel|available to this channel.s members/.test(text)) {
    return `El video es solo para miembros del canal. ${upload}`;
  }
  if (/premiere|live event will begin|is_upcoming|this live event/.test(text)) {
    return 'El video es un estreno o directo que aún no termina. Inténtalo cuando esté publicado completo.';
  }
  if (/http error 429|too many requests/.test(text)) {
    return `${source === 'instagram' ? 'Instagram' : 'YouTube'} está limitando las descargas del servidor (demasiadas solicitudes). Prueba en unos minutos. ${upload}`;
  }
  if (source === 'instagram' && /login required|rate.limit|not available|empty media response|unable to extract/.test(text)) {
    return `Instagram pidió iniciar sesión para este reel (pasa con frecuencia desde servidores). ${upload}`;
  }
  if (/video unavailable|video is unavailable|has been removed|no longer available|does not exist|not available in your country|geo.?restrict/.test(text)) {
    return 'El video no está disponible (eliminado, bloqueado en la región del servidor o con link incorrecto).';
  }
  if (/unsupported url/.test(text)) {
    return 'El link no es un video de YouTube o Instagram compatible.';
  }
  return `No se pudo descargar el video de ${source === 'instagram' ? 'Instagram' : 'YouTube'}. ${upload}`;
}

/** Download a public YouTube or Instagram video via yt-dlp. */
export async function downloadSocialVideo(
  url: string,
  options: SourceDownloadOptions = {},
): Promise<YoutubeDownload> {
  const source = assertSocialVideoUrl(url);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'piwu-social-'));
  try {
    // YouTube's "n" challenge is solved with Deno (installed in the image, on by
    // default in yt-dlp); the yt-dlp_linux build bundles the EJS solver scripts.
    const common = ['--no-playlist', '--no-warnings', '--ignore-config'];
    if (options.proxy) common.push('--proxy', options.proxy);
    if (options.extractorArgs) common.push('--extractor-args', options.extractorArgs);
    if (options.cookiesFile) {
      // yt-dlp rewrites the cookie jar: work on a copy so the mounted file stays intact.
      const jar = path.join(dir, 'cookies.txt');
      try {
        await fs.copyFile(options.cookiesFile, jar);
        common.push('--cookies', jar);
      } catch {
        /* missing cookies file: continue without */
      }
    }

    // 1. One metadata request; the download reuses it (--load-info-json), so
    //    the site is queried once instead of twice.
    let infoRaw: string;
    try {
      infoRaw = await run('yt-dlp', [...common, '--dump-single-json', url], 120_000);
    } catch (error) {
      const detail = (error as Error).message;
      throw new SourceVideoError(explainDownloadError(detail, source), detail);
    }
    let info: {
      duration?: number;
      title?: string;
      is_live?: boolean;
      live_status?: string;
    };
    try {
      info = JSON.parse(infoRaw.trim().split('\n').pop() ?? '{}');
    } catch {
      throw new SourceVideoError('No se pudo leer la información del video.');
    }
    if (info.is_live || info.live_status === 'is_live' || info.live_status === 'is_upcoming') {
      throw new SourceVideoError(
        'El video es un directo o estreno en curso. Inténtalo cuando esté publicado completo.',
      );
    }
    const duration = Number(info.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new SourceVideoError('No se pudo leer la duración del video.');
    }
    if (duration > MAX_SOURCE_SEC) {
      throw new SourceVideoError(
        `El video dura ${Math.round(duration / 60)} min; el máximo es ${MAX_SOURCE_SEC / 60} min. Recórtalo y súbelo como archivo.`,
      );
    }
    const infoPath = path.join(dir, 'info.json');
    await fs.writeFile(infoPath, infoRaw);

    // 2. Download (≤720p is plenty for a 1080×1920 crop of a talking head).
    const template = path.join(dir, 'source.%(ext)s');
    // Prefer H.264 at <=30 fps: AV1/VP9 60 fps is several times slower to decode
    // on the 1 vCPU server and made 60 s cuts time out.
    const format = [
      'bv*[height<=720][fps<=30][vcodec^=avc1]+ba',
      'bv*[height<=720][vcodec^=avc1]+ba',
      'bv*[height<=720][fps<=30]+ba',
      'bv*[height<=720]+ba',
      'b[height<=720]',
      'b',
    ].join('/');
    try {
      await runWithProgress(
        'yt-dlp',
        [
          ...common,
          '--load-info-json',
          infoPath,
          '-f',
          format,
          '--merge-output-format',
          'mp4',
          '--newline',
          '--progress-template',
          'download:PIWU %(progress._percent_str)s',
          '-o',
          template,
        ],
        15 * 60_000,
        progressParser(format.includes('+'), options.onProgress),
      );
    } catch (error) {
      const detail = (error as Error).message;
      throw new SourceVideoError(explainDownloadError(detail, source), detail);
    }
    const files = await fs.readdir(dir);
    const videoName = files.find(
      (file) => file.startsWith('source.') && !/\.(part|ytdl|json)$/.test(file),
    );
    if (!videoName) {
      throw new SourceVideoError('La descarga terminó sin producir un archivo de video.');
    }
    return {
      dir,
      videoPath: path.join(dir, videoName),
      title: info.title ?? null,
      durationSec: duration,
    };
  } catch (error) {
    await removeDir(dir);
    throw error;
  }
}

/**
 * Parses "PIWU 42.3%" lines. With separate video+audio streams yt-dlp runs
 * two downloads (0→100 twice): count them so progress stays monotonic.
 */
export function progressParser(
  twoStreams: boolean,
  onProgress?: (fraction: number) => void,
): (line: string) => void {
  let phase = 0;
  let last = 0;
  let reported = 0;
  return (line: string) => {
    const match = /PIWU\s+([\d.]+)%/.exec(line);
    if (!match || !onProgress) return;
    const pct = Number(match[1]);
    if (!Number.isFinite(pct)) return;
    if (twoStreams && pct + 30 < last && last > 90) phase = Math.min(1, phase + 1);
    last = pct;
    // The video stream is most of the bytes: weight it 90/10.
    const weighted = twoStreams
      ? phase === 0
        ? (pct / 100) * 0.9
        : 0.9 + (pct / 100) * 0.1
      : pct / 100;
    if (weighted >= reported + 0.02 || weighted >= 1) {
      reported = weighted;
      onProgress(Math.min(1, weighted));
    }
  };
}

/** Update the yt-dlp binary in place (sites change often; stale builds break). */
export async function updateYtDlp(): Promise<string> {
  const out = await run('yt-dlp', ['-U'], 120_000);
  return out.trim().split('\n').pop() ?? '';
}

/** Validate an uploaded file: has a video stream; returns duration/size. */
export async function probeUploadedVideo(
  filePath: string,
): Promise<{ durationSec: number; width: number; height: number }> {
  let raw: string;
  try {
    raw = await run(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', filePath],
      60_000,
    );
  } catch {
    throw new SourceVideoError('El archivo no es un video válido.');
  }
  const parsed = JSON.parse(raw) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
  };
  const video = parsed.streams?.find((stream) => stream.codec_type === 'video' && stream.width);
  const hasAudio = parsed.streams?.some((stream) => stream.codec_type === 'audio');
  const durationSec = Number(parsed.format?.duration);
  if (!video) throw new SourceVideoError('El archivo no tiene pista de video.');
  if (!hasAudio) throw new SourceVideoError('El video no tiene audio: hace falta voz para elegir los mejores momentos.');
  if (!Number.isFinite(durationSec) || durationSec < 5) {
    throw new SourceVideoError('El video es demasiado corto.');
  }
  if (durationSec > MAX_SOURCE_SEC) {
    throw new SourceVideoError(`El video dura ${Math.round(durationSec / 60)} min; el máximo es ${MAX_SOURCE_SEC / 60} min.`);
  }
  return { durationSec, width: video.width ?? 0, height: video.height ?? 0 };
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
  gapSec = 0.8,
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
      // Whisper word edges are approximate: keep some air so words are not clipped.
      startSec: Math.max(startSec, group[0].start - 0.12),
      endSec: Math.min(endSec, group[group.length - 1].end + 0.2),
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
    const audioPath = await encodeMp3(cut.audioPath, path.join(input.dir, `cut-${input.index}.mp3`));
    const durationSec = (await mediaDuration(cut.videoPath)) || cut.durationSec;
    return { ...cut, audioPath, durationSec, words: plan.words };
  }

  const videos: string[] = [];
  const audios: string[] = [];
  const cutDurations: number[] = [];
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
    cutDurations.push(cut.durationSec);
  }

  const videoPath = await concatCopy(
    input.dir,
    videos,
    `cut-${input.index}.mp4`,
  );
  // PCM pieces join without encoder padding, so audio stays locked to the video;
  // the mp3 is encoded once at the end.
  const wavPath = await concatCopy(input.dir, audios, `cut-${input.index}.wav`);
  const audioPath = await encodeMp3(wavPath, path.join(input.dir, `cut-${input.index}.mp3`));
  const durationSec = (await mediaDuration(videoPath)) || cutDurations.reduce((a, b) => a + b, 0);
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
  // Whole frames, so the video piece and its audio piece have the exact same length.
  const frames = Math.max(
    1,
    Math.round(Math.max(0.2, input.moment.endSec - input.moment.startSec) * input.fps),
  );
  const durationSec = frames / input.fps;
  const stem = input.stem ?? `cut-${input.index}`;
  const videoOut = path.join(input.dir, `${stem}.mp4`);
  const audioOut = path.join(input.dir, `${stem}.wav`);
  const frame = await videoFrameSize(input.videoPath);
  const videoFilter = frame
    ? subjectZoomFilter(frame, input.width, input.height, input.fps, input.focus)
    : [
        '-vf',
        `scale=${input.width}:${input.height}:force_original_aspect_ratio=increase,crop=${input.width}:${input.height},fps=${input.fps},setsar=1`,
      ];
  await run(
    'ffmpeg',
    [
      '-y',
      '-ss',
      input.moment.startSec.toFixed(3),
      '-i',
      input.videoPath,
      ...videoFilter,
      '-frames:v',
      String(frames),
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
    cutTimeoutMs(durationSec),
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
      durationSec.toFixed(6),
      '-vn',
      '-ac',
      '1',
      '-ar',
      '44100',
      '-c:a',
      'pcm_s16le',
      // pad short audio with silence, then cut to the exact video length
      '-af',
      `apad,atrim=end=${durationSec.toFixed(6)}`,
      audioOut,
    ],
    cutTimeoutMs(durationSec),
  );
  return { videoPath: videoOut, audioPath: audioOut, durationSec };
}

/** Re-encoding 1080x1920 on a 1 vCPU box can run slower than realtime. */
function cutTimeoutMs(durationSec: number): number {
  return Math.max(3 * 60_000, Math.ceil(durationSec * 12_000));
}

async function encodeMp3(input: string, output: string): Promise<string> {
  await run(
    'ffmpeg',
    ['-y', '-i', input, '-ac', '1', '-ar', '44100', '-b:a', '128k', output],
    120_000,
  );
  return output;
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

function assertSocialVideoUrl(url: string): 'youtube' | 'instagram' {
  const source = detectSocialVideoSource(url);
  if (!source) {
    throw new Error(
      'Only public YouTube (watch/shorts) or Instagram (reel/post) URLs are supported',
    );
  }
  return source;
}

/** Grab a JPEG poster frame from an MP4 buffer for library covers. */
export async function extractPosterJpeg(
  videoBuffer: Buffer,
  seekSec = 0.4,
): Promise<Buffer> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'piwu-poster-'));
  const inputPath = path.join(dir, 'in.mp4');
  const outputPath = path.join(dir, 'cover.jpg');
  try {
    await fs.writeFile(inputPath, videoBuffer);
    await run(
      'ffmpeg',
      [
        '-y',
        '-ss',
        String(seekSec),
        '-i',
        inputPath,
        '-frames:v',
        '1',
        '-q:v',
        '3',
        outputPath,
      ],
      60_000,
    );
    return await fs.readFile(outputPath);
  } finally {
    await removeDir(dir);
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
    const err = error as {
      stderr?: string;
      message?: string;
      code?: string;
      killed?: boolean;
      signal?: string;
    };
    if (err.code === 'ENOENT') {
      throw new Error(`${command} is not installed`);
    }
    if (err.killed && err.signal === 'SIGTERM') {
      throw new Error(`${command} timed out after ${Math.round(timeout / 1000)} s`);
    }
    // ffmpeg prints a long banner first; the actual error is at the end.
    const detail = (err.stderr || err.message || 'command failed').trim().slice(-800);
    throw new Error(`${command} failed: ${detail}`);
  }
}

/** Like run(), streaming stdout lines to `onLine` (for progress). */
function runWithProgress(
  command: string,
  args: string[],
  timeout: number,
  onLine: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let buffer = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${command} timed out`));
    }, timeout);
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n|\r/);
      buffer = lines.pop() ?? '';
      for (const line of lines) onLine(line);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(new Error(error.code === 'ENOENT' ? `${command} is not installed` : error.message));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${command} failed: ${stderr.slice(-500) || `exit ${code}`}`));
    });
  });
}
