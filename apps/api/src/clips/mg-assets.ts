import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import type { MotionGraphicsSpec } from '@piwu/shared';
import { REMOTION_PUBLIC_DIR } from '../remotion/remotion.service';

/**
 * Element asset resolution: Claude names objects in plain English
 * ("palm tree", "crab"); we map them to the Fluent Emoji library
 * (apps/api/assets/emoji). Anything unmatched is left without `src`
 * (later generated once and cached, or skipped).
 */

export interface LibraryEntry {
  slug: string;
  name: string;
  group: string;
  keywords: string[];
}

let cached: LibraryEntry[] | null = null;

export function loadLibrary(
  file = path.join(REMOTION_PUBLIC_DIR, 'emoji', 'index.json'),
): LibraryEntry[] {
  if (cached) return cached;
  cached = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as LibraryEntry[])
    : [];
  return cached;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const STOP = new Set(['a', 'an', 'the', 'of', 'with', 'and', 'on', 'in']);
const tokens = (text: string) =>
  slugify(text)
    .split('-')
    .filter((t) => t && !STOP.has(t))
    .map((t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));

/** Groups that rarely make good scene objects unless asked for explicitly. */
const LOW_VALUE_GROUPS = new Set(['Flags', 'Symbols']);

export function resolveAssetName(
  query: string,
  library: LibraryEntry[] = loadLibrary(),
): LibraryEntry | null {
  const slug = slugify(query);
  if (!slug) return null;
  const exact = library.find((e) => e.slug === slug);
  if (exact) return exact;
  const q = tokens(query);
  if (!q.length) return null;
  let best: { entry: LibraryEntry; score: number } | null = null;
  for (const entry of library) {
    const nameTokens = tokens(entry.name);
    const keyTokens = entry.keywords.flatMap(tokens);
    const inName = q.filter((t) => nameTokens.includes(t)).length;
    const inKeys = q.filter((t) => keyTokens.includes(t) || nameTokens.includes(t)).length;
    if (!inKeys) continue;
    let score =
      (inName / q.length) * 70 +
      (inKeys / q.length) * 30 -
      Math.max(0, nameTokens.length - inName) * 4;
    if (LOW_VALUE_GROUPS.has(entry.group)) score -= 25;
    if (!best || score > best.score) best = { entry, score };
  }
  return best && best.score >= 55 ? best.entry : null;
}

/**
 * Set `src` on every asset element that maps to the library.
 * Keeps srcs already resolved (library or generated). Returns the names
 * that could not be matched.
 */
export function resolveSpecAssets(
  spec: MotionGraphicsSpec,
  library: LibraryEntry[] = loadLibrary(),
): { spec: MotionGraphicsSpec; missing: string[] } {
  const missing = new Set<string>();
  const scenes = spec.scenes.map((scene) => {
    if (!scene.elements?.length) return scene;
    const elements = scene.elements.map((el) => {
      if (!('asset' in el)) return el;
      if (el.src?.startsWith('storage:')) return el;
      const match = resolveAssetName(el.asset, library);
      if (match) return { ...el, src: `emoji/${match.slug}.svg` };
      missing.add(el.asset.trim().toLowerCase());
      const { src: _src, ...rest } = el;
      return rest;
    });
    return { ...scene, elements };
  });
  return { spec: { ...spec, scenes }, missing: [...missing] };
}
