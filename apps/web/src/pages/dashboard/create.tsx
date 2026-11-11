import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import {
  DEFAULT_CAPTION_STYLE,
  LANGUAGE_LABELS,
  estimateSetupCost,
  generateClipSchema,
  platformDefaults,
  resolveVideoFormat,
  VISUAL_STYLE_LOCK,
  type CaptionSize,
  type ClipLanguage,
  type GenerateClipInput,
  type GenerateClipResponse,
  type GeneratedScript,
  type ProviderUsageResponse,
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
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Only JPEG, PNG, or WebP');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Each image must be under 8MB');
  }

  const bitmap = await createImageBitmap(file);
  const maxEdge = 1280;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process image');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result ? resolve(result) : reject(new Error('Image compress failed')),
      'image/jpeg',
      0.82,
    );
  });
  if (blob.size > 1.5 * 1024 * 1024) {
    throw new Error('Reference still too large after compress — try another photo');
  }

  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return {
    mime: 'image/jpeg',
    data: btoa(binary),
    previewUrl: URL.createObjectURL(blob),
    name: file.name.replace(/\.\w+$/, '.jpg'),
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
  { id: 'stills', label: 'Stills', hint: 'Fotos + Ken Burns' },
  { id: 'fake', label: 'Cartoon', hint: 'Sprites AI + puppet HTML' },
  { id: 'semi', label: 'Highlight', hint: 'Hailuo hook + cierre' },
  { id: 'full', label: 'Cinematic', hint: 'Todo Hailuo' },
  { id: 'auto', label: 'Auto', hint: 'Según prompt' },
] as const;
const VISUAL_STYLES = (
  Object.entries(VISUAL_STYLE_LOCK) as [
    keyof typeof VISUAL_STYLE_LOCK,
    { label: string; detail: string },
  ][]
).map(([id, meta]) => ({ id, label: meta.label }));
const ORIENTATIONS = [
  { id: 'portrait', label: '9:16' },
  { id: 'square', label: '1:1' },
  { id: 'landscape', label: '16:9' },
] as const;
const RESOLUTIONS = [
  { id: '1080p', label: '1080p' },
  { id: '720p', label: '720p' },
] as const;
const LANGUAGES = (
  Object.entries(LANGUAGE_LABELS) as [
    ClipLanguage,
    { label: string; detail: string },
  ][]
).map(([id, meta]) => ({
  id,
  label: meta.label,
}));

function Chip({
  active,
  children,
  onClick,
  className,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center rounded-md border px-2.5 py-1.5 text-xs font-medium transition',
        active
          ? 'border-accent bg-accent/15 text-accent'
          : 'border-white/10 text-mist hover:border-white/25 hover:text-white',
        className,
      )}
    >
      {children}
    </button>
  );
}

