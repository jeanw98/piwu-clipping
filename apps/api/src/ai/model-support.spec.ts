import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { supportsEffort } from './model-support';

describe('supportsEffort', () => {
  it('accepts current models', () => {
    for (const model of ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-2', 'claude-sonnet-5', 'claude-opus-4-8', 'claude-sonnet-4-6', 'claude-opus-4-5-20251101']) {
      assert.equal(supportsEffort(model), true, model);
    }
  });

  it('rejects models without effort', () => {
    for (const model of ['claude-sonnet-4-5', 'claude-haiku-4-5-20251001', 'claude-3-7-sonnet-latest', 'gpt-4o']) {
      assert.equal(supportsEffort(model), false, model);
    }
  });
});
