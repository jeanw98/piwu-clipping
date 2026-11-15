import type { ZodIssue } from 'zod';
import { MG_ANIMS } from '@piwu/shared';

/**
 * Local, free repairs for the small mistakes LLM specs make, so we don't pay
 * a second Claude call for them:
 *  - strings / arrays over the limit → truncated (on a word boundary);
 *  - scene settings that only override some fields → inherit the rest;
 *  - firstCue out of range / not increasing → re-spaced, extra scenes dropped;
 *  - actions pointing at missing elements → dropped.
 * Returns a new object; the caller re-validates.
 */

type Json = Record<string, unknown>;

function at(root: unknown, path: (string | number)[]): { parent: Json | unknown[]; key: string | number } | null {
  let node = root as Json | unknown[];
  for (let i = 0; i < path.length - 1; i++) {
    const next = (node as Json)[path[i] as string];
    if (next === null || typeof next !== 'object') return null;
    node = next as Json;
  }
  return { parent: node, key: path[path.length - 1] };
}

function truncateWords(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.5 ? cut.slice(0, space) : text.slice(0, max)).replace(/[\s,;:–-]+$/, '');
}

export function repairMgSpec(raw: unknown, issues: ZodIssue[]): unknown {
  const spec = JSON.parse(JSON.stringify(raw ?? {})) as Json;

  // 0. Values outside a closed list → a safe option.
  for (const issue of issues) {
    if (issue.code !== 'invalid_enum_value') continue;
    const ref = at(spec, issue.path);
    if (!ref) continue;
    const options = issue.options.map(String);
    const pick = options.includes('pop')
      ? 'pop'
      : options.includes('day')
        ? 'day'
        : options.includes('none')
          ? 'none'
          : options[0];
    (ref.parent as Json)[ref.key as string] = pick;
  }

  // 1. Over-long strings / arrays.
  for (const issue of issues) {
    if (issue.code !== 'too_big') continue;
    const ref = at(spec, issue.path);
    if (!ref) continue;
    const value = (ref.parent as Json)[ref.key as string];
    const max = Number(issue.maximum);
    if (typeof value === 'string') (ref.parent as Json)[ref.key as string] = truncateWords(value, max);
    else if (Array.isArray(value)) (ref.parent as Json)[ref.key as string] = value.slice(0, max);
    else if (typeof value === 'number') (ref.parent as Json)[ref.key as string] = max;
  }
  for (const issue of issues) {
    if (issue.code !== 'too_small') continue;
    const ref = at(spec, issue.path);
    if (!ref) continue;
    const value = (ref.parent as Json)[ref.key as string];
    if (typeof value === 'number') (ref.parent as Json)[ref.key as string] = Number(issue.minimum);
  }

  const cues = Array.isArray(spec.cues) ? spec.cues : [];
  const scenes = Array.isArray(spec.scenes) ? (spec.scenes as Json[]) : [];
  const base = (spec.setting ?? {}) as Json;

  scenes.forEach((scene) => {
    // 2. Partial scene settings inherit the top-level setting.
    if (scene.setting && typeof scene.setting === 'object') {
      scene.setting = { sky: 'day', ...base, ...(scene.setting as Json) };
    }
    // Headline lines: max 4 words each.
    if (Array.isArray(scene.headline)) {
      scene.headline = (scene.headline as unknown[]).slice(0, 2).map((line) => {
        if (!Array.isArray(line) || typeof line[0] !== 'string') return line;
        return [line[0].trim().split(/\s+/).slice(0, 4).join(' '), line[1] ?? ''];
      });
    }
    // Elements: clamp placement, valid animation; drop unusable ones.
    if (Array.isArray(scene.elements)) {
      const clamp = (v: unknown, a: number, b: number, d: number) =>
        typeof v === 'number' && Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d;
      const anims = MG_ANIMS as readonly string[];
      scene.elements = (scene.elements as Json[])
        .filter((el) => el && (typeof el.asset === 'string' || (el.character && typeof el.character === 'object')))
        .slice(0, 6)
        .map((el) => ({
          ...el,
          x: clamp(el.x, 0, 1, 0.5),
          y: clamp(el.y, 0, 1, 0.85),
          scale: clamp(el.scale, 0.2, 3, 1),
          delay: clamp(el.delay, 0, 8, 0),
          anim: anims.includes(String(el.anim)) ? el.anim : 'pop',
          ...(typeof el.asset === 'string' ? { asset: truncateWords(el.asset, 48) } : {}),
        }));
    }
    // 4. Actions must reference existing elements.
    const count = Array.isArray(scene.elements) ? scene.elements.length : 0;
    if (Array.isArray(scene.actions)) {
      scene.actions = (scene.actions as Json[]).filter((a) =>
        ['who', 'target', 'around', 'to'].every((k) => typeof a[k] !== 'number' || (a[k] as number) < count),
      );
    }
  });

  // 3. firstCue: 1..cues-1, strictly increasing.
  const lastCue = cues.length - 1;
  let prev = 0;
  const kept: Json[] = [];
  for (const scene of scenes) {
    let fc = Number.isInteger(scene.firstCue) ? (scene.firstCue as number) : prev + 1;
    if (fc <= prev) fc = prev + 1;
    if (fc > lastCue) break;
    scene.firstCue = fc;
    prev = fc;
    kept.push(scene);
  }
  spec.scenes = kept;
  return spec;
}
