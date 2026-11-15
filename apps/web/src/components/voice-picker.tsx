import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pause, Play, Search } from 'lucide-react';
import type { VoiceDto } from '@piwu/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const LABEL_ES: Record<string, string> = {
  male: 'hombre',
  female: 'mujer',
  neutral: 'neutral',
  young: 'joven',
  'middle aged': 'adulto',
  'middle-aged': 'adulto',
  old: 'mayor',
  narration: 'narración',
  narrative_story: 'narración',
  conversational: 'conversacional',
  social_media: 'redes sociales',
  news: 'noticias',
  informative_educational: 'educativo',
  characters: 'personajes',
  characters_animation: 'personajes',
};

const tag = (value: string) => LABEL_ES[value.toLowerCase()] ?? value.replace(/_/g, ' ');

/**
 * ElevenLabs voice picker with a short preview per voice.
 * Previews are ElevenLabs' public samples: playing them uses no credits.
 * `value = null` means "default voice" (project or ELEVENLABS_VOICE_ID).
 */
export function VoicePicker({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (voiceId: string | null) => void;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['voices'],
    queryFn: async () => (await api.get<VoiceDto[]>('/voices')).data,
    staleTime: 30 * 60 * 1000,
  });
  const [query, setQuery] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  const voices = useMemo(() => {
    const list = Array.isArray(data) ? data : [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((voice) =>
      [voice.name, voice.description ?? '', ...Object.values(voice.labels).map(tag)]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [data, query]);

  const toggle = (voice: VoiceDto) => {
    if (!voice.previewUrl) return;
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    if (playing === voice.id) {
      audio.pause();
      setPlaying(null);
      return;
    }
    audio.pause();
    audio.src = voice.previewUrl;
    audio.currentTime = 0;
    audio.onended = () => setPlaying(null);
    void audio.play().then(
      () => setPlaying(voice.id),
      () => setPlaying(null),
    );
  };

  const selected = (Array.isArray(data) ? data : []).find((voice) => voice.id === value);
  const defaultVoice = (Array.isArray(data) ? data : []).find((voice) => voice.isDefault);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-mist">
          {selected
            ? `Elegida: ${selected.name}`
            : `Predeterminada${defaultVoice ? `: ${defaultVoice.name}` : ''}`}
        </p>
        {value ? (
          <button
            type="button"
            className="text-[11px] text-accent hover:underline"
            onClick={() => onChange(null)}
          >
            Usar predeterminada
          </button>
        ) : null}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-mist" />
        <input
          className="h-9 w-full rounded-md border border-white/10 bg-ink-950 pl-8 pr-3 text-sm text-white placeholder:text-mist"
          placeholder="Buscar voz (nombre, mujer, narración, acento…)"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
        {isLoading ? <p className="text-xs text-mist">Cargando voces…</p> : null}
        {isError ? (
          <p className="text-xs text-red-400">
            No se pudieron cargar las voces de ElevenLabs. Se usará la voz predeterminada.
          </p>
        ) : null}
        {voices.map((voice) => {
          const active = value ? voice.id === value : voice.isDefault;
          const labels = Object.entries(voice.labels)
            .filter(([key]) => ['gender', 'age', 'accent', 'use_case', 'use case'].includes(key))
            .map(([, v]) => tag(v));
          return (
            <div
              key={voice.id}
              role="button"
              tabIndex={0}
              onClick={() => onChange(voice.isDefault ? null : voice.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onChange(voice.isDefault ? null : voice.id);
              }}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 transition',
                active
                  ? 'border-accent/70 bg-accent/10'
                  : 'border-white/10 bg-ink-900/70 hover:border-white/25',
              )}
            >
              <button
                type="button"
                aria-label={playing === voice.id ? `Pausar ${voice.name}` : `Escuchar ${voice.name}`}
                disabled={!voice.previewUrl}
                onClick={(event) => {
                  event.stopPropagation();
                  toggle(voice);
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"
              >
                {playing === voice.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {voice.name}
                  {voice.isDefault ? (
                    <span className="ml-1.5 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-normal text-mist">
                      predeterminada
                    </span>
                  ) : null}
                </p>
                {labels.length ? (
                  <p className="truncate text-[11px] text-mist">{labels.join(' · ')}</p>
                ) : null}
              </div>
            </div>
          );
        })}
        {!isLoading && !isError && !voices.length ? (
          <p className="text-xs text-mist">Ninguna voz coincide con la búsqueda.</p>
        ) : null}
      </div>
      <p className="text-[10px] text-mist">
        La muestra es la de ElevenLabs (en inglés en muchas voces); escucharla no gasta créditos.
        Todas las voces hablan español con el modelo multilingüe.
      </p>
    </div>
  );
}
