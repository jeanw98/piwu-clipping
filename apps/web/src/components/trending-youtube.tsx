import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Flame, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface TrendingVideo {
  id: string;
  url: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
  viewCount: number | null;
}

const WINDOWS = [
  ['day', '24 h'],
  ['week', 'Semana'],
  ['month', 'Mes'],
] as const;

const QUICK = ['GTA VI gameplay', 'GTA 6 momentos graciosos', 'GTA 6 funny moments', 'GTA 6 reaccion streamer'];

const views = (n: number | null) =>
  n == null ? '' : n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} K` : String(n);
const minutes = (sec: number | null) => (sec == null ? '' : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);

/** "Sugerir lo más trending": most viewed recent videos for a topic; clicking one fills the link. */
export function TrendingYoutube({ selectedUrl, onPick }: { selectedUrl?: string; onPick: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('GTA VI gameplay');
  const [recency, setRecency] = useState<(typeof WINDOWS)[number][0]>('week');
  const search = useMutation({
    mutationFn: async (q: string) =>
      (await api.get<TrendingVideo[]>('/clips/youtube/trending', { params: { q, recency } })).data,
  });

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Flame className="h-4 w-4 text-orange-400" /> Sugerir lo más trending
      </Button>
    );
  }

  const run = (q = query) => {
    setQuery(q);
    if (q.trim().length >= 2) search.mutate(q.trim());
  };

  return (
    <div className="space-y-2 rounded-md border border-orange-500/20 bg-orange-500/5 p-3">
      <div className="flex gap-2">
        <Input
          className="h-9"
          value={query}
          placeholder="Tema (ej.: GTA VI gameplay, Rubius GTA 6)"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              run();
            }
          }}
        />
        <Button type="button" size="sm" onClick={() => run()} disabled={search.isPending}>
          <Search className="h-4 w-4" /> {search.isPending ? 'Buscando…' : 'Buscar'}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {WINDOWS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setRecency(id)}
            className={cn(
              'rounded-full border px-2 py-0.5',
              recency === id ? 'border-orange-400 text-orange-200' : 'border-white/10 text-mist',
            )}
          >
            {label}
          </button>
        ))}
        <span className="text-mist">·</span>
        {QUICK.map((q) => (
          <button key={q} type="button" onClick={() => run(q)} className="rounded-full border border-white/10 px-2 py-0.5 text-mist hover:text-white">
            {q}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-mist">
        Lo más visto del periodo (2–30 min). Mejores resultados: streamers jugando o reaccionando — la IA elige los momentos por lo que se dice.
      </p>
      {search.isError ? <p className="text-xs text-red-400">No se pudo buscar. Intenta de nuevo.</p> : null}
      {search.data && !search.data.length ? <p className="text-xs text-mist">Sin resultados en ese periodo; prueba «Mes».</p> : null}
      {search.data?.length ? (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {search.data.map((video) => (
            <li key={video.id}>
              <button
                type="button"
                onClick={() => onPick(video.url)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md border px-2 py-1.5 text-left hover:bg-white/5',
                  selectedUrl === video.url ? 'border-orange-400' : 'border-transparent',
                )}
              >
                <img
                  src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`}
                  alt=""
                  loading="lazy"
                  className="h-10 w-16 shrink-0 rounded object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-white">{video.title}</span>
                  <span className="block truncate text-[11px] text-mist">
                    {[video.channel, views(video.viewCount) && `${views(video.viewCount)} vistas`, minutes(video.durationSec)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
