import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  demoteExcessVideoScenes,
  estimateActualClipCost,
  projectMonthlyCost,
  videoSceneCap,
} from '@piwu/shared';
import { decideVideoScene, minimaxTierFor, once } from './scene-plan';

describe('decideVideoScene (no Hailuo on a bad still)', () => {
  const base = { wantVideo: true, hadReferences: true, guided: true, retriedGuidance: false };
  it('IMAGE scenes never animate', () => {
    assert.equal(decideVideoScene({ ...base, wantVideo: false }), 'image');
  });
  it('guided still → animate', () => {
    assert.equal(decideVideoScene(base), 'animate');
  });
  it('no project refs → animate (nothing to guide)', () => {
    assert.equal(decideVideoScene({ ...base, hadReferences: false, guided: false }), 'animate');
  });
  it('refs but unguided → retry the ref upload first', () => {
    assert.equal(decideVideoScene({ ...base, guided: false }), 'retry-guidance');
  });
  it('still unguided after the retry → degrade to IMAGE', () => {
    assert.equal(
      decideVideoScene({ ...base, guided: false, retriedGuidance: true }),
      'degrade',
    );
  });
});

describe('minimaxTierFor', () => {
  it('only scene 0 is the hook', () => {
    assert.equal(minimaxTierFor(0), 'hook');
    assert.equal(minimaxTierFor(3), 'default');
  });
});

describe('once', () => {
  it('shares one retry across scenes', async () => {
    let calls = 0;
    const retry = once(async () => ++calls);
    await Promise.all([retry(), retry(), retry()]);
    assert.equal(calls, 1);
  });
});

describe('VIDEO cap', () => {
  it('semi ≤2, or ≤3 from 45 s', () => {
    assert.equal(videoSceneCap(30, 'semi'), 2);
    assert.equal(videoSceneCap(45, 'semi'), 3);
    assert.equal(videoSceneCap(60, 'semi'), 3);
  });
  it('stills, stills_dynamic and graphics never use Hailuo', () => {
    for (const m of ['stills', 'stills_dynamic', 'graphics'] as const) {
      assert.equal(videoSceneCap(60, m), 0);
    }
  });
  it('demotes VIDEO scenes beyond the cap', () => {
    const scenes = demoteExcessVideoScenes(
      [{ type: 'VIDEO' }, { type: 'VIDEO' }, { type: 'VIDEO' }, { type: 'IMAGE' }],
      2,
    );
    assert.deepEqual(scenes.map((s) => s.type), ['VIDEO', 'VIDEO', 'IMAGE', 'IMAGE']);
  });
});

describe('cost projection', () => {
  it('graphics = Claude + ElevenLabs only', () => {
    const p = projectMonthlyCost({
      clipsPerMonth: 1,
      durationSec: 60,
      motion: 'graphics',
      videoModel: 'MiniMax-Hailuo-2.3-Fast',
      videoResolution: '768P',
    });
    assert.equal(p.activeVideo.perClipUsd, 0);
    assert.equal(p.others.find((l) => l.id === 'leonardo')!.perClipUsd, 0);
    assert.equal(p.others.find((l) => l.id === 'whisper')!.perClipUsd, 0);
    assert.ok(p.others.find((l) => l.id === 'anthropic')!.perClipUsd > 0);
    assert.ok(p.others.find((l) => l.id === 'elevenlabs')!.perClipUsd > 0);
  });
  it('Hailuo always bills 6 s, even for long scenes', () => {
    const cost = estimateActualClipCost({
      sourceType: 'prompt',
      durationSec: 30,
      videoModel: 'MiniMax-Hailuo-2.3-Fast',
      videoResolution: '768P',
      motion: 'semi',
      assets: [{ type: 'VIDEO', durationSec: 9 }],
    });
    assert.match(cost.lines.find((l) => l.id === 'minimax')!.note ?? '', /1× 6s/);
  });
  it('records degraded VIDEO scenes', () => {
    const cost = estimateActualClipCost({
      sourceType: 'prompt',
      durationSec: 30,
      videoModel: 'MiniMax-Hailuo-2.3-Fast',
      videoResolution: '768P',
      motion: 'semi',
      assets: [{ type: 'IMAGE', durationSec: 5 }],
      degradedVideoScenes: 1,
    });
    assert.equal(cost.degradedVideoScenes, 1);
  });
});
