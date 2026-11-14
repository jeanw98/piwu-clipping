import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { scaleWords, tempoFor } from './audio-tempo';

describe('tempoFor', () => {
  it('leaves voices up to 62 s untouched', () => {
    assert.equal(tempoFor(45), 1);
    assert.equal(tempoFor(62), 1);
  });
  it('speeds up longer voices toward 60 s', () => {
    assert.equal(tempoFor(66), 1.1);
  });
  it('never exceeds 1.15', () => {
    assert.equal(tempoFor(90), 1.15);
  });
  it('rescales word timestamps', () => {
    assert.deepEqual(scaleWords([{ word: 'a', start: 1.1, end: 2.2 }], 1.1), [
      { word: 'a', start: 1, end: 2 },
    ]);
  });
});
