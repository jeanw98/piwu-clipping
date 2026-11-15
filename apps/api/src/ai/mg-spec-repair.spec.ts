import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { motionGraphicsSpecSchema } from '@piwu/shared';
import { repairMgSpec } from './mg-spec-repair';

const fixture = JSON.parse(
  readFileSync(join(__dirname, '../../../../docs/motion-graphics/scenes/playa.spec.json'), 'utf8'),
);

function brokenAndRepaired(mutate: (s: any) => void) {
  const raw = JSON.parse(JSON.stringify(fixture));
  mutate(raw);
  const first = motionGraphicsSpecSchema.safeParse(raw);
  assert.equal(first.success, false, 'mutation should break validation');
  const repaired = motionGraphicsSpecSchema.safeParse(
    repairMgSpec(raw, first.success ? [] : first.error.issues),
  );
  if (!repaired.success) assert.fail(JSON.stringify(repaired.error.issues));
  return repaired.data;
}

describe('repairMgSpec (real failures from the 10-idea eval)', () => {
  it('truncates over-long labels on a word boundary', () => {
    const out = brokenAndRepaired((s) => {
      s.scenes[0].component = 'IconBurst';
      s.scenes[0].props = { icon: 'alert', label: 'Un texto bastante largo para el límite' };
    });
    const label = (out.scenes[0].props as { label: string }).label;
    assert.ok(label.length <= 24 && !label.endsWith(' '), label);
  });
  it('partial scene setting inherits sky from the top-level setting', () => {
    const out = brokenAndRepaired((s) => {
      s.scenes[1].setting = { weather: 'rain' };
    });
    assert.equal(out.scenes[1].setting?.sky, 'day');
    assert.equal(out.scenes[1].setting?.weather, 'rain');
    assert.equal(out.scenes[1].setting?.horizon, 'sea');
  });
  it('fixes firstCue 0 and drops scenes past the last cue', () => {
    const out = brokenAndRepaired((s) => {
      s.scenes[0].firstCue = 0;
      s.scenes.push({ ...s.scenes[1], firstCue: 99 });
    });
    assert.equal(out.scenes[0].firstCue, 1);
    assert.equal(out.scenes.length, fixture.scenes.length);
  });
  it('sanitizes an invalid element instead of failing', () => {
    const out = brokenAndRepaired((s) => {
      s.scenes[0].elements[0] = { asset: 'palm tree', x: 1.4, y: 0.8, scale: 9, anim: 'wiggle', delay: 0 };
    });
    const el = out.scenes[0].elements![0] as { x: number; scale: number; anim: string };
    assert.deepEqual([el.x, el.scale, el.anim], [1, 3, 'pop']);
  });
  it('clamps out-of-range numbers (decimals: 3 → 2)', () => {
    const out = brokenAndRepaired((s) => {
      s.scenes[0].component = 'BigNumber';
      s.scenes[0].props = { value: 3.14159, decimals: 3 };
    });
    assert.equal((out.scenes[0].props as { decimals: number }).decimals, 2);
  });
  it('drops actions that reference missing elements', () => {
    const out = brokenAndRepaired((s) => {
      s.scenes[0].actions = [
        { do: 'moveTo', who: 0, to: 1, at: 'cree' },
        { do: 'hit', who: 0, target: 5, at: 1 },
      ];
    });
    assert.equal(out.scenes[0].actions?.length, 1);
  });
});
