import type React from 'react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Player } from '@remotion/player';
import { Download, ArrowLeft } from 'lucide-react';
import type { ClipJobDto } from '@piwu/shared';
import { LANGUAGE_LABELS, JobStatus, resolveVideoFormat } from '@piwu/shared';
import { api, mediaUrl } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
import { ViralClip } from '@/remotion/ViralClip';
import { authStorage } from '@/lib/auth-storage';
import { useAuthenticatedMedia } from '@/hooks/use-authenticated-media';

export function ClipDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [variantSrc, setVariantSrc] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const { data: clip, isLoading } = useQuery({
    queryKey: ['clips', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await api.get<ClipJobDto>(`/clips/${id}`);
      return res.data;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === JobStatus.COMPLETED || status === JobStatus.FAILED) {
        return false;
      }
      return 4_000;
    },
  });

  const media = useAuthenticatedMedia(
    clip?.sourceType === 'youtube' ? undefined : clip,
  );
  const variants = [...(clip?.variants ?? [])].sort((a, b) => b.score - a.score);
  const selected =
    variants.find((item) => item.id === selectedId) ??
    variants.find((item) => item.outputVideoUrl) ??
    variants[0];
  const previewPath =
    selected?.outputVideoUrl ??
    (clip?.sourceType === 'youtube' ? clip.outputVideoUrl : null);

  useEffect(() => {
    if (!previewPath) {
      setVariantSrc(null);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    let objectUrl = '';
    const run = async () => {
      try {
        const { data } = await api.get<{ url: string; direct: boolean }>(
          '/storage/resolve',
          { params: { path: previewPath } },
        );
        if (cancelled) return;
        if (data.direct && data.url.startsWith('http')) {
          setPreviewError(null);
          setVariantSrc(data.url);
          return;
        }
        const token = authStorage.getAccessToken();
        const res = await fetch(mediaUrl(previewPath), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Preview failed (${res.status})`);
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewError(null);
        setVariantSrc(objectUrl);
      } catch (error) {
        if (cancelled || (error as Error).name === 'AbortError') return;
        setPreviewError((error as Error).message);
      }
    };
    void run();
    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [previewPath]);

  const format = resolveVideoFormat(
    clip?.orientation ?? 'portrait',
    clip?.resolution ?? '1080p',
  );

  if (isLoading || !clip) {
    return <p className="text-mist">Loading clip…</p>;
  }

  const stillGenerating =
    clip.status !== JobStatus.COMPLETED && clip.status !== JobStatus.FAILED;
  const youtubeJob = clip.sourceType === 'youtube';
  const canPreview =
    !youtubeJob &&
    Boolean(media.inputProps) &&
    (Boolean(clip.assets?.length) || Boolean(clip.audioUrl));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            to="/dashboard"
            className="mb-3 inline-flex items-center gap-2 text-sm text-mist hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Back to library
          </Link>
          <h1 className="font-display text-3xl font-bold text-white">
            {clip.title || 'Processing clip'}
          </h1>
          <p className="mt-2 max-w-2xl text-mist">{clip.prompt}</p>
          {clip.sourceUrl && clip.sourceUrl !== clip.prompt ? (
            <p className="mt-1 max-w-2xl text-xs text-mist">{clip.sourceUrl}</p>
          ) : null}
          <p className="mt-2 text-xs uppercase tracking-wide text-mist">
            {(clip.platform ?? 'custom').toString()} · {format.aspectLabel} ·{' '}
            {format.width}×{format.height} · {clip.durationSec ?? 30}s target ·{' '}
            {clip.stylePreset ?? 'viral'} ·{' '}
            {LANGUAGE_LABELS[clip.language ?? 'es-LA']?.label ??
              clip.language ??
              'es-LA'}{' '}
            (
            {LANGUAGE_LABELS[clip.language ?? 'es-LA']?.detail ??
              clip.language ??
              'LatAm'}
            )
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={clip.status} />
          {clip.status === JobStatus.COMPLETED &&
          (selected?.outputVideoUrl || clip.outputVideoUrl) ? (
            <Button
              type="button"
              onClick={() =>
                void downloadFromAws(
                  clip.id,
                  selected?.id,
                  `${clip.id}${selected ? `-v${selected.index}` : ''}.mp4`,
                )
              }
            >
              <Download className="h-4 w-4" /> Download MP4
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black shadow-glow">
          {youtubeJob && variantSrc ? (
            <video
              key={variantSrc}
              src={variantSrc}
              controls
              playsInline
              className="w-full"
            />
          ) : canPreview && media.inputProps ? (
            <Player
              component={ViralClip as unknown as React.FC<Record<string, unknown>>}
              inputProps={media.inputProps as unknown as Record<string, unknown>}
              durationInFrames={media.durationInFrames}
              compositionWidth={media.width}
              compositionHeight={media.height}
              fps={media.fps}
              style={{ width: '100%' }}
              controls
            />
          ) : (
            <div
              className="flex flex-col items-center justify-center gap-2 p-6 text-center text-mist"
              style={{ aspectRatio: `${format.width} / ${format.height}` }}
            >
              {media.loading
                ? 'Loading secured media…'
                : stillGenerating
                  ? `Generating visuals… ${clip.progress}%`
                  : 'Preview unlocks once assets are ready.'}
              {previewError || media.error ? (
                <span className="text-xs text-red-400">
                  {previewError || media.error}
                </span>
              ) : null}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-white/10 bg-ink-900/70 p-5">
            <h2 className="font-display text-xl font-semibold text-white">
              Pipeline
            </h2>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink-700">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${clip.progress}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-mist">
              Status: {clip.status.replaceAll('_', ' ').toLowerCase()} ·{' '}
              {clip.progress}%
            </p>
            {stillGenerating && clip.status === JobStatus.GENERATING_ASSETS ? (
              <p className="mt-2 text-sm text-mist">
                {youtubeJob
                  ? 'Cutting each clip and tightening the pauses. Renders start after the cuts are ready.'
                  : clip.motion === 'fake'
                    ? 'Generando Cartoon (sprites + canvas)…'
                    : 'Building scenes. Stills come first; animation runs only on the hook and payoff.'}
              </p>
            ) : null}
            {clip.errorMessage ? (
              <p className="mt-3 text-sm text-red-400">{clip.errorMessage}</p>
            ) : null}
          </section>

          {clip.costJson ? (
            <section className="rounded-2xl border border-white/10 bg-ink-900/70 p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-xl font-semibold text-white">
                  Spend
                </h2>
                <p className="font-display text-2xl font-bold text-accent">
                  ${clip.costJson.totalUsd.toFixed(2)}
                </p>
              </div>
              <p className="mt-1 text-xs text-mist">
                Estimated list price
                {clip.costJson.estimated ? ' · not billed invoice' : ''}
              </p>
              <ul className="mt-4 space-y-2">
                {clip.costJson.lines.map((line) => (
                  <li
                    key={line.id}
                    className="flex items-start justify-between gap-3 text-sm"
                  >
                    <div>
                      <p className="text-white">{line.name}</p>
                      {line.note ? (
                        <p className="text-xs text-mist">{line.note}</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-mist">
                      ${line.totalUsd.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {youtubeJob ? (
            <section className="rounded-2xl border border-white/10 bg-ink-900/70 p-5">
              <h2 className="font-display text-xl font-semibold text-white">
                Clips
              </h2>
              <ul className="mt-4 space-y-3">
                {variants.map((variant) => (
                  <li key={variant.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(variant.id)}
                      className={`w-full rounded-lg border p-3 text-left ${
                        selected?.id === variant.id
                          ? 'border-accent bg-accent/10'
                          : 'border-white/5 bg-ink-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-white">
                          {variant.score} · {variant.title}
                        </span>
                        <span className="text-xs uppercase text-mist">
                          {Math.max(1, Math.round(variant.endSec - variant.startSec))}s
                        </span>
                      </div>
                      {variant.reason ? (
                        <p className="mt-2 text-sm text-mist">{variant.reason}</p>
                      ) : null}
                    </button>
                    {variant.outputVideoUrl ? (
                      <button
                        type="button"
                        className="mt-2 text-xs text-accent"
                        onClick={() =>
                          void downloadFromAws(
                            clip.id,
                            variant.id,
                            `${clip.id}-v${variant.index}.mp4`,
                          )
                        }
                      >
                        Download
                      </button>
                    ) : (
                      <p className="mt-2 text-xs uppercase text-mist">
                        {variant.status.replaceAll('_', ' ').toLowerCase()}
                      </p>
                    )}
                  </li>
                ))}
                {!variants.length ? (
                  <li className="text-sm text-mist">
                    {stillGenerating
                      ? 'Clips show up here as each one finishes rendering.'
                      : clip.outputVideoUrl
                        ? 'This render is one montage. New YouTube jobs list each clip here.'
                        : 'No clips yet.'}
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}

          {!youtubeJob ? (
          <section className="rounded-2xl border border-white/10 bg-ink-900/70 p-5">
            <h2 className="font-display text-xl font-semibold text-white">
              Scenes
            </h2>
            <ul className="mt-4 space-y-3">
              {(clip.assets ?? []).map((asset) => (
                <li
                  key={asset.id}
                  className="rounded-lg border border-white/5 bg-ink-800/60 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-white">
                      Scene {asset.sceneIndex + 1}
                    </span>
                    <span className="text-xs uppercase text-mist">
                      {asset.type} · {asset.durationSec}s
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-mist">{asset.prompt}</p>
                </li>
              ))}
              {!clip.assets?.length ? (
                <li className="text-sm text-mist">
                  {stillGenerating
                    ? 'Scenes will appear as each one finishes generating…'
                    : 'No scenes yet.'}
                </li>
              ) : null}
            </ul>
          </section>
          ) : null}

          <section className="rounded-2xl border border-white/10 bg-ink-900/70 p-5">
            <h2 className="font-display text-xl font-semibold text-white">
              Word timeline
            </h2>
            <div className="mt-4 max-h-64 overflow-auto rounded-lg bg-ink-950/80 p-3 font-mono text-xs text-mist">
              {(clip.timestampsJson ?? []).length ? (
                clip.timestampsJson!.map((word, index) => (
                  <span
                    key={`${word.word}-${index}`}
                    className="mr-2 inline-block"
                  >
                    <span className="text-accent">
                      {word.start.toFixed(2)}s
                    </span>{' '}
                    {word.word}
                  </span>
                ))
              ) : (
                <span>Waiting for word timing…</span>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

async function downloadFromAws(
  clipId: string,
  variantId: string | undefined,
  filename: string,
): Promise<void> {
  const res = await api.get<{ url: string; direct: boolean; filename: string }>(
    `/clips/${clipId}/download`,
    { params: variantId ? { variantId } : undefined },
  );
  const a = document.createElement('a');
  a.href = res.data.url;
  a.download = res.data.filename || filename;
  a.rel = 'noopener';
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
