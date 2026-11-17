import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { motionGraphicsSpecSchema, type MotionGraphicsSpec } from '@piwu/shared';
import { layoutForPresenter, withPresenter } from './mg-presenter';

function spec(): MotionGraphicsSpec {
  return motionGraphicsSpecSchema.parse({
    title: 'Qué pasaría si la Luna desapareciera',
    theme: 'space',
    intro: { lines: [['¿QUÉ PASARÍA SI', ''], ['LA LUNA', 'LUNA'], ['DESAPARECE', '']] },
    cues: [
      ['¿Qué pasaría si la Luna desapareciera?', 'Luna'],
      ['Las mareas cambiarían', 'mareas'],
      ['Las noches serían oscuras', 'oscuras'],
      ['El eje de la Tierra se tambalearía', 'eje'],
      ['¿Tú qué harías?', ''],
    ],
    scenes: [
      {
        firstCue: 1,
        component: 'None',
        headline: [['SIN MAREAS', 'MAREAS']],
        props: {},
        elements: [
          { asset: 'water wave', x: 0.2, y: 0.85 },
          { asset: 'crab', x: 0.3, y: 0.88 },
          { asset: 'bird', x: 0.8, y: 0.5 },
        ],
        actions: [{ do: 'moveTo', who: 1, to: { x: 0.25, y: 0.86 }, at: 1 }],
      },
      {
        firstCue: 2,
        component: 'BigNumber',
        headline: [['NOCHES OSCURAS', 'OSCURAS']],
        props: { value: 0 },
        host: { side: 'left', mood: 'worried' },
      },
      {
        firstCue: 3,
        component: 'Host',
        headline: [['EJE INESTABLE', 'EJE']],
        props: { pose: 'surprised' },
      },
      {
        firstCue: 4,
        component: 'None',
        headline: [['¿TÚ QUÉ HARÍAS?', '']],
        props: {},
        host: { side: 'nowhere', mood: 'dancing' },
      },
    ],
  });
}

test('invalid host values are dropped instead of failing the scene', () => {
  const s = spec();
  assert.deepEqual(s.scenes[3].host, { side: undefined, mood: undefined });
});

test('layoutForPresenter picks a free side, defaults moods and squeezes ground elements', () => {
  const out = layoutForPresenter(spec());
  // Scene 0: ground elements on the left → presenter goes right.
  assert.equal(out.scenes[0].host?.side, 'right');
  assert.equal(out.scenes[0].host?.mood, 'point');
  const els = out.scenes[0].elements!;
  assert.ok(els[0].x < 0.62 && els[1].x < 0.62, 'ground elements stay out of the right side');
  assert.equal(els[2].x, 0.8, 'floating elements are untouched');
  const move = out.scenes[0].actions![0];
  assert.ok(move.do === 'moveTo' && typeof move.to === 'object' && move.to.x < 0.62);
  // Scene 1: Claude's direction wins.
  assert.deepEqual(out.scenes[1].host, { side: 'left', mood: 'worried' });
  // Scene 2: Host component becomes the presenter's reaction.
  assert.equal(out.scenes[2].component, 'None');
  assert.equal(out.scenes[2].host?.mood, 'surprised');
  assert.equal(out.scenes[2].host?.side, 'left', 'tie keeps the previous side');
  // Last scene: happy closing.
  assert.equal(out.scenes[3].host?.mood, 'happy');
  assert.ok(motionGraphicsSpecSchema.safeParse(out).success);
});

test('withPresenter attaches talk windows and is idempotent', () => {
  const words = [
    { word: 'Hola', start: 0.123, end: 0.456 },
    { word: 'x', start: 1, end: 1 },
  ];
  const once = withPresenter(spec(), 'storage:presenters/u.png', words);
  assert.deepEqual(once.presenter?.talk, [[0.12, 0.46]]);
  const twice = withPresenter(once, 'storage:presenters/u2.png', words);
  assert.deepEqual(twice.scenes[0].elements, once.scenes[0].elements);
  assert.equal(twice.presenter?.src, 'storage:presenters/u2.png');
  assert.ok(motionGraphicsSpecSchema.safeParse(twice).success);
});
