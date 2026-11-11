import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import {
  DEFAULT_CAPTION_STYLE,
  LANGUAGE_LABELS,
  generateClipSchema,
  platformDefaults,
  resolveVideoFormat,
  VISUAL_STYLE_LOCK,
  type CaptionSize,
  type ClipLanguage,
  type GenerateClipInput,
  type GenerateClipResponse,
  type GeneratedScript,
} from '@piwu/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type ReferenceDraft = {
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  data: string;
  previewUrl: string;
  name: string;
};

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

async function fileToReference(file: File): Promise<ReferenceDraft> {
  const mime = file.type as ReferenceDraft['mime'];
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
    throw new Error('Only JPEG, PNG, or WebP');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Each image must be under 5MB');
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return {
    mime,
    data: btoa(binary),
    previewUrl: URL.createObjectURL(file),
    name: file.name,
  };
}

const PRESETS = [
  'viral',
  'cinematic',
  'educational',
  'comedy',
  'dramatic',
] as const;

const PLATFORMS = [
  { id: 'tiktok', label: 'TikTok' },
  { id: 'reels', label: 'Reels' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'custom', label: 'Custom' },
] as const;

const DURATIONS = [15, 30, 45, 60] as const;
const CLIP_COUNTS = [3, 5, 8] as const;
const MOTIONS = [
  {
    id: 'auto',
    label: 'Auto',
    detail: 'Stills unless the prompt asks to animate',
  },
  {
    id: 'stills',
    label: 'Stills',
    detail: 'Photos only + light Ken Burns. $0 video',
  },
  {
    id: 'semi',
    label: 'Semi animated',
    detail: 'Layered pan/zoom on stills. No Hailuo',
  },
  {
    id: 'animated',
    label: 'Animated',
    detail: '2–3 scenes as Hailuo video (hook + payoff)',
  },
  {
    id: 'full',
    label: 'Full animated',
    detail: 'Every scene as Hailuo video (costs more)',
  },
] as const;
const VISUAL_STYLES = (
  Object.entries(VISUAL_STYLE_LOCK) as [
    keyof typeof VISUAL_STYLE_LOCK,
    { label: string; detail: string },
  ][]
).map(([id, meta]) => ({ id, label: meta.label, detail: meta.detail }));
const ORIENTATIONS = [
  { id: 'portrait', label: 'Portrait', detail: '9:16' },
  { id: 'square', label: 'Square', detail: '1:1' },
  { id: 'landscape', label: 'Landscape', detail: '16:9' },
] as const;
const RESOLUTIONS = [
  { id: '1080p', label: '1080p', detail: 'Best quality' },
  { id: '720p', label: '720p', detail: 'Faster render' },
] as const;
const LANGUAGES = (
  Object.entries(LANGUAGE_LABELS) as [
    ClipLanguage,
    { label: string; detail: string },
  ][]
).map(([id, meta]) => ({
  id,
  label: meta.label,
  detail: meta.detail,
}));

function OptionChip({
  active,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-3 py-2 text-left transition',
        active
          ? 'border-accent bg-accent/10 text-accent'
          : 'border-ink-600 text-mist hover:border-ink-500 hover:text-white',
      )}
    >
      <div className="text-sm font-semibold capitalize">{title}</div>
      {subtitle ? <div className="text-xs opacity-80">{subtitle}</div> : null}
    </button>
  );
}

