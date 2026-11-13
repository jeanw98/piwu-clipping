import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import type {
  ClipJobDto,
  PaginatedResponse,
  ProviderUsageDto,
  ProviderUsageResponse,
} from '@piwu/shared';
import { JobStatus, isLinkClipSource, projectMonthlyCost } from '@piwu/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ClipCover } from '@/components/clip-cover';
import { StatusBadge } from '@/components/status-badge';
import { cn } from '@/lib/utils';

export function DashboardPage() {
  const queryClient = useQueryClient();
  const { data: usage } = useQuery({
    queryKey: ['usage'],
    queryFn: async () => {
      const res = await api.get<ProviderUsageResponse>('/usage');
      return res.data;
    },
    refetchInterval: 60_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['clips'],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<ClipJobDto>>('/clips', {
        params: { page: 1, limit: 20 },
      });
      return res.data;
    },
    refetchInterval: 8_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/clips/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['clips'] });
    },
  });

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">
            Your clips
          </h1>
          <p className="mt-1 text-sm text-mist">
            Queue status from script to final render.
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/dashboard/create">
            <Plus className="h-4 w-4" /> New clip
          </Link>
        </Button>
      </section>

      <ProviderUsage
        providers={usage?.providers}
        video={usage?.video}
      />

      {isLoading ? (
        <p className="text-sm text-mist">Loading library…</p>
      ) : !data?.data.length ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-ink-900/50 px-6 py-10 text-center">
          <p className="font-display text-lg text-white">No clips yet</p>
          <p className="mt-1 text-sm text-mist">
            Start with a prompt and we&apos;ll queue the full AI pipeline.
          </p>
          <Button className="mt-4" size="sm" asChild>
            <Link to="/dashboard/create">Create your first clip</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {data.data.map((clip) => (
            <article
              key={clip.id}
              className="group overflow-hidden rounded-xl border border-white/10 bg-ink-900/70 transition hover:border-accent/40"
            >
              <Link to={`/dashboard/clips/${clip.id}`} className="block">
                <div className="relative aspect-[9/12] bg-ink-800">
                  <ClipCover clip={clip} />
                  <div className="absolute left-2 top-2">
                    <StatusBadge status={clip.status} />
                  </div>
                </div>
              </Link>

              <div className="space-y-2 p-3">
                <div>
                  <h2 className="line-clamp-1 text-sm font-semibold text-white">
                    {clip.title || 'Untitled clip'}
                  </h2>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-mist">
                    {clip.status === JobStatus.AWAITING_APPROVAL
                      ? 'Script listo — ábrelo para aprobar o regenerar.'
                      : isLinkClipSource(clip.sourceType) &&
                          clip.variants?.length
                        ? `${clip.variants.length} viral clips`
                        : clip.prompt}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button asChild size="sm" variant="secondary" className="h-8 px-2.5 text-xs">
                    <Link to={`/dashboard/clips/${clip.id}`}>
                      {clip.status === JobStatus.AWAITING_APPROVAL
                        ? 'Review'
                        : 'Open'}
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 px-0"
                    onClick={() => deleteMutation.mutate(clip.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderUsage({
  providers,
  video,
}: {
  providers?: ProviderUsageDto[];
  video?: { model: string; resolution: string };
}) {
  const [clipsPerMonth, setClipsPerMonth] = useState(30);
  const [durationSec, setDurationSec] = useState<15 | 30 | 45 | 60>(30);
  const [motion, setMotion] = useState<'stills' | 'fake' | 'semi' | 'full'>(
    'semi',
  );

  const projection = useMemo(
    () =>
      projectMonthlyCost({
        clipsPerMonth,
        durationSec,
        motion,
        videoModel: video?.model ?? 'MiniMax-Hailuo-2.3-Fast',
        videoResolution: video?.resolution ?? '768P',
      }),
    [clipsPerMonth, durationSec, motion, video?.model, video?.resolution],
  );

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-white">Provider usage</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {(providers ?? []).map((provider) => (
            <article
              key={provider.id}
              className="rounded-xl border border-white/10 bg-ink-900/70 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-white">{provider.name}</p>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide',
                    provider.status === 'ok' &&
                      'bg-emerald-500/15 text-emerald-300',
                    provider.status === 'low' &&
                      'bg-amber-500/15 text-amber-300',
                    provider.status === 'empty' &&
                      'bg-red-500/15 text-red-300',
                    provider.status === 'unavailable' &&
                      'bg-white/10 text-mist',
                  )}
                >
                  {provider.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-white">{provider.summary}</p>
              {provider.detail ? (
                <p className="mt-1 text-[11px] leading-snug text-mist">
                  {provider.detail}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-ink-900/70 p-4">
        <h3 className="text-sm font-semibold text-white">
          Monthly cost projection
        </h3>
        <p className="mt-1 text-[11px] text-mist">
          List prices. Hailuo from MiniMax official pricing. Other providers are
          approximate.
        </p>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="space-y-1 text-xs text-mist">
            Clips / month
            <input
              type="number"
              min={0}
              max={5000}
              value={clipsPerMonth}
              onChange={(event) =>
                setClipsPerMonth(Number(event.target.value) || 0)
              }
              className="block w-28 rounded-md border border-ink-600 bg-ink-950 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <label className="space-y-1 text-xs text-mist">
            Duration
            <select
              value={durationSec}
              onChange={(event) =>
                setDurationSec(Number(event.target.value) as 15 | 30 | 45 | 60)
              }
              className="block rounded-md border border-ink-600 bg-ink-950 px-2 py-1.5 text-sm text-white"
            >
              <option value={15}>15s</option>
              <option value={30}>30s</option>
              <option value={45}>45s</option>
              <option value={60}>60s</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-mist">
            Motion
            <select
              value={motion}
              onChange={(event) =>
                setMotion(
                  event.target.value as 'stills' | 'fake' | 'semi' | 'full',
                )
              }
              className="block rounded-md border border-ink-600 bg-ink-950 px-2 py-1.5 text-sm text-white"
            >
              <option value="stills">Stills (fotos + Ken Burns)</option>
              <option value="fake">Stills v2 (fotos + cámara dinámica)</option>
              <option value="semi">Highlight (Hailuo hook+cierre)</option>
              <option value="full">Cinematic (todo Hailuo)</option>
            </select>
          </label>
          <p className="self-end text-xs text-mist">
            {projection.totalMinutes.toFixed(0)} min / month ·{' '}
            {projection.videoScenesPerClip} video scenes / clip
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <article className="rounded-lg border border-accent/30 bg-ink-950/60 p-3">
            <p className="text-xs uppercase tracking-wide text-mist">In use</p>
            <p className="mt-1 text-sm font-medium text-white">
              {projection.activeVideo.name}
            </p>
            <p className="mt-2 text-lg text-white">
              ${projection.activeVideo.monthlyUsd.toFixed(2)}
              <span className="ml-2 text-xs text-mist">
                ${projection.activeVideo.perClipUsd.toFixed(2)} / clip
              </span>
            </p>
            {projection.activeVideo.note ? (
              <p className="mt-1 text-[11px] text-mist">
                {projection.activeVideo.note}
              </p>
            ) : null}
          </article>
          <article className="rounded-lg border border-white/10 bg-ink-950/60 p-3">
            <p className="text-xs uppercase tracking-wide text-mist">Economy</p>
            <p className="mt-1 text-sm font-medium text-white">
              {projection.economyVideo.name}
            </p>
            <p className="mt-2 text-lg text-white">
              ${projection.economyVideo.monthlyUsd.toFixed(2)}
              <span className="ml-2 text-xs text-mist">
                ${projection.economyVideo.perClipUsd.toFixed(2)} / clip
              </span>
            </p>
            <p className="mt-1 text-[11px] text-mist">
              Set MINIMAX_VIDEO_MODEL=MiniMax-Hailuo-02 and
              MINIMAX_VIDEO_RESOLUTION=512P
            </p>
          </article>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {projection.others.map((line) => (
            <div
              key={line.id}
              className="rounded-lg border border-white/5 bg-ink-950/40 px-3 py-2"
            >
              <p className="text-xs text-mist">{line.name}</p>
              <p className="text-sm text-white">
                ${line.monthlyUsd.toFixed(2)}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-white">
          Total with current video model: $
          {projection.totalActiveUsd.toFixed(2)} / month · Economy total: $
          {projection.totalEconomyUsd.toFixed(2)}
        </p>
      </div>
    </section>
  );
}
