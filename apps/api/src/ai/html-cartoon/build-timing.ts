import type { WordTimestamp } from '@piwu/shared';

export interface HtmlCartoonTiming {
  /** Real speech scene ranges [start, end] seconds */
  sc: [number, number][];
  /** Caption cue ranges [start, end] seconds (one per short phrase) */
  cues: [number, number][];
  /** Cue texts + yellow keyword */
  cueTexts: Array<{ text: string; highlight: string }>;
  end: number;
}

export interface TimingSceneInput {
  narration: string;
  startSec?: number;
  endSec?: number;
  durationSec: number;
}

const LEAD_IN = 0.15;

function tokenize(text: string): string[] {
  return text
    .normalize('NFKC')
    .replace(/[“”]/g, '"')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

/** Split narration into short cues (2–6 words) with a highlight keyword. */
export function narrationToCues(
  narration: string,
): Array<{ text: string; highlight: string }> {
  const words = tokenize(narration);
  if (!words.length) return [];
  const cues: Array<{ text: string; highlight: string }> = [];
  let i = 0;
  while (i < words.length) {
    const remaining = words.length - i;
    const take = Math.min(
      6,
      Math.max(2, remaining <= 3 ? remaining : Math.min(4, remaining)),
    );
    const slice = words.slice(i, i + take);
    const text = slice.join(' ');
    // Prefer a content word near the end as highlight
    const highlight =
      [...slice].reverse().find((w) => w.replace(/[^\p{L}\p{N}]/gu, '').length > 2) ??
      slice[slice.length - 1];
    cues.push({ text, highlight: highlight.replace(/[^\p{L}\p{N}\s]/gu, '') });
    i += take;
  }
  return cues;
}

/**
 * Build timing.json-equivalent from Whisper words + scenes.
 * Scene starts lead voice by LEAD_IN seconds (clamped to 0).
 */
export function buildHtmlCartoonTiming(input: {
  scenes: TimingSceneInput[];
  words: WordTimestamp[];
  durationSec: number;
}): HtmlCartoonTiming {
  const { scenes, words, durationSec } = input;
  const end = Math.max(
    durationSec,
    words.at(-1)?.end ?? 0,
    scenes.at(-1)?.endSec ?? 0,
  );

  // Prefer scene start/end already aligned by processor
  const sc: [number, number][] = scenes.map((scene, index) => {
    const start = Math.max(
      0,
      (scene.startSec ?? 0) - (index === 0 ? 0 : LEAD_IN),
    );
    const finish = scene.endSec ?? start + scene.durationSec;
    return [Math.round(start * 100) / 100, Math.round(finish * 100) / 100];
  });

  // Ensure contiguous non-overlapping ranges covering [0, end]
  if (sc.length) {
    sc[0][0] = 0;
    for (let i = 1; i < sc.length; i++) {
      sc[i][0] = sc[i - 1][1];
    }
    sc[sc.length - 1][1] = Math.max(sc[sc.length - 1][1], end);
  } else {
    sc.push([0, end]);
  }

  const cueTexts: Array<{ text: string; highlight: string }> = [];
  for (const scene of scenes) {
    cueTexts.push(...narrationToCues(scene.narration));
  }
  if (!cueTexts.length && words.length) {
    const all = words.map((w) => w.word).join(' ');
    cueTexts.push(...narrationToCues(all));
  }

  // Map cues onto word timeline by sequential word count
  const cues: [number, number][] = [];
  let wordIdx = 0;
  for (const cue of cueTexts) {
    const n = Math.max(1, tokenize(cue.text).length);
    if (!words.length) {
      const slot = end / Math.max(1, cueTexts.length);
      const i = cues.length;
      cues.push([
        Math.round(i * slot * 100) / 100,
        Math.round((i + 1) * slot * 100) / 100,
      ]);
      continue;
    }
    const startWord = words[Math.min(wordIdx, words.length - 1)];
    const endWord =
      words[Math.min(wordIdx + n - 1, words.length - 1)] ?? startWord;
    wordIdx += n;
    cues.push([
      Math.round(startWord.start * 100) / 100,
      Math.round(Math.max(endWord.end, startWord.start + 0.2) * 100) / 100,
    ]);
  }

  return { sc, cues, cueTexts, end: Math.round(end * 100) / 100 };
}

/** Serialize timing for injection into the HTML runtime. */
export function timingToInjectPayload(timing: HtmlCartoonTiming): {
  sc: [number, number][];
  cues: [number, number][];
  cueTexts: Array<{ text: string; highlight: string }>;
  end: number;
} {
  return {
    sc: timing.sc,
    cues: timing.cues,
    cueTexts: timing.cueTexts,
    end: timing.end,
  };
}

export function injectTimingIntoHtml(
  html: string,
  timing: HtmlCartoonTiming,
): string {
  const payload = JSON.stringify(timingToInjectPayload(timing));
  const boot = `
<script>
(function(){
  var tm = ${payload};
  if (typeof window.__PIWU_INJECT_TIMING === 'function') {
    window.__PIWU_INJECT_TIMING(tm);
  } else {
    window.__PIWU_PENDING_TIMING = tm;
  }
})();
</script>`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${boot}</body>`);
  }
  return `${html}\n${boot}`;
}
