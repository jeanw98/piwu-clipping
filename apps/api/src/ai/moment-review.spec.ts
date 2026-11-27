import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { consensusCam, parseMomentReview, selectReviewed } from './moment-review';
import { loudnessThresholds, silentPeaks, transcriptLines } from './highlight-fit';

const cam = { x: 0.02, y: 0.6, w: 0.25, h: 0.35 };

describe('consensusCam', () => {
  it('takes the median box when most frames agree', () => {
    const boxes = [cam, { ...cam, x: 0.03 }, { ...cam, y: 0.61 }, null];
    const result = consensusCam(boxes, 4);
    assert.ok(result);
    assert.equal(result.x, 0.02);
  });

  it('rejects when too few frames show a cam', () => {
    assert.equal(consensusCam([cam, null, null, null, null], 5), null);
  });

  it('rejects a box that covers most of the frame', () => {
    const big = { x: 0, y: 0, w: 0.9, h: 0.9 };
    assert.equal(consensusCam([big, big, big], 3), null);
  });

  it('rejects boxes that jump around', () => {
    const boxes = [cam, { x: 0.7, y: 0.05, w: 0.25, h: 0.35 }, { x: 0.4, y: 0.3, w: 0.25, h: 0.35 }];
    assert.equal(consensusCam(boxes, 3), null);
  });
});

describe('parseMomentReview', () => {
  it('reads a facecam layout, points and verdicts', () => {
    const review = parseMomentReview(
      {
        layout: 'facecam',
        frames: [
          { id: '0-0', x: 0.5, y: 0.4, cam },
          { id: '0-1', x: 0.6, y: 0.4, cam },
          { id: '0-2', x: 0.5, y: 0.5, cam },
        ],
        candidates: [
          { index: 0, keep: true, score: 80, note: 'ok' },
          { index: 1, keep: false, score: 20, note: 'loading screen' },
        ],
      },
      3,
    );
    assert.ok(review);
    assert.equal(review.layout.type, 'facecam');
    assert.deepEqual(review.points.get('0-1'), { x: 0.6, y: 0.4 });
    assert.equal(review.verdicts.get(1)?.keep, false);
  });

  it('falls back to screen when the facecam box is unreliable', () => {
    const review = parseMomentReview({ layout: 'facecam', frames: [{ id: 'a', x: 0.5, y: 0.5, cam: null }] }, 3);
    assert.equal(review?.layout.type, 'screen');
  });

  it('defaults to camera for unknown layouts', () => {
    assert.equal(parseMomentReview({ layout: 'weird' }, 1)?.layout.type, 'camera');
  });
});

describe('selectReviewed', () => {
  const candidates = [{ score: 90 }, { score: 70 }, { score: 60 }];

  it('drops rejected candidates and ranks by combined score', () => {
    const review = parseMomentReview(
      {
        layout: 'camera',
        candidates: [
          { index: 0, keep: false, score: 10 },
          { index: 1, keep: true, score: 50 },
          { index: 2, keep: true, score: 95 },
        ],
      },
      0,
    );
    assert.deepEqual(
      selectReviewed(candidates, review, 2).map((item) => item.index),
      [2, 1],
    );
  });

  it('keeps the best one when everything is rejected', () => {
    const review = parseMomentReview(
      { layout: 'camera', candidates: candidates.map((_, index) => ({ index, keep: false, score: 40 })) },
      0,
    );
    assert.deepEqual(selectReviewed(candidates, review, 2).map((item) => item.index), [0]);
  });

  it('without a review keeps the picker order', () => {
    assert.deepEqual(selectReviewed(candidates, null, 2).map((item) => item.index), [0, 1]);
  });
});

describe('loudness in transcript', () => {
  const energy = Array.from({ length: 100 }, (_, i) => ({ t: i * 0.5, db: i === 40 || i === 90 ? -5 : i % 10 === 0 ? -12 : -30 + (i % 5) }));

  it('finds thresholds only when there are real peaks', () => {
    assert.ok(loudnessThresholds(energy));
    assert.equal(loudnessThresholds(energy.map((sample) => ({ ...sample, db: -20 }))), null);
  });

  it('tags loud lines', () => {
    const text = transcriptLines([], [{ start: 19.5, end: 21, text: 'NO WAY' }, { start: 2, end: 3, text: 'hola' }], 60_000, energy);
    assert.match(text, /\[19\.5-21\.0\] \[VERY LOUD\] NO WAY/);
    assert.match(text, /\[2\.0-3\.0\] hola/);
  });

  it('lists loud moments that have no words', () => {
    assert.deepEqual(silentPeaks(energy, [{ start: 19.5, end: 21 }]), ['45.0']);
  });
});
