import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import type {
  ClipJobDto,
  PaginatedResponse,
  ProjectDto,
  ProviderUsageDto,
  ProviderUsageResponse,
} from '@piwu/shared';
import { JobStatus, isLinkClipSource, projectMonthlyCost } from '@piwu/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ClipCover } from '@/components/clip-cover';
import { StatusBadge } from '@/components/status-badge';
import { cn } from '@/lib/utils';

type StatusGroup = '' | 'in_progress' | 'ready' | 'failed';

const STATUS_GROUPS: { id: StatusGroup; label: string }[] = [
  { id: '', label: 'All' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'ready', label: 'Ready' },
  { id: 'failed', label: 'Failed' },
];

const PAGE_SIZE = 20;

export function DashboardPage() {
  const queryClient = useQueryClient();
  const [projectFilter, setProjectFilter] = useState<string>('');
  const [statusGroup, setStatusGroup] = useState<StatusGroup>('');

  const { data: usage } = useQuery({
    queryKey: ['usage'],
    queryFn: async () => {
      const res = await api.get<ProviderUsageResponse>('/usage');
      return res.data;
    },
    refetchInterval: 60_000,
  });

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await api.get<ProjectDto[]>('/projects');
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['clips', projectFilter, statusGroup],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const res = await api.get<PaginatedResponse<ClipJobDto>>('/clips', {
        params: {
          page: pageParam,
          limit: PAGE_SIZE,
          ...(projectFilter ? { projectId: projectFilter } : {}),
          ...(statusGroup ? { statusGroup } : {}),
        },
      });
      return res.data;
    },
    getNextPageParam: (last) =>
      last.page < last.totalPages ? last.page + 1 : undefined,
    refetchInterval: 8_000,
  });

  const clips = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data],
  );

  const grouped = useMemo(() => groupClipsByRecency(clips), [clips]);

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
        <Button asChild size="sm" className="hidden sm:inline-flex">
          <Link to="/dashboard/create">
            <Plus className="h-4 w-4" /> New clip
          </Link>
        </Button>
      </section>

      <ProviderUsage
        providers={usage?.providers}
        video={usage?.video}
      />

      <div className="sticky top-14 z-30 -mx-4 space-y-3 border-b border-white/5 bg-ink-950/90 px-4 py-3 backdrop-blur md:top-16 md:mx-0 md:rounded-xl md:border md:border-white/10 md:bg-ink-900/80">
        <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {STATUS_GROUPS.map((group) => (
            <button
              key={group.id || 'all'}
              type="button"
              className={cn(
                'min-h-[44px] shrink-0 rounded-lg px-3.5 text-sm font-medium',
                statusGroup === group.id
                  ? 'bg-accent text-ink-950'
                  : 'bg-ink-800 text-mist hover:text-white',
              )}
              onClick={() => setStatusGroup(group.id)}
            >
              {group.label}
            </button>
          ))}
        </div>

        {(projects?.length ?? 0) > 0 ? (
          <div className="flex items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="shrink-0 text-[11px] uppercase tracking-wide text-mist">
              Project
            </span>
            <button
              type="button"
              className={cn(
                'min-h-[40px] shrink-0 rounded-lg px-3 text-sm',
                !projectFilter
                  ? 'bg-ink-700 text-white'
                  : 'text-mist hover:text-white',
              )}
              onClick={() => setProjectFilter('')}
            >
              All
            </button>
            {projects?.map((project) => (
              <button
                key={project.id}
                type="button"
                className={cn(
                  'min-h-[40px] shrink-0 rounded-lg px-3 text-sm',
                  projectFilter === project.id
                    ? 'bg-ink-700 text-white'
                    : 'text-mist hover:text-white',
                )}
                onClick={() => setProjectFilter(project.id)}
              >
                {project.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <p className="text-sm text-mist">Loading library…</p>
      ) : !clips.length ? (
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
        <div className="space-y-8">
          {grouped.map((section) => (
            <section key={section.label} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-mist">
                {section.label}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {section.clips.map((clip) => (
                  <article
                    key={clip.id}
                    className="group relative overflow-hidden rounded-xl border border-white/10 bg-ink-900/70 transition hover:border-accent/40"
                  >
                    <Link to={`/dashboard/clips/${clip.id}`} className="block">
                      <div className="relative aspect-[9/12] bg-ink-800">
                        <ClipCover clip={clip} />
                        <div className="absolute left-2 top-2">
                          <StatusBadge status={clip.status} />
                        </div>
                        <div className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white/90">
                          {formatRelativeDate(clip.createdAt)}
                        </div>
                      </div>
                      <div className="space-y-1 p-3 pr-12">
                        <h3 className="line-clamp-1 text-sm font-semibold text-white">
                          {clip.title || 'Untitled clip'}
                        </h3>
                        {clip.projectName ? (
                          <p className="text-[10px] uppercase tracking-wide text-accent/80">
                            {clip.projectName}
                          </p>
                        ) : null}
                        <p className="line-clamp-2 text-[11px] leading-snug text-mist">
                          {clip.status === JobStatus.AWAITING_APPROVAL
                            ? 'Script listo — ábrelo para aprobar o regenerar.'
                            : isLinkClipSource(clip.sourceType) &&
                                clip.variants?.length
                              ? `${clip.variants.length} viral clips`
                              : clip.prompt}
                        </p>
                      </div>
                    </Link>
                    <button
                      type="button"
                      className="absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full text-mist opacity-80 hover:bg-ink-800 hover:text-red-300 sm:opacity-0 sm:group-hover:opacity-100"
                      aria-label="Delete clip"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        deleteMutation.mutate(clip.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ))}

          {hasNextPage ? (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-h-[44px] px-6"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThatDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfThatDay.getTime()) / 86_400_000,
  );
  if (dayDiff <= 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) return `${dayDiff}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function groupClipsByRecency(clips: ClipJobDto[]): { label: string; clips: ClipJobDto[] }[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);

  const buckets: Record<'Today' | 'This week' | 'Earlier', ClipJobDto[]> = {
    Today: [],
    'This week': [],
    Earlier: [],
  };

  for (const clip of clips) {
    const created = new Date(clip.createdAt);
    if (Number.isNaN(created.getTime()) || created < startOfWeek) {
      buckets.Earlier.push(clip);
    } else if (created >= startOfToday) {
      buckets.Today.push(clip);
    } else {
      buckets['This week'].push(clip);
    }
  }

  return (['Today', 'This week', 'Earlier'] as const)
    .filter((label) => buckets[label].length > 0)
    .map((label) => ({ label, clips: buckets[label] }));
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
  const [motion, setMotion] = useState<'stills' | 'stills_dynamic' | 'semi' | 'full' | 'graphics'>(
    'semi',
  );
  // Collapsed by default: the library is what this page is for.
  const [open, setOpen] = useState(false);
  const list = providers ?? [];
  const alerts = list.filter((provider) => provider.status === 'low' || provider.status === 'empty');

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

  const dot = (status: ProviderUsageDto['status']) =>
    cn(
      'h-2 w-2 shrink-0 rounded-full',
      status === 'ok' && 'bg-emerald-400',
      status === 'low' && 'bg-amber-400',
      status === 'empty' && 'bg-red-400',
      status === 'unavailable' && 'bg-white/30',
    );

  if (!open) {
    return (
      <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/10 bg-ink-900/50 px-3 py-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          {list.map((provider) => (
            <span
              key={provider.id}
              className="flex items-center gap-1.5 text-xs text-mist"
              title={`${provider.summary}${provider.detail ? ` — ${provider.detail}` : ''}`}
            >
              <span className={dot(provider.status)} />
              {provider.name}
            </span>
          ))}
          {alerts.map((provider) => (
            <span
              key={`alert-${provider.id}`}
              className={cn(
                'rounded-md px-2 py-0.5 text-xs',
                provider.status === 'empty' ? 'bg-red-500/15 text-red-200' : 'bg-amber-500/15 text-amber-200',
              )}
            >
              {provider.name}: {provider.summary}
            </span>
          ))}
        </div>
        <button
          type="button"
          className="flex min-h-[36px] items-center gap-1 text-xs font-medium text-mist hover:text-white"
          onClick={() => setOpen(true)}
        >
          Saldos y costos <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Provider usage</h2>
          <button
            type="button"
            className="flex min-h-[36px] items-center gap-1 text-xs font-medium text-mist hover:text-white"
            onClick={() => setOpen(false)}
          >
            Ocultar <ChevronUp className="h-3.5 w-3.5" />
          </button>
        </div>
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
                  event.target.value as 'stills' | 'stills_dynamic' | 'semi' | 'full' | 'graphics',
                )
              }
              className="block rounded-md border border-ink-600 bg-ink-950 px-2 py-1.5 text-sm text-white"
            >
              <option value="stills">Stills (fotos + Ken Burns)</option>
              <option value="stills_dynamic">Stills v2 (fotos + cámara dinámica)</option>
              <option value="graphics">Motion Graphics (2D por código)</option>
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