function CostPanel({
  totalUsd,
  lines,
  note,
}: {
  totalUsd: number;
  lines: Array<{ id: string; name: string; totalUsd: number; note?: string }>;
  note?: string;
}) {
  return (
    <aside className="rounded-xl border border-accent/25 bg-gradient-to-b from-accent/10 to-ink-950/90 p-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-mist">
        Estimated spend
      </p>
      <p className="mt-1 font-display text-3xl font-bold tracking-tight text-white">
        ${totalUsd.toFixed(2)}
      </p>
      <p className="mt-1 text-[11px] text-mist">
        {note ?? 'List-price estimate · updates as you configure'}
      </p>
      <ul className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
        {lines.map((line) => (
          <li
            key={line.id}
            className="flex items-baseline justify-between gap-2 text-xs"
          >
            <span className="text-mist">{line.name}</span>
            <span className="tabular-nums text-white">
              ${line.totalUsd.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function CreateClipPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [references, setReferences] = useState<ReferenceDraft[]>([]);
  const [draftJobId, setDraftJobId] = useState<string | null>(null);
  const [scriptDraft, setScriptDraft] = useState<GeneratedScript | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCaptions, setShowCaptions] = useState(false);

  const { data: usage } = useQuery({
    queryKey: ['usage'],
    queryFn: async () => {
      const res = await api.get<ProviderUsageResponse>('/usage');
      return res.data;
    },
    staleTime: 60_000,
  });

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
      motion: 'semi',
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
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number; data?: { message?: string | string[] } } })
        ?.response?.status;
      const message = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      if (status === 413) {
        setError(
          'Reference images are too large. Remove one or use smaller photos.',
        );
        return;
      }
      const detail = Array.isArray(message) ? message.join(', ') : message;
      setError(detail || 'Failed to create clip. Please try again.');
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

  const setupCost = useMemo(
    () =>
      estimateSetupCost({
        sourceType,
        durationSec,
        motion,
        prompt,
        clipCount,
        videoModel: usage?.video?.model,
        videoResolution: usage?.video?.resolution,
      }),
    [
      sourceType,
      durationSec,
      motion,
      prompt,
      clipCount,
      usage?.video?.model,
      usage?.video?.resolution,
    ],
  );

  const applyPlatform = (next: (typeof PLATFORMS)[number]['id']) => {
    const defaults = platformDefaults(next);
    form.setValue('platform', next);
    form.setValue('orientation', defaults.orientation);
    form.setValue('resolution', defaults.resolution);
    form.setValue('durationSec', defaults.durationSec);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">
            Create a clip
          </h1>
          <p className="mt-1 text-sm text-mist">
            Prompt or YouTube → script → render. Estimate updates live.
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-ink-900/80 px-3 py-2 text-right sm:hidden">
          <p className="text-[10px] uppercase tracking-wide text-mist">Est.</p>
          <p className="font-display text-xl font-bold text-accent">
            ${setupCost.totalUsd.toFixed(2)}
          </p>
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]"
      >
        <div className="space-y-4 rounded-2xl border border-white/10 bg-ink-900/70 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Chip
              active={sourceType === 'prompt'}
              onClick={() => form.setValue('sourceType', 'prompt')}
            >
              Prompt
            </Chip>
            <Chip
              active={sourceType === 'youtube'}
              onClick={() => form.setValue('sourceType', 'youtube')}
            >
              YouTube
            </Chip>
            <span className="mx-1 hidden h-4 w-px bg-white/10 sm:block" />
            {PLATFORMS.map((item) => (
              <Chip
                key={item.id}
                active={platform === item.id}
                onClick={() => applyPlatform(item.id)}
              >
                {item.label}
              </Chip>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-mist">
              Length
            </span>
            {DURATIONS.map((seconds) => (
              <Chip
                key={seconds}
                active={durationSec === seconds}
                onClick={() => form.setValue('durationSec', seconds)}
              >
                {seconds}s
              </Chip>
            ))}
            {sourceType === 'youtube' ? (
              <>
                <span className="mx-1 hidden h-4 w-px bg-white/10 sm:block" />
                <span className="text-[11px] uppercase tracking-wide text-mist">
                  Clips
                </span>
                {CLIP_COUNTS.map((count) => (
                  <Chip
                    key={count}
                    active={clipCount === count}
                    onClick={() => form.setValue('clipCount', count)}
                  >
                    {count}
                  </Chip>
                ))}
              </>
            ) : null}
          </div>

          {sourceType === 'youtube' ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
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
                ) : null}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-end justify-between gap-3">
                  <Label htmlFor="prompt">Focus (optional)</Label>
                  <span className="text-[11px] text-mist">
                    {prompt.length}/2000
                  </span>
                </div>
                <Textarea
                  id="prompt"
                  className="min-h-[88px]"
                  placeholder="Keep the joke about price, skip intro…"
                  {...form.register('prompt')}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-end justify-between gap-3">
                  <Label htmlFor="prompt">Prompt</Label>
                  <span className="text-[11px] text-mist">
                    {prompt.length}/2000
                  </span>
                </div>
                <Textarea
                  id="prompt"
                  className="min-h-[120px]"
                  placeholder="Hook first. One idea. Name the look (UGC, anime, cinematic…)."
                  {...form.register('prompt')}
                />
                {form.formState.errors.prompt ? (
                  <p className="text-sm text-red-400">
                    {form.formState.errors.prompt.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>Look</Label>
                <div className="flex flex-wrap gap-1.5">
                  {VISUAL_STYLES.map((item) => (
                    <Chip
                      key={item.id}
                      active={visualStyle === item.id}
                      onClick={() => form.setValue('visualStyle', item.id)}
                    >
                      {item.label}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Motion</Label>
                <div className="flex flex-wrap gap-1.5">
                  {MOTIONS.map((item) => (
                    <Chip
                      key={item.id}
                      active={motion === item.id}
                      onClick={() => form.setValue('motion', item.id)}
                      className="flex-col items-start gap-0.5 !py-2"
                    >
                      <span>{item.label}</span>
                      <span className="text-[10px] font-normal opacity-70">
                        {item.hint}
                      </span>
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="references">Referencia</Label>
                  <span className="text-[11px] text-mist">
                    {references.length}/4 optional
                  </span>
                </div>
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
                  <div className="grid grid-cols-4 gap-2">
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
                          className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white"
                          onClick={() =>
                            setReferences((prev) =>
                              prev.filter((_, i) => i !== index),
                            )
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-white/10">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 bg-ink-950/60 px-3 py-2.5 text-left text-sm text-white"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              <span>
                Format · {format.aspectLabel} · {resolution} ·{' '}
                {LANGUAGE_LABELS[language].label} · {stylePreset}
              </span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-mist transition',
                  showAdvanced && 'rotate-180',
                )}
              />
            </button>
            {showAdvanced ? (
              <div className="space-y-4 border-t border-white/10 p-3">
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wide text-mist">
                    Frame
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {ORIENTATIONS.map((item) => (
                      <Chip
                        key={item.id}
                        active={orientation === item.id}
                        onClick={() => form.setValue('orientation', item.id)}
                      >
                        {item.label}
                      </Chip>
                    ))}
                    {RESOLUTIONS.map((item) => (
                      <Chip
                        key={item.id}
                        active={resolution === item.id}
                        onClick={() => form.setValue('resolution', item.id)}
                      >
                        {item.label}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wide text-mist">
                    Language
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {LANGUAGES.map((item) => (
                      <Chip
                        key={item.id}
                        active={language === item.id}
                        onClick={() => form.setValue('language', item.id)}
                      >
                        {item.label}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wide text-mist">
                    Style preset
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESETS.map((preset) => (
                      <Chip
                        key={preset}
                        active={stylePreset === preset}
                        onClick={() => form.setValue('stylePreset', preset)}
                      >
                        {preset}
                      </Chip>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-xl border border-white/10">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 bg-ink-950/60 px-3 py-2.5 text-left text-sm text-white"
              onClick={() => setShowCaptions((v) => !v)}
            >
              <span>
                Subtitles · {captions.enabled ? 'On' : 'Off'}
                {captions.enabled
                  ? ` · ${captions.size.toUpperCase()} · ${captions.position}`
                  : ''}
              </span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-mist transition',
                  showCaptions && 'rotate-180',
                )}
              />
            </button>
            {showCaptions ? (
              <div className="space-y-3 border-t border-white/10 p-3">
                <div className="flex flex-wrap gap-1.5">
                  <Chip
                    active={captions.enabled}
                    onClick={() => form.setValue('captionStyle.enabled', true)}
                  >
                    On
                  </Chip>
                  <Chip
                    active={!captions.enabled}
                    onClick={() => form.setValue('captionStyle.enabled', false)}
                  >
                    Off
                  </Chip>
                </div>
                {captions.enabled ? (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          ['sm', 'S'],
                          ['md', 'M'],
                          ['lg', 'L'],
                          ['xl', 'XL'],
                        ] as const
                      ).map(([id, label]) => (
                        <Chip
                          key={id}
                          active={captions.size === id}
                          onClick={() =>
                            form.setValue(
                              'captionStyle.size',
                              id as CaptionSize,
                            )
                          }
                        >
                          {label}
                        </Chip>
                      ))}
                      {(['bottom', 'middle', 'top'] as const).map(
                        (position) => (
                          <Chip
                            key={position}
                            active={captions.position === position}
                            onClick={() =>
                              form.setValue('captionStyle.position', position)
                            }
                          >
                            {position}
                          </Chip>
                        ),
                      )}
                      <Chip
                        active={captions.look === 'stroke'}
                        onClick={() =>
                          form.setValue('captionStyle.look', 'stroke')
                        }
                      >
                        Shadow
                      </Chip>
                      <Chip
                        active={captions.look === 'pill'}
                        onClick={() =>
                          form.setValue('captionStyle.look', 'pill')
                        }
                      >
                        Box
                      </Chip>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <label className="space-y-1 text-xs text-mist">
                        Text
                        <input
                          type="color"
                          className="mt-1 block h-9 w-12 cursor-pointer rounded border border-ink-600 bg-ink-900"
                          {...form.register('captionStyle.color')}
                        />
                      </label>
                      <label className="space-y-1 text-xs text-mist">
                        Highlight
                        <input
                          type="color"
                          className="mt-1 block h-9 w-12 cursor-pointer rounded border border-ink-600 bg-ink-900"
                          {...form.register('captionStyle.highlight')}
                        />
                      </label>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          {scriptDraft && draftJobId ? (
            <section className="space-y-3 rounded-xl border border-accent/30 bg-ink-950/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg text-white">
                    Review script
                  </h2>
                  <p className="mt-0.5 text-xs text-mist">
                    Approve to start voice, images, and render.
                  </p>
                </div>
                <p className="font-display text-lg font-bold text-accent">
                  ~${setupCost.totalUsd.toFixed(2)}
                </p>
              </div>
              <p className="text-sm font-semibold text-white">
                {scriptDraft.title}
              </p>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {scriptDraft.scenes.map((scene) => (
                  <article
                    key={scene.index}
                    className="rounded-lg border border-white/10 bg-ink-900/80 p-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium text-white">
                        Scene {scene.index + 1} · {scene.type}
                      </p>
                      <p className="text-[11px] text-mist">
                        {formatClock(scene.startSec ?? 0)}–
                        {formatClock(scene.endSec ?? scene.durationSec)} ·{' '}
                        {scene.durationSec.toFixed(1)}s
                      </p>
                    </div>
                    <p className="mt-1.5 text-sm text-white">{scene.narration}</p>
                  </article>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={approveMutation.isPending}
                  onClick={() => approveMutation.mutate(draftJobId)}
                >
                  {approveMutation.isPending
                    ? 'Starting…'
                    : `Accept · ~$${setupCost.totalUsd.toFixed(2)}`}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={regenerateMutation.isPending}
                  onClick={() => regenerateMutation.mutate(draftJobId)}
                >
                  {regenerateMutation.isPending ? 'Rewriting…' : 'Regenerate'}
                </Button>
              </div>
            </section>
          ) : (
            <Button type="submit" className="w-full sm:w-auto" disabled={mutation.isPending}>
              {mutation.isPending
                ? sourceType === 'youtube'
                  ? 'Queuing…'
                  : 'Writing script…'
                : sourceType === 'youtube'
                  ? `Find ${clipCount} clips · ~$${setupCost.totalUsd.toFixed(2)}`
                  : `Write ${durationSec}s script · ~$${setupCost.totalUsd.toFixed(2)}`}
            </Button>
          )}
        </div>

        <div className="hidden lg:block">
          <div className="sticky top-6 space-y-3">
            <CostPanel totalUsd={setupCost.totalUsd} lines={setupCost.lines} />
            <div className="rounded-xl border border-white/10 bg-ink-900/60 p-3 text-[11px] leading-relaxed text-mist">
              <p className="font-medium text-white">
                {format.width}×{format.height} · {durationSec}s
              </p>
              <p className="mt-1">
                Motion: {motion}
                {sourceType === 'prompt' ? ` · ${visualStyle}` : ''}
              </p>
              <p className="mt-2">
                Stills = fotos + zoom. Cartoon = sprites Leonardo + animación
                HTML. Highlight = Hailuo en hook/cierre. Cinematic = todo
                Hailuo.
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
