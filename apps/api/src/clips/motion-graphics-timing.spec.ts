import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  motionGraphicsSpecSchema,
  type MotionGraphicsSpec,
  type WordTimestamp,
} from '@piwu/shared';
import {
  computeMotionGraphicsTiming,
  END_PAD_SEC,
  lcsAlign,
  normalizeWord,
  SCENE_LEAD_SEC,
  similarWords,
} from './motion-graphics-timing';

const ROOT = join(__dirname, '../../../../docs/motion-graphics/nvidia');
const spec: MotionGraphicsSpec = motionGraphicsSpecSchema.parse(
  JSON.parse(readFileSync(join(ROOT, 'spec.json'), 'utf8')),
);
const reference = JSON.parse(readFileSync(join(ROOT, 'timing.json'), 'utf8')) as {
  cues: Array<[number, number]>;
};

/**
 * Synthetic Whisper output: spread each cue's words over the reference cue
 * window from timing.json, then inject real Whisper mistakes.
 */
function syntheticWhisper(): { words: WordTimestamp[]; cueStarts: number[] } {
  const words: WordTimestamp[] = [];
  const cueStarts: number[] = [];
  spec.cues.forEach(([text], c) => {
    let [start, end] = reference.cues[c];
    if (c === 0) [start, end] = [0.2, 3.3]; // intro cue is [0,0] in the file
    const tokens = text.split(/\s+/).filter(Boolean);
    const step = (end - 0.25 - start) / tokens.length;
    cueStarts.push(start);
    tokens.forEach((word, k) => {
      words.push({
        word,
        start: start + k * step,
        end: start + (k + 0.85) * step,
      });
    });
  });

  const out: WordTimestamp[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const clean = normalizeWord(w.word);
    if (clean === 'nvidia') {
      // Proper noun misheard.
      out.push({ ...w, word: w.word.replace(/Nvidia/i, 'envidia') });
    } else if (clean === 'new' && normalizeWord(words[i + 1]?.word ?? '') === 'york') {
      // Two words merged into one.
      out.push({ word: 'Newyork', start: w.start, end: words[i + 1].end });
      i++;
    } else if (clean === 'empresaria') {
      // One word split into two ("de espacio" for "despacio").
      const mid = (w.start + w.end) / 2;
      out.push({ word: 'empresa', start: w.start, end: mid });
      out.push({ word: 'ria', start: mid, end: w.end });
    } else if (clean === 'huang') {
      out.push({ ...w, word: 'Juan' });
    } else if (clean === 'kress') {
      out.push({ ...w, word: 'Cres,' });
    } else {
      out.push(w);
    }
  }
  return { words: out, cueStarts };
}

describe('normalizeWord / similarWords', () => {
  it('strips accents and punctuation', () => {
    assert.equal(normalizeWord('¿Qué'), 'que');
    assert.equal(normalizeWord('renunció.'), 'renuncio');
  });
  it('treats Whisper spellings of proper nouns as the same word', () => {
    assert.ok(similarWords('nvidia', 'envidia'));
    assert.ok(!similarWords('chips', 'china'));
  });
});

describe('lcsAlign', () => {
  it('keeps order and skips inserted words', () => {
    const pairs = lcsAlign(['a', 'x', 'b', 'c'], ['a', 'b', 'zz', 'c']);
    assert.deepEqual(pairs, [
      [0, 0],
      [2, 1],
      [3, 3],
    ]);
  });
  it('"de espacio" for "despacio" starts at "de"', () => {
    const t = computeMotionGraphicsTiming(
      {
        cues: [
          ['hola', ''],
          ['ve despacio', 'despacio'],
        ],
        scenes: [{ firstCue: 1 } as MotionGraphicsSpec['scenes'][number]],
      },
      [
        { word: 'hola', start: 0, end: 0.4 },
        { word: 'de', start: 1.0, end: 1.2 },
        { word: 'espacio', start: 1.2, end: 1.8 },
      ],
    );
    // "ve" is not heard; it is interpolated just before "de espacio".
    assert.ok(t.cues[1][0] >= 0.4 && t.cues[1][0] <= 1.0, String(t.cues[1][0]));
  });
});

describe('computeMotionGraphicsTiming (Nvidia fixture + Whisper errors)', () => {
  const { words, cueStarts } = syntheticWhisper();
  const timing = computeMotionGraphicsTiming(spec, words);

  it('cue starts land on the real spoken start despite misspellings', () => {
    timing.cues.forEach(([start], c) => {
      assert.ok(
        Math.abs(start - cueStarts[c]) < 0.12,
        `cue ${c} "${spec.cues[c][0]}" start ${start} vs ${cueStarts[c]}`,
      );
    });
  });

  it('scene start = first cue start − 0.15 s', () => {
    spec.scenes.forEach((scene, i) => {
      const expected = cueStarts[scene.firstCue] - SCENE_LEAD_SEC;
      assert.ok(
        Math.abs(timing.scenes[i][0] - expected) < 0.12,
        `scene ${i} start ${timing.scenes[i][0]} vs ${expected}`,
      );
    });
    // Scenes are contiguous.
    for (let i = 1; i < timing.scenes.length; i++) {
      assert.equal(timing.scenes[i][0], timing.scenes[i - 1][1]);
    }
    assert.equal(timing.intro[1], timing.scenes[0][0]);
  });

  it('video ends 1.3 s after the last word', () => {
    const last = words.at(-1)!.end;
    assert.ok(Math.abs(timing.end - (last + END_PAD_SEC)) < 0.002);
    assert.equal(timing.scenes.at(-1)![1], timing.end);
  });

  it('cue end = min(next start − 0.05, last word end + 0.6)', () => {
    for (let c = 0; c < timing.cues.length - 1; c++) {
      const [, end] = timing.cues[c];
      assert.ok(end <= timing.cues[c + 1][0] - 0.05 + 1e-6, `cue ${c} overlaps`);
    }
  });

  it('survives an empty transcript (estimated timing)', () => {
    const fallback = computeMotionGraphicsTiming(spec, []);
    assert.equal(fallback.scenes.length, spec.scenes.length);
    assert.ok(fallback.end > 10);
  });
});
