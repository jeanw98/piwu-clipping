import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { WordTimestamp } from '@piwu/shared';
import { fitHighlightWindow, sentenceEndTimes, transcriptLines } from './highlight-fit';

/** Words every 0.4s; a 1s pause after index 24 and 49 (sentence ends). */
function speech(count: number): WordTimestamp[] {
  const words: WordTimestamp[] = [];
  let t = 0;
  for (let i = 0; i < count; i++) {
    words.push({ word: `w${i}`, start: t, end: t + 0.3 });
    t += i === 24 || i === 49 ? 1.3 : 0.4;
  }
  return words;
}

describe('fitHighlightWindow', () => {
  const words = speech(80);
  const mediaEnd = words[words.length - 1].end;

  it('respects the requested end and snaps it to the sentence end', () => {
    const sentenceEnds = [words[24].end, words[49].end];
    const fit = fitHighlightWindow(words, 0, words[23].end, {
      targetSeconds: 15,
      minLen: 6,
      mediaEnd,
      sentenceEnds,
    })!;
    assert.ok(Math.abs(fit.endSec - (words[24].end + 0.25)) < 0.01, `end ${fit.endSec}`);
    assert.equal(fit.startSec, 0);
  });

  it('never ends mid-word and stays within target + 2s', () => {
    const fit = fitHighlightWindow(words, 3.05, 40, { targetSeconds: 10, minLen: 5, mediaEnd })!;
    const startWord = words.find((w) => w.end > 3.07)!;
    assert.ok(fit.endSec - startWord.start <= 12.3);
    const inside = words.some((w) => w.start < fit.endSec - 0.01 && w.end > fit.endSec + 0.01);
    assert.equal(inside, false);
  });

  it('adds a lead-in without eating the previous word', () => {
    const fit = fitHighlightWindow(words, words[10].start, null, { targetSeconds: 8, minLen: 4, mediaEnd })!;
    assert.ok(fit.startSec >= words[9].end - 1e-9);
    assert.ok(fit.startSec < words[10].start);
  });

  it('returns null past the end of speech', () => {
    assert.equal(fitHighlightWindow(words, mediaEnd + 5, null, { targetSeconds: 8, minLen: 4, mediaEnd }), null);
  });
});

describe('transcript helpers', () => {
  it('detects sentence ends from punctuated segments', () => {
    assert.deepEqual(
      sentenceEndTimes([
        { start: 0, end: 2, text: 'Hola a todos y' },
        { start: 2, end: 4, text: 'bienvenidos.' },
        { start: 4, end: 6, text: '¿Sabías esto?' },
      ]),
      [4, 6],
    );
  });

  it('thins long transcripts evenly instead of cutting the end', () => {
    const segments = Array.from({ length: 400 }, (_, i) => ({ start: i * 5, end: i * 5 + 4, text: `Frase número ${i} con texto.` }));
    const text = transcriptLines([], segments, 4000);
    assert.ok(text.length <= 4200);
    assert.match(text, /\[19\d\d\./); // still reaches the last part of the video
  });
});
