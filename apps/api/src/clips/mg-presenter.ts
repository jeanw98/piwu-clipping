import type {
  MotionGraphicsHostMood,
  MotionGraphicsHostSide,
  MotionGraphicsScene,
  MotionGraphicsSpec,
  WordTimestamp,
} from '@piwu/shared';

/** Elements standing at or below this y share the floor with the presenter. */
const GROUND_Y = 0.6;
/** Free horizontal band for ground elements when the presenter is on a side. */
const BAND = 0.58;
const BAND_START: Record<MotionGraphicsHostSide, number> = { right: 0.07, left: 0.35 };

const POSE_MOOD: Record<string, MotionGraphicsHostMood> = {
  point: 'point',
  shrug: 'think',
  surprised: 'surprised',
  happy: 'happy',
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function groundXs(scene: MotionGraphicsScene): number[] {
  return (scene.elements ?? []).filter((el) => el.y >= GROUND_Y).map((el) => el.x);
}

/** Side with fewer ground elements; ties keep the previous side (less jumping). */
function pickSide(scene: MotionGraphicsScene, previous: MotionGraphicsHostSide): MotionGraphicsHostSide {
  const xs = groundXs(scene);
  const left = xs.filter((x) => x < 0.4).length;
  const right = xs.filter((x) => x > 0.6).length;
  if (left === right) return previous;
  return left < right ? 'left' : 'right';
}

const squeeze = (x: number, side: MotionGraphicsHostSide) =>
  round2(Math.min(0.95, Math.max(0.05, BAND_START[side] + x * BAND)));

/**
 * Make room for the on-screen presenter:
 * - every scene gets an explicit host side + mood (Claude's, or a sensible default),
 * - ground elements are squeezed into the half the presenter leaves free,
 * - the cartoon "Host" component is replaced (the presenter is the narrator).
 */
export function layoutForPresenter(spec: MotionGraphicsSpec): MotionGraphicsSpec {
  let previous: MotionGraphicsHostSide = 'right';
  const last = spec.scenes.length - 1;
  const scenes = spec.scenes.map((scene, index): MotionGraphicsScene => {
    let next = scene;
    let poseMood: MotionGraphicsHostMood | undefined;
    if (next.component === 'Host') {
      poseMood = POSE_MOOD[(next.props as { pose?: string }).pose ?? ''];
      next = { ...next, component: 'None', props: {} } as MotionGraphicsScene;
    }
    const side = next.host?.side ?? pickSide(next, previous);
    previous = side;
    const mood =
      next.host?.mood ??
      poseMood ??
      (index === 0 ? 'point' : index === last ? 'happy' : 'explain');
    const elements = next.elements?.map((el) =>
      el.y >= GROUND_Y ? { ...el, x: squeeze(el.x, side) } : el,
    );
    const actions = next.actions?.map((action) =>
      action.do === 'moveTo' && typeof action.to === 'object' && action.to.y >= GROUND_Y
        ? { ...action, to: { ...action.to, x: squeeze(action.to.x, side) } }
        : action,
    );
    return {
      ...next,
      ...(elements ? { elements } : {}),
      ...(actions ? { actions } : {}),
      host: { side, mood },
    } as MotionGraphicsScene;
  });
  return { ...spec, scenes };
}

/**
 * Attach the presenter image + spoken word windows (talking motion).
 * Idempotent: a spec that already has a presenter (retry of a stored spec)
 * keeps its layout and only gets fresh src/talk.
 */
export function withPresenter(
  spec: MotionGraphicsSpec,
  src: string,
  words: WordTimestamp[],
): MotionGraphicsSpec {
  const talk = words
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start)
    .slice(0, 600)
    .map((w) => [round2(w.start), round2(w.end)] as [number, number]);
  const base = spec.presenter ? spec : layoutForPresenter(spec);
  return { ...base, presenter: { src, talk } };
}
