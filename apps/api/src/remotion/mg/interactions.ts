import type { MotionGraphicsAction, MotionGraphicsElement } from '@piwu/shared';
import { H, W, back, clamp, ease, easeOut, lerp } from './lib';

/**
 * Interactions between scene elements — pure and deterministic.
 * Given the elements, the scene's actions and the local time, returns where
 * each element is (and how it looks) plus transient effects to draw on top
 * (thrown objects, impact bursts, speech bubbles).
 */

export interface ElementState {
  x: number;
  y: number;
  /** Size multiplier from actions (1 = authored scale). */
  scale: number;
  /** 0..1 pop factor (appear / disappear / transform). */
  pop: number;
  /** Library src override (transform). */
  src?: string;
  pose?: string;
  /** Horizontal jitter from being hit. */
  shake: number;
  /** -1 / 1 when an action decided the facing direction. */
  facing?: number;
  /** Moving under an action: suppress the preset's own horizontal drift. */
  moving: boolean;
}

export type Effect =
  | { kind: 'projectile'; src?: string; x: number; y: number; rot: number; size: number }
  | { kind: 'burst'; x: number; y: number; age: number }
  | { kind: 'bubble'; x: number; y: number; text: string; age: number; dur: number };

export interface SceneState {
  states: ElementState[];
  effects: Effect[];
}

/** Seconds from scene start; unresolved word times fall back to a gentle stagger. */
export function actionTime(action: MotionGraphicsAction, index: number): number {
  if (typeof action.atSec === 'number') return action.atSec;
  if (typeof action.at === 'number') return action.at;
  return 0.8 + index * 0.9;
}

const DEFAULT_DUR: Partial<Record<MotionGraphicsAction['do'], number>> = {
  moveTo: 1.0,
  follow: 2.0,
  throw: 0.9,
  hit: 0.45,
  orbit: 2.0,
  say: 1.8,
};

/** Base point (bottom-center) of an element, in canvas px. */
export function basePoint(el: MotionGraphicsElement): { x: number; y: number } {
  return { x: clamp(el.x, 0.08, 0.92) * W, y: clamp(el.y, 0.3, 0.94) * H };
}

/** Approximate drawn size (px) — used to stop beside a target, aim at its middle. */
export function elementSize(el: MotionGraphicsElement): number {
  return ('character' in el ? 560 : 400) * (el.scale ?? 1);
}

const SHAKE_SEC = 0.45;

