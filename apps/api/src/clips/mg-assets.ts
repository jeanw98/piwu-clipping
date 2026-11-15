import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import type { MotionGraphicsSetting, MotionGraphicsSpec } from '@piwu/shared';
import { REMOTION_PUBLIC_DIR } from '../remotion/remotion.service';
import { ASSET_ALIASES } from './mg-asset-aliases';

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
  const bySlug = (s: string) => library.find((e) => e.slug === s) ?? null;
  // 1. Exact catalog name (what the prompt asks Claude to use).
  const exact = bySlug(slug);
  if (exact) return exact;
  // 2. Known synonyms ("car" → automobile, "water" → droplet).
  const singular = slug.replace(/(?<!s)s$/, '');
  const alias = ASSET_ALIASES[slug] ?? ASSET_ALIASES[singular];
  if (alias && bySlug(alias)) return bySlug(alias);
  const exactSingular = bySlug(singular);
  if (exactSingular) return exactSingular;
  // 3. Token search over names + keywords, with a high bar so we never
  //    swap one object for an unrelated one (unmatched → generated).
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

/** Resolve a setting's backdrop; an unknown place becomes a generated background. */
function resolveSetting(
  setting: MotionGraphicsSetting | undefined,
  library: LibraryEntry[],
  backgrounds: Set<string>,
): MotionGraphicsSetting | undefined {
  if (!setting) return setting;
  const next: MotionGraphicsSetting = { ...setting };
  if (next.backdrop) {
    const match = resolveAssetName(next.backdrop, library);
    if (match) next.backdropSrc = `emoji/${match.slug}.svg`;
    else {
      delete next.backdropSrc;
      // A specific place we don't have → generate it as a full background.
      if (!next.background) next.background = next.backdrop;
    }
  }
  if (next.background && !next.backgroundSrc?.startsWith('storage:')) {
    delete next.backgroundSrc;
    backgrounds.add(next.background.trim().toLowerCase());
  }
  return next;
}

/**
 * Set `src` on every library object / backdrop. Keeps srcs already
 * resolved (library or generated). Returns what still needs an asset:
 * object names and background descriptions.
 */
export function resolveSpecAssets(
  spec: MotionGraphicsSpec,
  library: LibraryEntry[] = loadLibrary(),
): { spec: MotionGraphicsSpec; missing: string[]; backgrounds: string[] } {
  const missing = new Set<string>();
  const backgrounds = new Set<string>();
  const lookup = (name: string): string | undefined => {
    const match = resolveAssetName(name, library);
    if (match) return `emoji/${match.slug}.svg`;
    missing.add(name.trim().toLowerCase());
    return undefined;
  };
  const scenes = spec.scenes.map((scene) => {
    const setting = resolveSetting(scene.setting, library, backgrounds);
    const actions = scene.actions?.map((action) => {
      if (action.do === 'throw' && !action.whatSrc?.startsWith('storage:')) {
        const whatSrc = lookup(action.what);
        const { whatSrc: _w, ...rest } = action;
        return whatSrc ? { ...rest, whatSrc } : rest;
      }
      if (action.do === 'transform' && !action.intoSrc?.startsWith('storage:')) {
        const intoSrc = lookup(action.into);
        const { intoSrc: _i, ...rest } = action;
        return intoSrc ? { ...rest, intoSrc } : rest;
      }
      return action;
    });
    if (actions) scene = { ...scene, actions };
    if (!scene.elements?.length) return setting ? { ...scene, setting } : scene;
    const elements = scene.elements.map((el) => {
      if (!('asset' in el)) return el;
      if (el.src?.startsWith('storage:')) return el;
      const match = resolveAssetName(el.asset, library);
      if (match) return { ...el, src: `emoji/${match.slug}.svg` };
      missing.add(el.asset.trim().toLowerCase());
      const { src: _src, ...rest } = el;
      return rest;
    });
    return { ...scene, ...(setting ? { setting } : {}), elements };
  });
  const setting = resolveSetting(spec.setting, library, backgrounds);
  return {
    spec: { ...spec, ...(setting ? { setting } : {}), scenes },
    missing: [...missing],
    backgrounds: [...backgrounds],
  };
}
