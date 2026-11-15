import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { MotionGraphicsAction, MotionGraphicsElement } from '@piwu/shared';
import { basePoint, impactTimes, sceneState } from './interactions';

const el = (x: number, y = 0.85, extra: Partial<MotionGraphicsElement> = {}) =>
  ({ asset: 'crab', x, y, scale: 1, anim: 'pop', delay: 0, ...extra }) as MotionGraphicsElement;

describe('sceneState', () => {
  const crab = el(0.2);
  const umbrella = el(0.8);

  it('moveTo ends next to the target, facing it', () => {
    const actions: MotionGraphicsAction[] = [{ do: 'moveTo', who: 0, to: 1, at: 1, atSec: 1, dur: 1 }];
    const before = sceneState([crab, umbrella], actions, 0.5).states[0];
    const after = sceneState([crab, umbrella], actions, 2.5).states[0];
    assert.equal(before.x, basePoint(crab).x);
    assert.ok(after.x < basePoint(umbrella).x && after.x > basePoint(crab).x + 200);
    assert.equal(after.facing, 1);
  });

  it('appear hides the element until its time', () => {
    const actions: MotionGraphicsAction[] = [{ do: 'appear', who: 1, at: 2, atSec: 2 }];
    assert.equal(sceneState([crab, umbrella], actions, 1).states[1].pop, 0);
    assert.ok(sceneState([crab, umbrella], actions, 3).states[1].pop > 0.99);
  });

  it('hit produces an impact burst and shakes the target', () => {
    const actions: MotionGraphicsAction[] = [{ do: 'hit', who: 0, target: 1, at: 1, atSec: 1, dur: 0.4 }];
    const { states, effects } = sceneState([crab, umbrella], actions, 1.5);
    assert.ok(effects.some((e) => e.kind === 'burst'));
    assert.notEqual(states[1].shake, 0);
  });

  it('hit makes a character look surprised', () => {
    const person = { character: { skin: 'tan', hair: 'black', outfit: 'blue', pose: 'happy' }, x: 0.8, y: 0.9, scale: 1, anim: 'pop', delay: 0 } as MotionGraphicsElement;
    const actions: MotionGraphicsAction[] = [{ do: 'hit', who: 0, target: 1, at: 0, atSec: 0, dur: 0.3 }];
    assert.equal(sceneState([crab, person], actions, 0.5).states[1].pose, 'surprised');
  });

  it('throw draws a projectile in flight, then impacts', () => {
    const actions: MotionGraphicsAction[] = [{ do: 'throw', who: 0, what: 'soccer ball', whatSrc: 'emoji/soccer-ball.svg', to: 1, at: 1, atSec: 1, dur: 1 }];
    const mid = sceneState([crab, umbrella], actions, 1.5).effects;
    assert.ok(mid.some((e) => e.kind === 'projectile' && e.src === 'emoji/soccer-ball.svg'));
    const end = sceneState([crab, umbrella], actions, 2.1).effects;
    assert.ok(end.some((e) => e.kind === 'burst'));
  });

  it('transform swaps the image after its time', () => {
    const actions: MotionGraphicsAction[] = [{ do: 'transform', who: 0, into: 'fire', intoSrc: 'emoji/fire.svg', at: 1, atSec: 1 }];
    assert.equal(sceneState([crab], actions, 0.5).states[0].src, undefined);
    assert.equal(sceneState([crab], actions, 1.5).states[0].src, 'emoji/fire.svg');
  });

  it('is deterministic', () => {
    const actions: MotionGraphicsAction[] = [{ do: 'orbit', who: 0, around: 1, at: 0, atSec: 0, dur: 2 }];
    assert.deepEqual(sceneState([crab, umbrella], actions, 1.234), sceneState([crab, umbrella], actions, 1.234));
  });

  it('impact sounds land on hit arrival and transforms', () => {
    assert.deepEqual(
      impactTimes([
        { do: 'hit', who: 0, target: 1, at: 1, atSec: 1, dur: 0.5 },
        { do: 'transform', who: 0, into: 'fire', at: 3, atSec: 3 },
        { do: 'pose', who: 0, pose: 'happy', at: 2, atSec: 2 },
      ]),
      [1.5, 3],
    );
  });
});
