import { z } from 'zod';

export const cartoonSettingSchema = z.enum([
  'beach',
  'ocean',
  'desert',
  'quick_sand',
  'city',
  'studio',
  'generic',
]);

export const cartoonActionSchema = z.enum([
  'idle',
  'walk',
  'talk',
  'point',
  'sink',
  'wave',
]);

export const cartoonPropSchema = z.enum([
  'phone',
  'sign',
  'bag',
  'none',
]);

export const sceneCartoonSchema = z.object({
  setting: cartoonSettingSchema.default('generic'),
  action: cartoonActionSchema.default('talk'),
  props: z.array(cartoonPropSchema).max(3).optional().default([]),
});

export type CartoonSetting = z.infer<typeof cartoonSettingSchema>;
export type CartoonAction = z.infer<typeof cartoonActionSchema>;
export type CartoonProp = z.infer<typeof cartoonPropSchema>;
export type SceneCartoon = z.infer<typeof sceneCartoonSchema>;

/** Infer a cartoon spec from free-text visual prompt when Claude omits it. */
export function inferCartoonFromPrompt(visualPrompt: string): SceneCartoon {
  const text = (visualPrompt || '').toLowerCase();
  let setting: CartoonSetting = 'generic';
  if (/\b(quick\s*sand|arenas?\s*movedizas|sink(?:ing)?)\b/.test(text)) {
    setting = 'quick_sand';
  } else if (/\b(beach|playa|shore|arena|sand(?!stone))\b/.test(text)) {
    setting = 'beach';
  } else if (/\b(ocean|sea|mar|wave|ola|water)\b/.test(text)) {
    setting = 'ocean';
  } else if (/\b(desert|desierto|dune)\b/.test(text)) {
    setting = 'desert';
  } else if (/\b(city|ciudad|street|calle|skyline)\b/.test(text)) {
    setting = 'city';
  } else if (/\b(studio|office|desk|escritorio)\b/.test(text)) {
    setting = 'studio';
  }

  let action: CartoonAction = 'talk';
  if (/\b(sink|hund)/.test(text)) action = 'sink';
  else if (/\b(wave|ola|greet|saluda)/.test(text)) action = 'wave';
  else if (/\b(walk|camin|run|corr)/.test(text)) action = 'walk';
  else if (/\b(point|señal|apunt)/.test(text)) action = 'point';
  else if (/\b(idle|stand|parado)\b/.test(text)) action = 'idle';

  const props: CartoonProp[] = [];
  if (/\b(phone|celular|móvil|mobile)\b/.test(text)) props.push('phone');
  if (/\b(sign|cartel|letrero)\b/.test(text)) props.push('sign');
  if (/\b(bag|mochila|bolsa)\b/.test(text)) props.push('bag');

  return { setting, action, props };
}

export function normalizeSceneCartoon(
  raw: unknown,
  visualPrompt = '',
): SceneCartoon {
  const parsed = sceneCartoonSchema.safeParse(raw);
  if (parsed.success) {
    return {
      setting: parsed.data.setting,
      action: parsed.data.action,
      props: (parsed.data.props ?? []).filter((p) => p !== 'none'),
    };
  }
  return inferCartoonFromPrompt(visualPrompt);
}

const SETTING_CYCLE: CartoonSetting[] = [
  'beach',
  'ocean',
  'desert',
  'city',
  'quick_sand',
  'studio',
  'generic',
];
const ACTION_CYCLE: CartoonAction[] = [
  'walk',
  'wave',
  'talk',
  'point',
  'sink',
  'idle',
];

/** Force variety when Claude repeats the same setting/action. */
export function diversifyCartoonScenes<
  T extends { cartoon?: SceneCartoon; visualPrompt?: string },
>(scenes: T[]): T[] {
  const used = new Set<string>();
  return scenes.map((scene, index) => {
    let cartoon = normalizeSceneCartoon(scene.cartoon, scene.visualPrompt ?? '');
    let key = `${cartoon.setting}:${cartoon.action}`;
    if (used.has(key)) {
      cartoon = {
        ...cartoon,
        setting: SETTING_CYCLE[index % SETTING_CYCLE.length]!,
        action: ACTION_CYCLE[index % ACTION_CYCLE.length]!,
      };
      key = `${cartoon.setting}:${cartoon.action}`;
    }
    used.add(key);
    return { ...scene, cartoon };
  });
}
