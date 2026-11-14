import type {
  MotionGraphicsSpec,
  MotionGraphicsTiming,
  WordTimestamp,
} from '@piwu/shared';

/**
 * Motion Graphics timing from word timestamps (Whisper / ElevenLabs).
 *
 * We never count words: transcripts spell proper nouns differently
 * ("envidia" for "Nvidia") and merge/split words ("de espacio" for
 * "despacio"). Instead we run a word-level LCS (difflib-style) with fuzzy
 * equality, then interpolate any unmatched script words inside the time
 * span of their unmatched transcript neighbours.
 */

export const SCENE_LEAD_SEC = 0.15;
export const END_PAD_SEC = 1.3;
export const CUE_GAP_SEC = 0.05;
export const CUE_HOLD_SEC = 0.6;

export function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ]/g, '');
}

function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normalizeWord)
    .filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Equal, or close enough to be the same spoken word ("nvidia"/"envidia"). */
export function similarWords(a: string, b: string): boolean {
  if (a === b) return true;
  const longest = Math.max(a.length, b.length);
  if (longest < 4) return false;
  return 1 - levenshtein(a, b) / longest >= 0.7;
}

/**
 * LCS over normalized tokens. Returns pairs [scriptIndex, transcriptIndex]
 * in increasing order.
 */
export function lcsAlign(script: string[], heard: string[]): Array<[number, number]> {
  const n = script.length;
  const m = heard.length;
  // Exact matches score slightly higher than fuzzy ones so ties prefer them.
  const dp: Float64Array[] = Array.from(
    { length: n + 1 },
    () => new Float64Array(m + 1),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const score =
        script[i] === heard[j] ? 1 : similarWords(script[i], heard[j]) ? 0.9 : 0;
      dp[i][j] = Math.max(
        dp[i + 1][j],
        dp[i][j + 1],
        score > 0 ? dp[i + 1][j + 1] + score : 0,
      );
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const score =
      script[i] === heard[j] ? 1 : similarWords(script[i], heard[j]) ? 0.9 : 0;
    if (score > 0 && Math.abs(dp[i][j] - (dp[i + 1][j + 1] + score)) < 1e-9) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

/** Start/end time for every script token. */
export function timeScriptTokens(
  script: string[],
  words: WordTimestamp[],
): Array<{ start: number; end: number }> {
  const heard = words.map((w) => normalizeWord(w.word));
  const keep = heard
    .map((token, index) => ({ token, index }))
    .filter((item) => item.token);
  const pairs = lcsAlign(
    script,
    keep.map((item) => item.token),
  ).map(([s, k]) => [s, keep[k].index] as [number, number]);

  const out: Array<{ start: number; end: number } | null> = script.map(
    () => null,
  );
  const matchedHeard = new Set(pairs.map(([, h]) => h));
  for (const [s, h] of pairs) {
    let start = words[h].start;
    let end = words[h].end;
    // Split words: "de espacio" heard for "despacio" → take both pieces.
    const prev = h - 1;
    if (
      prev >= 0 &&
      !matchedHeard.has(prev) &&
      heard[prev] + heard[h] === script[s]
    ) {
      start = words[prev].start;
    }
    const next = h + 1;
    if (
      next < words.length &&
      !matchedHeard.has(next) &&
      heard[h] + heard[next] === script[s]
    ) {
      end = words[next].end;
    }
    out[s] = { start, end };
  }

  // Fill gaps between anchors proportionally to token length.
  const anchors: Array<[number, number]> = [[-1, -1], ...pairs, [script.length, words.length]];
  for (let a = 0; a < anchors.length - 1; a++) {
    const [s0, h0] = anchors[a];
    const [s1, h1] = anchors[a + 1];
    if (s1 - s0 <= 1) continue;
    const spanStart =
      h0 + 1 < words.length && h0 + 1 < h1
        ? words[h0 + 1].start
        : h0 >= 0
          ? words[h0].end
          : (words[0]?.start ?? 0);
    const spanEnd =
      h1 - 1 > h0 && h1 - 1 >= 0
        ? words[h1 - 1].end
        : h1 < words.length
          ? words[h1].start
          : (words.at(-1)?.end ?? spanStart);
    const gap = script.slice(s0 + 1, s1);
    const total = gap.reduce((sum, t) => sum + Math.max(1, t.length), 0);
    let cursor = spanStart;
    const span = Math.max(0, spanEnd - spanStart);
    gap.forEach((token, k) => {
      const dur = (span * Math.max(1, token.length)) / total;
      out[s0 + 1 + k] = { start: cursor, end: cursor + dur };
      cursor += dur;
    });
  }
  return out.map((item) => item ?? { start: 0, end: 0 });
}

const round = (v: number) => Math.round(v * 1000) / 1000;

export function computeMotionGraphicsTiming(
  spec: Pick<MotionGraphicsSpec, 'cues' | 'scenes'>,
  words: WordTimestamp[],
): MotionGraphicsTiming {
  const tokens: string[] = [];
  const cueOf: number[] = [];
  spec.cues.forEach(([text], cueIndex) => {
    for (const token of tokenize(text)) {
      tokens.push(token);
      cueOf.push(cueIndex);
    }
  });
  const timed = words.length
    ? timeScriptTokens(tokens, words)
    : tokens.map((_, i) => ({ start: i * 0.35, end: i * 0.35 + 0.33 }));

  const firstWord: number[] = spec.cues.map(() => -1);
  const lastWord: number[] = spec.cues.map(() => -1);
  cueOf.forEach((cue, index) => {
    if (firstWord[cue] < 0) firstWord[cue] = index;
    lastWord[cue] = index;
  });

  const lastSpoken = Math.max(
    words.at(-1)?.end ?? 0,
    timed.at(-1)?.end ?? 0,
  );
  const end = round(lastSpoken + END_PAD_SEC);

  // Cue starts (monotonic; empty cues inherit previous end).
  const starts: number[] = [];
  const lastEnds: number[] = [];
  spec.cues.forEach((_, c) => {
    const prevStart = c > 0 ? starts[c - 1] : 0;
    const s = firstWord[c] >= 0 ? timed[firstWord[c]].start : prevStart;
    starts.push(Math.max(prevStart, s));
    lastEnds.push(lastWord[c] >= 0 ? timed[lastWord[c]].end : starts[c]);
  });
  const cues: Array<[number, number]> = spec.cues.map((_, c) => {
    const next = c + 1 < starts.length ? starts[c + 1] - CUE_GAP_SEC : end;
    const stop = Math.min(next, lastEnds[c] + CUE_HOLD_SEC);
    return [round(starts[c]), round(Math.max(starts[c] + 0.1, stop))];
  });

  const sceneStarts = spec.scenes.map((scene) =>
    Math.max(0, (starts[scene.firstCue] ?? 0) - SCENE_LEAD_SEC),
  );
  const scenes: Array<[number, number]> = sceneStarts.map((s, i) => [
    round(s),
    round(i + 1 < sceneStarts.length ? sceneStarts[i + 1] : end),
  ]);
  const introEnd = scenes[0]?.[0] ?? Math.min(3, end);

  return {
    intro: [0, round(introEnd)],
    scenes,
    cues,
    end,
  };
}
