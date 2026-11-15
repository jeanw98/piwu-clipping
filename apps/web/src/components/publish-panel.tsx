import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, ExternalLink, RotateCcw, Send, X } from 'lucide-react';
import {
  SOCIAL_PROVIDER_LABELS,
  type PostPrivacy,
  type ScheduledPostDto,
  type SchedulePostInput,
  type SocialAccountDto,
} from '@piwu/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STATUS_ES: Record<ScheduledPostDto['status'], { label: string; tone: string }> = {
  SCHEDULED: { label: 'Programada', tone: 'bg-sky-500/15 text-sky-300' },
  PUBLISHING: { label: 'Publicando…', tone: 'bg-amber-500/15 text-amber-300' },
  PUBLISHED: { label: 'Publicada', tone: 'bg-emerald-500/15 text-emerald-300' },
  FAILED: { label: 'Falló', tone: 'bg-red-500/15 text-red-300' },
  CANCELED: { label: 'Cancelada', tone: 'bg-white/10 text-mist' },
};

/** `YYYY-MM-DDTHH:mm` in local time for <input type="datetime-local">. */
function localInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const errorMessage = (err: unknown) => {
  const message = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(message) ? message.join(', ') : message ?? 'No se pudo programar';
};

export function PublishPanel({
  clipJobId,
  variantId,
  defaultTitle,
}: {
  clipJobId: string;
  variantId?: string | null;
  defaultTitle: string;
}) {
  const queryClient = useQueryClient();
  const accounts = useQuery({
    queryKey: ['social', 'accounts'],
    queryFn: async () => (await api.get<SocialAccountDto[]>('/social/accounts')).data,
  });
  const posts = useQuery({
    queryKey: ['posts', clipJobId],
    queryFn: async () => (await api.get<ScheduledPostDto[]>('/posts', { params: { clipJobId } })).data,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((p) => p.status === 'SCHEDULED' || p.status === 'PUBLISHING') ? 10_000 : false,
  });

  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState(defaultTitle);
  const [caption, setCaption] = useState(`${defaultTitle}\n\n#shorts #reels #tiktok`);
  const [privacy, setPrivacy] = useState<PostPrivacy>('public');
  const [mode, setMode] = useState<'now' | 'later'>('now');
  const [when, setWhen] = useState(() => localInputValue(new Date(Date.now() + 60 * 60 * 1000)));

  const schedule = useMutation({
    mutationFn: async () => {
      const body: SchedulePostInput = {
        clipJobId,
        variantId: variantId ?? null,
        accountIds: selected,
        title,
        caption,
        privacy,
        scheduledAt: mode === 'later' ? new Date(when).toISOString() : null,
      };
      return (await api.post<ScheduledPostDto[]>('/posts', body)).data;
    },
    onSuccess: () => {
      setSelected([]);
      void queryClient.invalidateQueries({ queryKey: ['posts', clipJobId] });
    },
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => api.delete(`/posts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['posts', clipJobId] }),
  });
  const retry = useMutation({
    mutationFn: async (id: string) => api.post(`/posts/${id}/retry`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['posts', clipJobId] }),
  });

  const list = Array.isArray(accounts.data) ? accounts.data : [];
  const postList = Array.isArray(posts.data) ? posts.data : [];
  const minWhen = useMemo(() => localInputValue(new Date(Date.now() + 2 * 60 * 1000)), []);
  const laterInvalid = mode === 'later' && (!when || new Date(when).getTime() < Date.now());

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-ink-900/70 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-white">Publicar</h2>
        <Link to="/dashboard/accounts" className="text-xs text-accent hover:underline">
          Administrar cuentas
        </Link>
      </div>

      {!list.length ? (
        <p className="text-sm text-mist">
          Aún no vinculas cuentas.{' '}
          <Link to="/dashboard/accounts" className="text-accent hover:underline">
            Vincula YouTube, Instagram o TikTok
          </Link>{' '}
          para publicar este clip.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {list.map((account) => {
              const on = selected.includes(account.id);
              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() =>
                    setSelected((prev) => (on ? prev.filter((id) => id !== account.id) : [...prev, account.id]))
                  }
                  className={cn(
                    'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition',
                    on ? 'border-accent bg-accent/15 text-white' : 'border-white/10 text-mist hover:border-white/30',
                  )}
                >
                  {account.avatarUrl ? <img src={account.avatarUrl} alt="" className="h-5 w-5 rounded-full" /> : null}
                  <span>{account.displayName}</span>
                  <span className="opacity-60">· {SOCIAL_PROVIDER_LABELS[account.provider]}</span>
                </button>
              );
            })}
          </div>

          <label className="block space-y-1 text-xs text-mist">
            Título (YouTube)
            <input
              className="h-9 w-full rounded-md border border-white/10 bg-ink-950 px-3 text-sm text-white"
              value={title}
              maxLength={100}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="block space-y-1 text-xs text-mist">
            Descripción / caption
            <textarea
              className="min-h-[90px] w-full rounded-md border border-white/10 bg-ink-950 px-3 py-2 text-sm text-white"
              value={caption}
              maxLength={2200}
              onChange={(event) => setCaption(event.target.value)}
            />
          </label>

          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-xs text-mist">
              Privacidad
              <select
                className="block h-9 rounded-md border border-white/10 bg-ink-950 px-2 text-sm text-white"
                value={privacy}
                onChange={(event) => setPrivacy(event.target.value as PostPrivacy)}
              >
                <option value="public">Pública</option>
                <option value="unlisted">No listada (solo YouTube)</option>
                <option value="private">Privada</option>
              </select>
            </label>
            <div className="flex gap-1 rounded-md border border-white/10 p-0.5">
              {(['now', 'later'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={cn(
                    'rounded px-3 py-1.5 text-xs',
                    mode === value ? 'bg-white/10 text-white' : 'text-mist',
                  )}
                >
                  {value === 'now' ? 'Ahora' : 'Programar'}
                </button>
              ))}
            </div>
            {mode === 'later' ? (
              <input
                type="datetime-local"
                className="h-9 rounded-md border border-white/10 bg-ink-950 px-2 text-sm text-white"
                value={when}
                min={minWhen}
                onChange={(event) => setWhen(event.target.value)}
              />
            ) : null}
          </div>
          {mode === 'later' ? (
            <p className="text-[11px] text-mist">
              Hora local de tu navegador ({Intl.DateTimeFormat().resolvedOptions().timeZone}).
            </p>
          ) : null}

          {schedule.isError ? <p className="text-sm text-red-400">{errorMessage(schedule.error)}</p> : null}
          <Button
            type="button"
            disabled={!selected.length || !caption.trim() || laterInvalid || schedule.isPending}
            onClick={() => schedule.mutate()}
          >
            {mode === 'now' ? <Send className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
            {schedule.isPending
              ? 'Enviando…'
              : mode === 'now'
                ? `Publicar ahora${selected.length > 1 ? ` en ${selected.length} cuentas` : ''}`
                : 'Programar'}
          </Button>
        </>
      )}

      {postList.length ? (
        <div className="space-y-2 border-t border-white/10 pt-4">
          <p className="text-xs uppercase tracking-wide text-mist">Publicaciones</p>
          {postList.map((post) => (
            <div key={post.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-ink-950/70 p-2 text-xs">
              <span className={cn('rounded px-2 py-0.5', STATUS_ES[post.status].tone)}>
                {STATUS_ES[post.status].label}
              </span>
              <span className="text-white">{post.accountName}</span>
              <span className="text-mist">
                {SOCIAL_PROVIDER_LABELS[post.provider]} ·{' '}
                {new Date(post.publishedAt ?? post.scheduledAt).toLocaleString()}
              </span>
              <span className="flex-1" />
              {post.externalUrl ? (
                <a href={post.externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent">
                  Ver <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
              {post.status === 'SCHEDULED' ? (
                <button type="button" className="inline-flex items-center gap-1 text-mist hover:text-red-400" onClick={() => cancel.mutate(post.id)}>
                  <X className="h-3 w-3" /> Cancelar
                </button>
              ) : null}
              {post.status === 'FAILED' ? (
                <button type="button" className="inline-flex items-center gap-1 text-mist hover:text-white" onClick={() => retry.mutate(post.id)}>
                  <RotateCcw className="h-3 w-3" /> Reintentar
                </button>
              ) : null}
              {post.errorMessage && post.status !== 'PUBLISHED' ? (
                <p className="w-full text-[11px] text-red-300">{post.errorMessage}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
