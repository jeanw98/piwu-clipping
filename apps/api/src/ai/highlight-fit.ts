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
export function transcriptLines(
  words: WordTimestamp[],
  segments: TranscriptSegment[],
  maxChars = 60_000,
): string {
  const lines: string[] = [];
  if (segments.length) {
    for (const segment of segments) {
      if (!segment.text) continue;
      lines.push(`[${segment.start.toFixed(1)}-${segment.end.toFixed(1)}] ${segment.text}`);
    }
  } else {
    let bucket: WordTimestamp[] = [];
    for (const word of words) {
      if (bucket.length && word.start - bucket[0].start > 8) {
        lines.push(
          `[${bucket[0].start.toFixed(1)}-${bucket[bucket.length - 1].end.toFixed(1)}] ${bucket.map((w) => w.word).join(' ')}`,
        );
        bucket = [];
      }
      bucket.push(word);
    }
    if (bucket.length) {
      lines.push(
        `[${bucket[0].start.toFixed(1)}-${bucket[bucket.length - 1].end.toFixed(1)}] ${bucket.map((w) => w.word).join(' ')}`,
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