export function sceneState(
  elements: MotionGraphicsElement[],
  actions: MotionGraphicsAction[] | undefined,
  lt: number,
): SceneState {
  const states: ElementState[] = elements.map((el) => ({
    ...basePoint(el),
    scale: 1,
    pop: 1,
    shake: 0,
    moving: false,
  }));
  const effects: Effect[] = [];
  if (!actions?.length) return { states, effects };

  const ordered = actions
    .map((action, i) => ({ action, t0: actionTime(action, i) }))
    .sort((a, b) => a.t0 - b.t0);

  // Elements that only show up with an `appear` action start hidden.
  for (const { action, t0 } of ordered) {
    if (action.do === 'appear' && states[action.who]) {
      states[action.who].pop = lt < t0 ? 0 : back(clamp((lt - t0) / 0.35));
    }
  }

  const impact = (target: number, at: number) => {
    const st = states[target];
    if (!st) return;
    const age = lt - at;
    if (age < 0) return;
    if (age < 0.5) {
      effects.push({
        kind: 'burst',
        x: st.x,
        y: st.y - elementSize(elements[target]) * 0.45,
        age,
      });
    }
    if (age < SHAKE_SEC) st.shake = Math.sin(age * 60) * 14 * (1 - age / SHAKE_SEC);
    if ('character' in elements[target]) st.pose = 'surprised';
  };

  /** Current drawn size (authored scale × action scale). */
  const sizeOf = (i: number) => elementSize(elements[i]) * states[i].scale;
  /** Flying / floating things (authored high on screen) land ON the target. */
  const flies = (i: number) => elements[i].y < 0.75 && !('character' in elements[i]);

  const destination = (who: number, to: number | { x: number; y: number }) => {
    if (typeof to !== 'number') return { x: clamp(to.x, 0.08, 0.92) * W, y: clamp(to.y, 0.3, 0.94) * H };
    const target = states[to];
    const me = states[who];
    if (flies(who)) {
      // Hover just above the target's top, slightly off-centre.
      return {
        x: clamp(target.x + (me.x <= target.x ? -1 : 1) * sizeOf(to) * 0.18, 0.06 * W, 0.94 * W),
        y: target.y - sizeOf(to) * 0.82 + sizeOf(who) * 0.35,
      };
    }
    const side = me.x <= target.x ? -1 : 1;
    const gap = (sizeOf(to) + sizeOf(who)) * 0.27;
    return { x: clamp(target.x + side * gap, 0.06 * W, 0.94 * W), y: target.y };
  };

  for (const { action, t0 } of ordered) {
    const me = states[action.who];
    if (!me || lt < t0 && action.do !== 'disappear') continue;
    const dur = action.dur ?? DEFAULT_DUR[action.do] ?? 0.35;
    const p = clamp((lt - t0) / dur);
    switch (action.do) {
      case 'moveTo': {
        const dest = destination(action.who, action.to);
        const k = ease(p);
        me.facing = Math.sign(dest.x - me.x) || me.facing;
        me.moving = p > 0 && p < 1;
        me.x = lerp(me.x, dest.x, k);
        me.y = lerp(me.y, dest.y, k);
        break;
      }
      case 'follow': {
        const target = states[action.target];
        if (!target) break;
        const gap = (elementSize(elements[action.target]) + elementSize(elements[action.who])) * 0.34;
        const side = me.x <= target.x ? -1 : 1;
        const k = easeOut(p);
        me.facing = -side;
        me.moving = p < 1;
        me.x = lerp(me.x, target.x + side * gap, k);
        me.y = lerp(me.y, target.y, k);
        break;
      }
      case 'hit': {
        const target = states[action.target];
        if (!target) break;
        const dest = destination(action.who, action.target);
        // Rush in (ease-in), then a small recoil after the impact.
        const rush = p * p;
        const recoil = lt - t0 - dur;
        const dir = Math.sign(dest.x - me.x) || 1;
        me.facing = dir;
        me.moving = p < 1;
        const contact = lerp(me.x, dest.x + dir * 40, rush);
        me.x =
          recoil > 0
            ? contact - dir * 40 * Math.sin(Math.min(1, recoil / 0.3) * Math.PI)
            : contact;
        me.y = lerp(me.y, dest.y, rush);
        if (p >= 1) impact(action.target, t0 + dur);
        break;
      }
      case 'throw': {
        const from = { x: me.x, y: me.y - elementSize(elements[action.who]) * 0.65 };
        const to =
          typeof action.to === 'number' && states[action.to]
            ? { x: states[action.to].x, y: states[action.to].y - elementSize(elements[action.to]) * 0.5 }
            : destination(action.who, action.to);
        if (p < 1) {
          const k = easeOut(p);
          effects.push({
            kind: 'projectile',
            src: action.whatSrc,
            x: lerp(from.x, to.x, k),
            y: lerp(from.y, to.y, k) - Math.sin(p * Math.PI) * 320,
            rot: p * Math.PI * 3,
            size: 170,
          });
        } else if (typeof action.to === 'number') {
          impact(action.to, t0 + dur);
        }
        break;
      }
      case 'orbit': {
        const center = states[action.around];
        if (!center) break;
        const r = elementSize(elements[action.around]) * 0.6 + 60;
        const a = -Math.PI / 2 + p * Math.PI * 2 * Math.max(1, dur / 1.5);
        const cy = center.y - elementSize(elements[action.around]) * 0.5;
        me.moving = p < 1;
        me.x = center.x + Math.cos(a) * r;
        me.y = cy + Math.sin(a) * r * 0.45 + elementSize(elements[action.who]) * 0.5;
        break;
      }
      case 'disappear': {
        if (lt < t0) break;
        const k = clamp((lt - t0) / 0.25);
        me.pop *= 1 - k;
        if (lt - t0 < 0.4) effects.push({ kind: 'burst', x: me.x, y: me.y - elementSize(elements[action.who]) * 0.4, age: lt - t0 });
        break;
      }
      case 'scale':
        me.scale *= lerp(1, action.scale, back(clamp((lt - t0) / 0.35)));
        break;
      case 'transform': {
        if (action.intoSrc) me.src = action.intoSrc;
        me.pop *= back(clamp((lt - t0) / 0.35));
        if (lt - t0 < 0.4) effects.push({ kind: 'burst', x: me.x, y: me.y - elementSize(elements[action.who]) * 0.45, age: lt - t0 });
        break;
      }
      case 'pose':
        me.pose = action.pose;
        break;
      case 'say':
        if (lt - t0 < dur) {
          effects.push({
            kind: 'bubble',
            x: me.x,
            y: me.y - elementSize(elements[action.who]) * ('character' in elements[action.who] ? 1.02 : 0.95),
            text: action.text,
            age: lt - t0,
            dur,
          });
        }
        break;
      case 'appear':
        break;
    }
  }
  return { states, effects };
}

/** Scene-local times where an impact sound should play. */
export function impactTimes(actions: MotionGraphicsAction[] | undefined): number[] {
  if (!actions?.length) return [];
  return actions
    .map((action, i) => {
      const t0 = actionTime(action, i);
      const dur = action.dur ?? DEFAULT_DUR[action.do] ?? 0.35;
      if (action.do === 'hit' || action.do === 'throw') return t0 + dur;
      if (action.do === 'transform' || action.do === 'appear') return t0;
      return null;
    })
    .filter((v): v is number => v !== null);
}
