import type { WordTimestamp } from '@piwu/shared';
import type { TranscriptSegment } from './whisper.service';

/**
 * Times (sec) where a sentence ends: Whisper segment ends whose text closes
 * with . ? ! … (segments without final punctuation are mid-sentence).
 */
export function sentenceEndTimes(segments: TranscriptSegment[]): number[] {
  return segments
    .filter((segment) => /[.?!…。？！]["»”')\]]*$/.test(segment.text.trim()))
    .map((segment) => segment.end)
    .sort((a, b) => a - b);
}

/** Transcript lines for the model: punctuated segments when available. */
/** Loudness thresholds (dB): top 10% windows = loud, top 2% = very loud (screams are rare peaks). */
export function loudnessThresholds(energy: Array<{ db: number }>): { loud: number; veryLoud: number } | null {
  const levels = energy.map((sample) => sample.db).filter((db) => db > -60).sort((a, b) => a - b);
  if (levels.length < 20) return null;
  const at = (q: number) => levels[Math.min(levels.length - 1, Math.floor(levels.length * q))];
  const loud = at(0.9);
  const veryLoud = at(0.98);
  // Flat audio (music bed, heavily compressed stream): peaks are meaningless.
  if (veryLoud - at(0.5) < 5) return null;
  return { loud, veryLoud };
}

/** " [LOUD]" / " [VERY LOUD]" for a time range, from the loudest window in it. */
function loudTag(
  energy: Array<{ t: number; db: number }>,
  limits: { loud: number; veryLoud: number } | null,
  start: number,
  end: number,
): string {
  if (!limits) return '';
  let peak = -90;
  for (const sample of energy) {
    if (sample.t >= start - 0.25 && sample.t <= end) peak = Math.max(peak, sample.db);
  }
  return peak >= limits.veryLoud ? ' [VERY LOUD]' : peak >= limits.loud ? ' [LOUD]' : '';
}

/**
 * Loud stretches with no transcript line (screams, laughter, explosions): the
 * picker cannot see them otherwise.
 */
export function silentPeaks(
  energy: Array<{ t: number; db: number }>,
  lines: Array<{ start: number; end: number }>,
  limit = 20,
): string[] {
  const limits = loudnessThresholds(energy);
  if (!limits) return [];
  const peaks = energy
    .filter((sample) => sample.db >= limits.veryLoud)
    .filter((sample) => !lines.some((line) => sample.t >= line.start - 0.3 && sample.t <= line.end + 0.3))
    .sort((a, b) => b.db - a.db);
  const picked: number[] = [];
  for (const peak of peaks) {
    if (picked.length >= limit) break;
    if (picked.every((t) => Math.abs(t - peak.t) > 4)) picked.push(peak.t);
  }
  return picked.sort((a, b) => a - b).map((t) => t.toFixed(1));
}

export function transcriptLines(
  words: WordTimestamp[],
  segments: TranscriptSegment[],
  maxChars = 60_000,
  energy: Array<{ t: number; db: number }> = [],
): string {
  const limits = loudnessThresholds(energy);
  const lines: string[] = [];
  if (segments.length) {
    for (const segment of segments) {
      if (!segment.text) continue;
      lines.push(
        `[${segment.start.toFixed(1)}-${segment.end.toFixed(1)}]${loudTag(energy, limits, segment.start, segment.end)} ${segment.text}`,
      );
    }
  } else {
    let bucket: WordTimestamp[] = [];
    for (const word of words) {
      if (bucket.length && word.start - bucket[0].start > 8) {
        lines.push(
          `[${bucket[0].start.toFixed(1)}-${bucket[bucket.length - 1].end.toFixed(1)}]${loudTag(energy, limits, bucket[0].start, bucket[bucket.length - 1].end)} ${bucket.map((w) => w.word).join(' ')}`,
        );
        bucket = [];
      }
      bucket.push(word);
    }
    if (bucket.length) {
      lines.push(
        `[${bucket[0].start.toFixed(1)}-${bucket[bucket.length - 1].end.toFixed(1)}]${loudTag(energy, limits, bucket[0].start, bucket[bucket.length - 1].end)} ${bucket.map((w) => w.word).join(' ')}`,
      );
    }
  }
  const text = lines.join('\n');
  if (text.length <= maxChars) return text;
  // Too long: keep every line but thin the middle evenly instead of cutting the end.
  const keep = Math.max(1, Math.floor(lines.length * (maxChars / text.length)));
  const step = lines.length / keep;
  const sampled: string[] = [];
  for (let i = 0; i < keep; i++) sampled.push(lines[Math.floor(i * step)]);
  return sampled.join('\n');
}

export interface FitOptions {
  targetSeconds: number;
  minLen: number;
  mediaEnd: number;
  sentenceEnds?: number[];
}

/**
 * Snap a requested [start, end] window onto real speech:
 * - starts on a word (with a short lead-in that never eats the previous word);
 * - ends on the model's requested end when sensible, preferring a sentence
 *   end or a clear pause near it, never mid-word; length within
 *   [minLen, target + 2].
 */
export function fitHighlightWindow(
  words: WordTimestamp[],
  requestedStart: number,
  requestedEnd: number | null,
  options: FitOptions,
): { startSec: number; endSec: number } | null {
  const { targetSeconds, minLen, mediaEnd } = options;
  const startIndex = words.findIndex((word) => word.end > Math.max(0, requestedStart) + 0.02);
  if (startIndex < 0) return null;
  const first = words[startIndex];
  const prevEnd = startIndex > 0 ? words[startIndex - 1].end : 0;
  const startSec = Math.max(0, prevEnd, first.start - 0.12);

  const maxEnd = Math.min(mediaEnd, first.start + targetSeconds + 2);
  const minEnd = first.start + Math.min(minLen, Math.max(1, mediaEnd - first.start));
  const desired =
    requestedEnd != null && Number.isFinite(requestedEnd) && requestedEnd > first.start + 1
      ? Math.min(maxEnd, Math.max(minEnd, requestedEnd))
      : Math.min(maxEnd, first.start + targetSeconds);

  const ends = new Set((options.sentenceEnds ?? []).map((t) => Math.round(t * 10)));
  const isSentenceEnd = (word: WordTimestamp) =>
    [-1, 0, 1, 2].some((d) => ends.has(Math.round(word.end * 10) + d)) || /[.?!…]$/.test(word.word.trim());

  let best: { index: number; cost: number } | null = null;
  let fallback: { index: number; cost: number } | null = null;
  for (let i = startIndex; i < words.length; i++) {
    const word = words[i];
    if (word.end > maxEnd + 0.01) break;
    if (word.end < minEnd - 0.01) continue;
    const gapAfter = i + 1 < words.length ? words[i + 1].start - word.end : 9;
    const distance = Math.abs(word.end - desired);
    if (!fallback || distance < fallback.cost) fallback = { index: i, cost: distance };
    const boundary = isSentenceEnd(word) ? 0 : gapAfter >= 0.6 ? 1.5 : null;
    if (boundary == null) continue;
    const cost = distance + boundary;
    if (!best || cost < best.cost) best = { index: i, cost };
  }
  const pick = best ?? fallback;
  if (!pick || pick.index - startIndex + 1 < 4) return null;
  const last = words[pick.index];
  const nextStart = pick.index + 1 < words.length ? words[pick.index + 1].start : mediaEnd;
  const endSec = Math.min(mediaEnd, Math.max(last.end, Math.min(nextStart, last.end + 0.25)));
  if (endSec - startSec < Math.min(minLen, mediaEnd - startSec) - 0.01) return null;
  return { startSec, endSec };
}
