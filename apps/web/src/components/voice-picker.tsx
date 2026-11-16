import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe2, Pause, Play, Search } from 'lucide-react';
import { LANGUAGE_LABELS_ES, type ClipLanguage, type VoiceDto } from '@piwu/shared';
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
  american: 'americano',
  british: 'británico',
  'latin american': 'latino',
  mexican: 'mexicano',
  argentine: 'argentino',
  colombian: 'colombiano',
  chilean: 'chileno',
  venezuelan: 'venezolano',
  peruvian: 'peruano',
  peninsular: 'España',
  castilian: 'España',
  brazilian: 'brasileño',
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
  language,
}: {
  value: string | null | undefined;
  onChange: (voiceId: string | null) => void;
  language: ClipLanguage;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['voices', language],
    queryFn: async () => (await api.get<VoiceDto[]>('/voices', { params: { language } })).data,
    staleTime: 30 * 60 * 1000,
  });
  const [query, setQuery] = useState('');
  const [showOthers, setShowOthers] = useState(false);
  const addVoice = useMutation({
    mutationFn: async (voice: VoiceDto) =>
      (
        await api.post<{ voiceId: string }>('/voices/library', {
          publicOwnerId: voice.publicOwnerId,
          voiceId: voice.id,
          name: voice.name,
        })
      ).data.voiceId,
    onSuccess: (voiceId) => {
      onChange(voiceId);
      void queryClient.invalidateQueries({ queryKey: ['voices'] });
    },
  });
  const choose = (voice: VoiceDto) => {
    if (voice.source === 'library') {
      if (!addVoice.isPending) addVoice.mutate(voice);
      return;
    }
    onChange(voice.isDefault ? null : voice.id);
  };
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  const all = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const voices = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = all.filter((voice) => voice.matchesLanguage || showOthers || voice.id === value);
    if (!q) return list;
    return list.filter((voice) =>
      [voice.name, voice.description ?? '', voice.accent ?? '', ...Object.values(voice.labels).map(tag)]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [all, query, showOthers, value]);
  const nativeCount = all.filter((voice) => voice.matchesLanguage).length;
  const othersCount = all.length - nativeCount;

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

  const selected = all.find((voice) => voice.id === value);
  const defaultVoice = all.find((voice) => voice.isDefault);
  const current = selected ?? (value ? null : defaultVoice);
  const languageLabel = LANGUAGE_LABELS_ES[language];

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
      {current && !current.matchesLanguage && nativeCount ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200">
          {current.name} no es una voz nativa de {languageLabel}: sonará con acento. Elige una de abajo.
        </p>
      ) : null}
      {addVoice.isError ? (
        <p className="text-[11px] text-red-400">
          {(addVoice.error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            'No se pudo agregar la voz a tu cuenta de ElevenLabs.'}
        </p>
      ) : null}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-mist" />
        <input
          className="h-9 w-full rounded-md border border-white/10 bg-ink-950 pl-8 pr-3 text-sm text-white placeholder:text-mist"
          placeholder={`Buscar entre voces de ${languageLabel} (nombre, mujer, mexicano…)`}
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
              onClick={() => choose(voice)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') choose(voice);
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
                  {voice.source === 'library' ? (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-normal text-sky-300">
                      <Globe2 className="h-2.5 w-2.5" />
                      {addVoice.isPending && addVoice.variables?.id === voice.id ? 'agregando…' : 'librería'}
                    </span>
                  ) : null}
                  {!voice.matchesLanguage ? (
                    <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-normal text-amber-300">
                      acento extranjero
                    </span>
                  ) : null}
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
          <p className="text-xs text-mist">
            {query ? 'Ninguna voz coincide con la búsqueda.' : `No encontramos voces nativas de ${languageLabel}.`}
          </p>
        ) : null}
      </div>
      {othersCount ? (
        <button
          type="button"
          className="text-[11px] text-accent hover:underline"
          onClick={() => setShowOthers((v) => !v)}
        >
          {showOthers
            ? `Ocultar voces de otros acentos (${othersCount})`
            : `Ver también voces de otros acentos (${othersCount})`}
        </button>
      ) : null}
      <p className="text-[10px] text-mist">
        Se muestran voces nativas de {languageLabel}: primero las de tu cuenta y luego las de la librería
        pública de ElevenLabs (al elegir una se agrega a tu cuenta, sin costo). Escuchar las muestras no
        gasta créditos.
      </p>
    </div>
  );
}
