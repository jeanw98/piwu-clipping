import { z } from 'zod';

export const cartoonSettingSchema = z.enum([
  'kitchen',
  'office',
  'gym',
  'city',
  'studio',
  'classroom',
  'space',
  'outdoor',
  'bunker',
  'beach',
  'ocean',
  'desert',
  'quick_sand',
  'generic',
]);

export const cartoonActionSchema = z.enum([
  'idle',
  'walk',
  'talk',
  'point',
  'react',
  'work',
  'celebrate',
  'panic',
  'sink',
  'wave',
]);

export const cartoonPropSchema = z.enum([
  'phone',
  'sign',
  'bag',
  'laptop',
  'tool',
  'food',
  'door',
  'debris',
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

  // Topic-first (non-island) before beach/water heuristics
  if (/\b(kitchen|cocina|cook|chef|fridge|stove|pan)\b/.test(text)) {
    setting = 'kitchen';
  } else if (/\b(gym|gimnasio|workout|fitness|bench|weights)\b/.test(text)) {
    setting = 'gym';
  } else if (/\b(office|oficina|desk|escritorio|meeting|laptop)\b/.test(text)) {
    setting = 'office';
  } else if (/\b(classroom|aula|school|escuela|teacher|profesor)\b/.test(text)) {
    setting = 'classroom';
  } else if (/\b(space|espacio|planet|nasa|rocket|astronaut)\b/.test(text)) {
    setting = 'space';
  } else if (/\b(bunker|shelter|refugio|vault)\b/.test(text)) {
    setting = 'bunker';
  } else if (/\b(studio|podcast|set|film)\b/.test(text)) {
    setting = 'studio';
  } else if (/\b(city|ciudad|street|calle|skyline|urban)\b/.test(text)) {
    setting = 'city';
  } else if (/\b(outdoor|park|forest|bosque|mountain|montaña|campo)\b/.test(text)) {
    setting = 'outdoor';
  } else if (/\b(quick\s*sand|arenas?\s*movedizas)\b/.test(text)) {
    setting = 'quick_sand';
  } else if (/\b(beach|playa|shore)\b/.test(text)) {
    setting = 'beach';
  } else if (/\b(ocean|sea|mar|olas?)\b/.test(text)) {
    setting = 'ocean';
  } else if (/\b(desert|desierto|dune)\b/.test(text)) {
    setting = 'desert';
  }

  let action: CartoonAction = 'talk';
  if (/\b(sink|hund)/.test(text)) action = 'sink';
  else if (/\b(celebrat|cheer|win|victoria|festej)/.test(text)) action = 'celebrate';
  else if (/\b(panic|fear|miedo|asust)/.test(text)) action = 'panic';
  else if (/\b(work|trabaj|type|cook|lift|entren)/.test(text)) action = 'work';
  else if (/\b(react|surpris|wow|reaccion)/.test(text)) action = 'react';
  else if (/\b(wave|ola|greet|saluda)/.test(text)) action = 'wave';
  else if (/\b(walk|camin|run|corr)/.test(text)) action = 'walk';
  else if (/\b(point|señal|apunt)/.test(text)) action = 'point';
  else if (/\b(idle|stand|parado)\b/.test(text)) action = 'idle';

  const props: CartoonProp[] = [];
  if (/\b(phone|celular|móvil|mobile)\b/.test(text)) props.push('phone');
  if (/\b(sign|cartel|letrero)\b/.test(text)) props.push('sign');
  if (/\b(bag|mochila|bolsa)\b/.test(text)) props.push('bag');
  if (/\b(laptop|notebook|macbook)\b/.test(text)) props.push('laptop');
  if (/\b(tool|herramienta|hammer|wrench)\b/.test(text)) props.push('tool');
  if (/\b(food|comida|pan|plate|plato)\b/.test(text)) props.push('food');
  if (/\b(door|puerta)\b/.test(text)) props.push('door');
  if (/\b(debris|escombro|rubble)\b/.test(text)) props.push('debris');

  return { setting, action, props: props.slice(0, 3) };
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

/** Neutral variety cycle — no beach-first bias. */
const SETTING_CYCLE: CartoonSetting[] = [
  'office',
  'city',
  'kitchen',
  'studio',
  'gym',
  'outdoor',
  'classroom',
  'generic',
];
const ACTION_CYCLE: CartoonAction[] = [
  'talk',
  'point',
  'work',
  'react',
  'walk',
  'celebrate',
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