export function CreateClipPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [references, setReferences] = useState<ReferenceDraft[]>([]);
  const [draftJobId, setDraftJobId] = useState<string | null>(null);
  const [scriptDraft, setScriptDraft] = useState<GeneratedScript | null>(null);
  const form = useForm<GenerateClipInput>({
    resolver: zodResolver(generateClipSchema),
    defaultValues: {
      prompt: '',
      stylePreset: 'viral',
      platform: 'tiktok',
      durationSec: 30,
      orientation: 'portrait',
      resolution: '1080p',
      language: 'es-LA',
      sourceType: 'prompt',
      sourceUrl: '',
      captionStyle: DEFAULT_CAPTION_STYLE,
      visualStyle: 'ugc',
      motion: 'auto',
      clipCount: 5,
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: GenerateClipInput) => {
      if ((values.sourceType ?? 'prompt') === 'youtube') {
        const { data } = await api.post<GenerateClipResponse>(
          '/clips/generate',
          values,
        );
        return data;
      }
      const { data } = await api.post<GenerateClipResponse>('/clips/script', {
        ...values,
        references: references.map(({ mime, data }) => ({ mime, data })),
      });
      return data;
    },
    onSuccess: (data) => {
      if (data.script && data.status === 'AWAITING_APPROVAL') {
        setDraftJobId(data.jobId);
        setScriptDraft(data.script);
        return;
      }
      navigate(`/dashboard/clips/${data.jobId}`);
    },
    onError: () => {
      setError('Failed to create clip. Please try again.');
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const { data } = await api.post<GenerateClipResponse>(
        `/clips/${jobId}/regenerate-script`,
      );
      return data;
    },
    onSuccess: (data) => {
      if (data.script) setScriptDraft(data.script);
    },
    onError: () => setError('Could not regenerate the script.'),
  });

  const approveMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const { data } = await api.post<GenerateClipResponse>(
        `/clips/${jobId}/approve`,
      );
      return data;
    },
    onSuccess: (data) => {
      navigate(`/dashboard/clips/${data.jobId}`);
    },
    onError: () => setError('Could not approve the script.'),
  });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    mutation.mutate(values);
  });

  const addReferences = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    try {
      const next = [...references];
      for (const file of Array.from(files)) {
        if (next.length >= 4) break;
        next.push(await fileToReference(file));
      }
      setReferences(next);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const platform = form.watch('platform') ?? 'tiktok';
  const stylePreset = form.watch('stylePreset') ?? 'viral';
  const durationSec = form.watch('durationSec') ?? 30;
  const orientation = form.watch('orientation') ?? 'portrait';
  const resolution = form.watch('resolution') ?? '1080p';
  const language = form.watch('language') ?? 'es-LA';
  const sourceType = form.watch('sourceType') ?? 'prompt';
  const prompt = form.watch('prompt') ?? '';
  const captions = form.watch('captionStyle') ?? DEFAULT_CAPTION_STYLE;
  const visualStyle = form.watch('visualStyle') ?? 'ugc';
  const motion = form.watch('motion') ?? 'auto';
  const clipCount = form.watch('clipCount') ?? 5;

  const format = useMemo(
    () => resolveVideoFormat(orientation, resolution),
    [orientation, resolution],
  );
  const platformTip = platformDefaults(platform).tip;

  const applyPlatform = (next: (typeof PLATFORMS)[number]['id']) => {
    const defaults = platformDefaults(next);
    form.setValue('platform', next);
    form.setValue('orientation', defaults.orientation);
    form.setValue('resolution', defaults.resolution);
    form.setValue('durationSec', defaults.durationSec);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-4xl font-bold tracking-tight text-white">
          Create a clip
        </h1>
        <p className="mt-2 text-mist">
          Clip a YouTube video into separate shorts, or generate one from a
          prompt with the look and motion you ask for.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-8 rounded-2xl border border-white/10 bg-ink-900/70 p-6 shadow-glow"
      >
        <section className="space-y-3">
          <Label>Platform</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PLATFORMS.map((item) => (
              <OptionChip
                key={item.id}
                active={platform === item.id}
                title={item.label}
                onClick={() => applyPlatform(item.id)}
              />
            ))}
          </div>
          <p className="text-sm text-mist">{platformTip}</p>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          <div className="space-y-3">
            <Label>{sourceType === 'youtube' ? 'Each clip' : 'Duration'}</Label>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((seconds) => (
                <OptionChip
                  key={seconds}
                  active={durationSec === seconds}
                  title={`${seconds}s`}
                  subtitle={
                    seconds === 15
                      ? 'Hook-only'
                      : seconds === 30
                        ? 'Recommended'
                        : seconds === 45
                          ? 'Story'
                          : 'Long-form short'
                  }
                  onClick={() => form.setValue('durationSec', seconds)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Orientation</Label>
            <div className="flex flex-wrap gap-2">
              {ORIENTATIONS.map((item) => (
                <OptionChip
                  key={item.id}
                  active={orientation === item.id}
                  title={item.label}
                  subtitle={item.detail}
                  onClick={() => form.setValue('orientation', item.id)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Resolution</Label>
            <div className="flex flex-wrap gap-2">
              {RESOLUTIONS.map((item) => (
                <OptionChip
                  key={item.id}
                  active={resolution === item.id}
                  title={item.label}
                  subtitle={item.detail}
                  onClick={() => form.setValue('resolution', item.id)}
                />
              ))}
            </div>
          </div>
        </section>

        <div className="rounded-xl border border-white/5 bg-ink-950/70 p-4 text-sm text-mist">
          <div className="font-medium text-white">Output preview</div>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            <span>
              Frame: {format.width}×{format.height} ({format.aspectLabel}) @{' '}
              {format.fps}fps
            </span>
            <span>Target length: {durationSec}s</span>
            <span>
              Language: {LANGUAGE_LABELS[language].label} (
              {LANGUAGE_LABELS[language].detail})
            </span>
          </div>
          <p className="mt-2">{format.tip}</p>
        </div>

        <section className="space-y-3">
          <Label>Language</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {LANGUAGES.map((item) => (
              <OptionChip
                key={item.id}
                active={language === item.id}
                title={item.label}
                subtitle={item.detail}
                onClick={() => form.setValue('language', item.id)}
              />
            ))}
          </div>
          <p className="text-sm text-mist">
            Script and narration are written in this language. Visual prompts stay
            in English for the image models.
          </p>
        </section>

        <section className="space-y-3">
          <Label>Source</Label>
          <div className="flex flex-wrap gap-2">
            <OptionChip
              active={sourceType === 'prompt'}
              title="Prompt"
              subtitle="Generate with AI"
              onClick={() => form.setValue('sourceType', 'prompt')}
            />
            <OptionChip
              active={sourceType === 'youtube'}
              title="YouTube"
              subtitle="Clip a link"
              onClick={() => form.setValue('sourceType', 'youtube')}
            />
          </div>
        </section>

        <section className="space-y-3">
          <Label>Style preset</Label>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <OptionChip
                key={preset}
                active={stylePreset === preset}
                title={preset}
                onClick={() => form.setValue('stylePreset', preset)}
              />
            ))}
          </div>
        </section>

        {sourceType === 'youtube' ? (
          <>
            <section className="space-y-2">
              <Label htmlFor="sourceUrl">YouTube URL</Label>
              <Input
                id="sourceUrl"
                placeholder="https://www.youtube.com/watch?v=..."
                {...form.register('sourceUrl')}
              />
              {form.formState.errors.sourceUrl ? (
                <p className="text-sm text-red-400">
                  {form.formState.errors.sourceUrl.message}
                </p>
              ) : (
                <p className="text-sm text-mist">
                  Only clip a public video you have the rights to use. Each
                  result is its own {durationSec}s clip, reframed and tightened
                  on the pauses.
                </p>
              )}
            </section>

            <section className="space-y-2">
              <div className="flex items-end justify-between gap-3">
                <Label htmlFor="prompt">Focus prompt</Label>
                <span className="text-xs text-mist">{prompt.length}/2000</span>
              </div>
              <Textarea
                id="prompt"
                placeholder="Optional. Example: keep the joke about the price, skip the intro, and end on the conclusion."
                {...form.register('prompt')}
              />
              <p className="text-sm text-mist">
                This steers which moments get picked. Leave it empty to use the
                strongest spoken lines.
              </p>
            </section>

            <section className="space-y-3">
              <Label>How many clips</Label>
              <div className="flex flex-wrap gap-2">
                {CLIP_COUNTS.map((count) => (
                  <OptionChip
                    key={count}
                    active={clipCount === count}
                    title={String(count)}
                    subtitle={count === 5 ? 'Recommended' : undefined}
                    onClick={() => form.setValue('clipCount', count)}
                  />
                ))}
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="space-y-2">
              <div className="flex items-end justify-between gap-3">
                <Label htmlFor="prompt">Prompt</Label>
                <span className="text-xs text-mist">{prompt.length}/2000</span>
              </div>
              <Textarea
                id="prompt"
                placeholder="Hook first: call out the problem, then the insight, then one concrete tip. Ask for animation or a cartoon if you want motion."
                {...form.register('prompt')}
              />
              {form.formState.errors.prompt ? (
                <p className="text-sm text-red-400">
                  {form.formState.errors.prompt.message}
                </p>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-sm text-mist">
                  <li>Lead with a scroll-stopping claim in the first line.</li>
                  <li>One idea only — avoid packing multiple topics.</li>
                  <li>Name the look: UGC, anime, 2D, cinematic, or documentary.</li>
                </ul>
              )}
            </section>

            <section className="space-y-3">
              <Label>Visual style</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {VISUAL_STYLES.map((item) => (
                  <OptionChip
                    key={item.id}
                    active={visualStyle === item.id}
                    title={item.label}
                    subtitle={item.detail}
                    onClick={() => form.setValue('visualStyle', item.id)}
                  />
                ))}
              </div>
              <p className="text-sm text-mist">
                Locked into the creative brief for script, Leonardo, and Hailuo.
                Same subject and look in every scene.
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <Label htmlFor="references">Referencia</Label>
                <span className="text-xs text-mist">
                  {references.length}/4 · optional
                </span>
              </div>
              <p className="text-sm text-mist">
                Upload style captures. The script and visual prompts will match
                this look; the subject still comes from your prompt.
              </p>
              <Input
                id="references"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(event) => {
                  void addReferences(event.target.files);
                  event.target.value = '';
                }}
              />
              {references.length ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {references.map((ref, index) => (
                    <div
                      key={`${ref.name}-${index}`}
                      className="relative overflow-hidden rounded-lg border border-white/10"
                    >
                      <img
                        src={ref.previewUrl}
                        alt={ref.name}
                        className="aspect-[3/4] w-full object-cover"
                      />
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded bg-black/70 px-2 py-0.5 text-[10px] text-white"
                        onClick={() =>
                          setReferences((prev) =>
                            prev.filter((_, i) => i !== index),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="space-y-3">
              <Label>Motion</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {MOTIONS.map((item) => (
                  <OptionChip
                    key={item.id}
                    active={motion === item.id}
                    title={item.label}
                    subtitle={item.detail}
                    onClick={() => form.setValue('motion', item.id)}
                  />
                ))}
              </div>
              <p className="text-sm text-mist">
                Also written into the creative brief that drives the script and
                which scenes call Hailuo.
              </p>
            </section>
          </>
        )}

        <section className="space-y-4">
              <Label>Subtitles</Label>
              <div className="flex flex-wrap gap-2">
                <OptionChip
                  active={captions.enabled}
                  title="On"
                  onClick={() => form.setValue('captionStyle.enabled', true)}
                />
                <OptionChip
                  active={!captions.enabled}
                  title="Off"
                  onClick={() => form.setValue('captionStyle.enabled', false)}
                />
              </div>
              {captions.enabled ? (
                <>
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-mist">
                      Size
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ['sm', 'S'],
                          ['md', 'M'],
                          ['lg', 'L'],
                          ['xl', 'XL'],
                        ] as const
                      ).map(([id, label]) => (
                        <OptionChip
                          key={id}
                          active={captions.size === id}
                          title={label}
                          onClick={() =>
                            form.setValue('captionStyle.size', id as CaptionSize)
                          }
                        />
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-mist">
                      Position
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(['bottom', 'middle', 'top'] as const).map((position) => (
                        <OptionChip
                          key={position}
                          active={captions.position === position}
                          title={position}
                          onClick={() =>
                            form.setValue('captionStyle.position', position)
                          }
                        />
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-mist">
                      Look
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <OptionChip
                        active={captions.look === 'stroke'}
                        title="Shadow"
                        onClick={() => form.setValue('captionStyle.look', 'stroke')}
                      />
                      <OptionChip
                        active={captions.look === 'pill'}
                        title="Box"
                        onClick={() => form.setValue('captionStyle.look', 'pill')}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-6">
                    <label className="space-y-2 text-sm text-mist">
                      Text color
                      <input
                        type="color"
                        className="mt-1 block h-11 w-16 cursor-pointer rounded-md border border-ink-600 bg-ink-900"
                        {...form.register('captionStyle.color')}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-mist">
                      Highlight
                      <input
                        type="color"
                        className="mt-1 block h-11 w-16 cursor-pointer rounded-md border border-ink-600 bg-ink-900"
                        {...form.register('captionStyle.highlight')}
                      />
                    </label>
                  </div>
                  <div
                    className="rounded-xl border border-white/10 px-4 py-6 text-center"
                    style={{
                      background:
                        captions.look === 'pill' ? 'rgba(0,0,0,0.75)' : '#121826',
                    }}
                  >
                    <span
                      className="text-2xl font-extrabold uppercase"
                      style={{
                        color: captions.color,
                        textShadow:
                          captions.look === 'stroke'
                            ? '0 4px 16px rgba(0,0,0,0.95)'
                            : 'none',
                      }}
                    >
                      This is{' '}
                    </span>
                    <span
                      className="text-2xl font-extrabold uppercase"
                      style={{ color: captions.highlight }}
                    >
                      the hook
                    </span>
                  </div>
                </>
              ) : null}
        </section>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        {scriptDraft && draftJobId ? (
          <section className="space-y-4 rounded-xl border border-accent/30 bg-ink-950/80 p-4">
            <div>
              <h2 className="font-display text-xl text-white">
                Review script
              </h2>
              <p className="mt-1 text-sm text-mist">
                Approve to start voice, images, and render. Timings follow the
                narration and will be refined after TTS.
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-mist">Title</p>
              <p className="text-lg font-semibold text-white">
                {scriptDraft.title}
              </p>
            </div>
            <div className="space-y-3">
              {scriptDraft.scenes.map((scene) => (
                <article
                  key={scene.index}
                  className="rounded-lg border border-white/10 bg-ink-900/80 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-white">
                      Scene {scene.index + 1} · {scene.type}
                    </p>
                    <p className="text-xs text-mist">
                      {formatClock(scene.startSec ?? 0)}–
                      {formatClock(scene.endSec ?? scene.durationSec)} ·{' '}
                      {scene.durationSec.toFixed(1)}s
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-white">{scene.narration}</p>
                  <p className="mt-1 text-[11px] leading-snug text-mist">
                    {scene.visualPrompt}
                  </p>
                </article>
              ))}
            </div>
            <p className="text-sm text-mist">
              Total{' '}
              {scriptDraft.scenes
                .reduce((sum, scene) => sum + scene.durationSec, 0)
                .toFixed(1)}
              s target
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="lg"
                disabled={approveMutation.isPending}
                onClick={() => approveMutation.mutate(draftJobId)}
              >
                {approveMutation.isPending ? 'Starting…' : 'Accept & render'}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="secondary"
                disabled={regenerateMutation.isPending}
                onClick={() => regenerateMutation.mutate(draftJobId)}
              >
                {regenerateMutation.isPending ? 'Rewriting…' : 'Regenerate'}
              </Button>
            </div>
          </section>
        ) : (
          <Button type="submit" size="lg" disabled={mutation.isPending}>
            {mutation.isPending
              ? sourceType === 'youtube'
                ? 'Queuing…'
                : 'Writing script…'
              : sourceType === 'youtube'
                ? `Find ${clipCount} clips`
                : `Write ${durationSec}s ${format.aspectLabel} script`}
          </Button>
        )}
      </form>
    </div>
  );
}
