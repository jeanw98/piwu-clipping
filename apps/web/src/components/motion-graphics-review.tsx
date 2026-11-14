import {
  MG_COMPONENTS,
  mgSceneSchema,
  type MotionGraphicsComponentName,
  type MotionGraphicsSpec,
} from '@piwu/shared';

/** Minimum props so a scene stays valid when its component changes. */
const DEFAULT_PROPS: Partial<Record<MotionGraphicsComponentName, Record<string, unknown>>> = {
  Newspaper: { headline: 'ÚLTIMA HORA' },
  SilhouettePair: { leftLabel: 'PERSONA A', rightLabel: 'PERSONA B' },
  StockChart: { direction: 'up' },
  Building: { label: 'EMPRESA' },
  Letter: { title: 'COMUNICADO' },
  BigNumber: { value: 100 },
  ChecklistSteps: { steps: ['PASO 1', 'PASO 2', 'PASO 3'] },
  MythVsFact: { myth: 'MITO', fact: 'REALIDAD' },
  Comparison: { leftTitle: 'ANTES', rightTitle: 'AHORA', left: ['…'], right: ['…'] },
  Timeline: { dates: ['AYER', 'HOY'], labels: ['INICIO', 'AHORA'] },
  IconBurst: { icon: 'alert' },
  Host: { pose: 'point' },
  Quote: { quote: '"…"' },
};

function sceneError(scene: MotionGraphicsSpec['scenes'][number]): string | null {
  const parsed = mgSceneSchema.safeParse(scene);
  return parsed.success
    ? null
    : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

/**
 * Motion Graphics review: list of scenes with component + headline,
 * editable before approving. Props of the new component keep the overlapping
 * keys (pill/date) and get safe defaults for required ones.
 */
export function MotionGraphicsReview({
  spec,
  onChange,
}: {
  spec: MotionGraphicsSpec;
  onChange: (next: MotionGraphicsSpec) => void;
}) {
  const update = (index: number, patch: Partial<MotionGraphicsSpec['scenes'][number]>) => {
    const scenes = spec.scenes.map((scene, i) =>
      i === index ? ({ ...scene, ...patch } as MotionGraphicsSpec['scenes'][number]) : scene,
    );
    onChange({ ...spec, scenes });
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-mist">
        Tema: <span className="text-white">{spec.theme}</span>
        {spec.disclaimer ? ` · ${spec.disclaimer}` : ''}
      </p>
      {spec.scenes.map((scene, index) => {
        const error = sceneError(scene);
        const next = spec.scenes[index + 1]?.firstCue ?? spec.cues.length;
        const narration = spec.cues
          .slice(scene.firstCue, next)
          .map(([text]) => text)
          .join(' ');
        return (
          <article
            key={index}
            className="space-y-2 rounded-lg border border-white/10 bg-ink-900/80 p-2.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-white">Escena {index + 1}</span>
              <select
                className="h-8 rounded-md border border-white/10 bg-ink-950 px-2 text-xs text-white"
                value={scene.component}
                onChange={(event) => {
                  const component = event.target.value as MotionGraphicsComponentName;
                  const old = scene.props as Record<string, unknown>;
                  update(index, {
                    component,
                    props: {
                      ...(DEFAULT_PROPS[component] ?? {}),
                      ...(old.pill ? { pill: old.pill } : {}),
                      ...(old.date ? { date: old.date } : {}),
                    },
                  } as Partial<MotionGraphicsSpec['scenes'][number]>);
                }}
              >
                {MG_COMPONENTS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            {scene.headline.map(([text, keyword], line) => (
              <div key={line} className="flex gap-2">
                <input
                  className="h-8 min-w-0 flex-1 rounded-md border border-white/10 bg-ink-950 px-2 text-xs uppercase text-white"
                  value={text}
                  maxLength={60}
                  placeholder="Titular (máx. 4 palabras)"
                  onChange={(event) => {
                    const headline = scene.headline.map((pair, i) =>
                      i === line ? ([event.target.value.toUpperCase(), pair[1]] as [string, string]) : pair,
                    );
                    update(index, { headline });
                  }}
                />
                <input
                  className="h-8 w-28 rounded-md border border-white/10 bg-ink-950 px-2 text-xs uppercase text-yellow-300"
                  value={keyword}
                  maxLength={40}
                  placeholder="Palabra clave"
                  onChange={(event) => {
                    const headline = scene.headline.map((pair, i) =>
                      i === line ? ([pair[0], event.target.value.toUpperCase()] as [string, string]) : pair,
                    );
                    update(index, { headline });
                  }}
                />
              </div>
            ))}
            <p className="text-xs text-mist">{narration}</p>
            {error ? <p className="text-[11px] text-red-400">{error}</p> : null}
          </article>
        );
      })}
    </div>
  );
}

export function isMotionGraphicsSpecValid(spec: MotionGraphicsSpec): boolean {
  return spec.scenes.every((scene) => !sceneError(scene));
}
