import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, ChevronDown, ChevronUp, Download, Play, Plus, Trash2, Pencil, X } from 'lucide-react';
import {
  AUTOMATION_FORMATS,
  AUTOMATION_FORMAT_IDS,
  AUTOMATION_LIMITS,
  LANGUAGE_LABELS_ES,
  VISUAL_STYLE_LOCK,
  type AutomationBlock,
  type AutomationDto,
  type AutomationFormat,
  type AutomationInput,
  type AutomationRunDto,
  type ClipLanguage,
  type ProjectDto,
  type VoiceDto,
} from '@piwu/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { VoicePicker } from '@/components/voice-picker';
import { cn } from '@/lib/utils';

const errorMessage = (err: unknown) => {
  const message = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(message) ? message.join(' · ') : (message ?? 'Error').toString();
};

const LANGUAGES = Object.entries(LANGUAGE_LABELS_ES) as [ClipLanguage, string][];
const DURATIONS = [15, 30, 45, 60] as const;
const PLATFORMS = [
  { id: 'tiktok', label: 'TikTok' },
  { id: 'reels', label: 'Reels' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'custom', label: 'Otra' },
] as const;
const MOTIONS = [
  { id: 'graphics', label: 'Motion Graphics', hint: '2D animado por código · sin costo de video IA' },
  { id: 'stills', label: 'Fotos', hint: 'Imágenes IA + Ken Burns' },
  { id: 'stills_dynamic', label: 'Fotos v2', hint: 'Imágenes IA + cámara dinámica' },
  { id: 'semi', label: 'Highlight', hint: 'Video IA en gancho y cierre' },
  { id: 'full', label: 'Cinematic', hint: 'Video IA en todas las escenas (caro)' },
] as const;
const VISUAL_STYLES = Object.entries(VISUAL_STYLE_LOCK).map(([id, meta]) => ({ id, label: meta.label }));

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  PLANNING: { text: 'Planificando', className: 'bg-sky-500/15 text-sky-200' },
  RUNNING: { text: 'Creando videos', className: 'bg-amber-500/15 text-amber-200' },
  ZIPPING: { text: 'Armando ZIP', className: 'bg-amber-500/15 text-amber-200' },
  COMPLETED: { text: 'Listo', className: 'bg-emerald-500/15 text-emerald-200' },
  PARTIAL: { text: 'Listo con fallos', className: 'bg-orange-500/15 text-orange-200' },
  FAILED: { text: 'Falló', className: 'bg-red-500/15 text-red-200' },
};
const JOB_STATUS: Record<string, string> = {
  PENDING: 'En cola',
  GENERATING_SCRIPT: 'Preparando',
  AWAITING_APPROVAL: 'Esperando aprobación',
  GENERATING_AUDIO: 'Audio / transcripción',
  GENERATING_ASSETS: 'Generando escenas',
  RENDERING: 'Renderizando',
  COMPLETED: 'Listo',
  FAILED: 'Falló',
};

const newId = () => Math.random().toString(36).slice(2, 10);

function blankBlock(format: AutomationFormat = 'sabias-que', language: ClipLanguage = 'es-LA'): AutomationBlock {
  const youtube = AUTOMATION_FORMATS[format].kind === 'youtube';
  return {
    id: newId(),
    format,
    language,
    count: youtube ? 1 : 3,
    durationSec: youtube ? 60 : 30,
    platform: 'tiktok',
    ...(youtube ? { clipCount: 3 } : {}),
  };
}

/** The example from the brief: 3+3 "¿Sabías que?" and YouTube clips in each language. */
function templateInput(): AutomationInput {
  return {
    name: 'Contenido diario',
    enabled: true,
    runHour: 5,
    runMinute: 0,
    timezone: 'America/Guayaquil',
    topicHint: '',
    useTrends: true,
    projectId: null,
    blocks: [
      { ...blankBlock('sabias-que', 'es-LA'), styleNotes: '2D con motion graphics, colores vivos, textos grandes' },
      { ...blankBlock('sabias-que', 'en-US'), styleNotes: '2D motion graphics, bold colors, big on-screen text' },
      blankBlock('youtube-clips', 'es-LA'),
      blankBlock('youtube-clips', 'en-US'),
    ],
  };
}

function toInput(automation: AutomationDto): AutomationInput {
  const { name, enabled, runHour, runMinute, timezone, topicHint, useTrends, projectId, blocks } = automation;
  return { name, enabled, runHour, runMinute, timezone, topicHint, useTrends, projectId, blocks };
}

const pad = (n: number) => String(n).padStart(2, '0');

function blockSummary(block: AutomationBlock): string {
  const format = AUTOMATION_FORMATS[block.format];
  const lang = block.language.slice(0, 2).toUpperCase();
  return format.kind === 'youtube'
    ? `${block.count} video${block.count > 1 ? 's' : ''} de YouTube → ${block.clipCount ?? 3} clips c/u · ${lang}`
    : `${block.count} × ${format.label} · ${lang}`;
}

export function AutomationsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{ id: string | null; input: AutomationInput } | null>(null);

  const automations = useQuery({
    queryKey: ['automations'],
    queryFn: async () => (await api.get<AutomationDto[]>('/automations')).data,
    refetchInterval: 60_000,
  });
  const list = Array.isArray(automations.data) ? automations.data : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">Automatizaciones</h1>
          <p className="mt-1 max-w-2xl text-sm text-mist">
            Cada día la IA busca temas, escribe los prompts, crea los videos y deja un ZIP listo para descargar.
          </p>
        </div>
        {!editing ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing({ id: null, input: templateInput() })}>
              Usar plantilla
            </Button>
            <Button
              onClick={() =>
                setEditing({
                  id: null,
                  input: { ...templateInput(), name: 'Nueva automatización', blocks: [blankBlock()] },
                })
              }
            >
              <Plus className="h-4 w-4" /> Nueva
            </Button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <AutomationEditor
          key={editing.id ?? 'new'}
          id={editing.id}
          initial={editing.input}
          onDone={() => {
            setEditing(null);
            void queryClient.invalidateQueries({ queryKey: ['automations'] });
          }}
        />
      ) : null}

      {automations.isLoading ? <p className="text-sm text-mist">Cargando…</p> : null}
      {!automations.isLoading && !list.length && !editing ? (
        <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-mist">
          Todavía no hay automatizaciones. Empieza con la plantilla: 3 «¿Sabías que?» en español, 3 en inglés y
          clips de un video de YouTube en cada idioma.
        </div>
      ) : null}

      {list.map((automation) => (
        <AutomationCard
          key={automation.id}
          automation={automation}
          onEdit={() => setEditing({ id: automation.id, input: toInput(automation) })}
        />
      ))}
    </div>
  );
}

function AutomationCard({ automation, onEdit }: { automation: AutomationDto; onEdit: () => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(true);

  const runs = useQuery({
    queryKey: ['automations', automation.id, 'runs'],
    queryFn: async () => (await api.get<AutomationRunDto[]>(`/automations/${automation.id}/runs`)).data,
    enabled: open,
    refetchInterval: (query) => {
      const data = query.state.data;
      return Array.isArray(data) && data.some((run) => ['PLANNING', 'RUNNING', 'ZIPPING'].includes(run.status))
        ? 20_000
        : 120_000;
    },
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['automations'] });
  };
  const runNow = useMutation({
    mutationFn: async () => api.post(`/automations/${automation.id}/run`),
    onSuccess: refresh,
  });
  const toggle = useMutation({
    mutationFn: async () => api.put(`/automations/${automation.id}`, { ...toInput(automation), enabled: !automation.enabled }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async () => api.delete(`/automations/${automation.id}`),
    onSuccess: refresh,
  });

  const next = automation.nextRunAt ? new Date(automation.nextRunAt) : null;

  return (
    <div className="rounded-xl border border-white/10 bg-ink-900/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl font-semibold text-white">{automation.name}</h2>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs',
                automation.enabled ? 'bg-emerald-500/15 text-emerald-200' : 'bg-white/10 text-mist',
              )}
            >
              {automation.enabled ? 'Activa' : 'Pausada'}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-mist">
            <CalendarClock className="h-4 w-4" />
            Todos los días a las {pad(automation.runHour)}:{pad(automation.runMinute)} ({automation.timezone})
            {next ? ` · próxima: ${next.toLocaleString()}` : ''}
          </p>
          <p className="mt-2 text-sm text-white/80">{automation.blocks.map(blockSummary).join(' · ')}</p>
          {automation.topicHint ? (
            <p className="mt-1 text-xs text-mist">
              Temas: {automation.topicHint}
              {automation.useTrends ? ' · con tendencias del día' : ''}
            </p>
          ) : automation.useTrends ? (
            <p className="mt-1 text-xs text-mist">Temas: lo que sea tendencia cada día</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => runNow.mutate()} disabled={runNow.isPending}>
            <Play className="h-4 w-4" /> Ejecutar ahora
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="h-4 w-4" /> Editar
          </Button>
          <Button size="sm" variant="outline" onClick={() => toggle.mutate()} disabled={toggle.isPending}>
            {automation.enabled ? 'Pausar' : 'Activar'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (window.confirm(`¿Eliminar «${automation.name}» y su historial? Los clips ya creados se conservan.`)) {
                remove.mutate();
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {runNow.isError ? <p className="mt-2 text-sm text-red-400">{errorMessage(runNow.error)}</p> : null}

      <button
        className="mt-4 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-mist hover:text-white"
        onClick={() => setOpen((value) => !value)}
      >
        Historial {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open ? (
        <div className="mt-2 space-y-2">
          {(Array.isArray(runs.data) ? runs.data : []).map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
          {Array.isArray(runs.data) && !runs.data.length ? (
            <p className="text-sm text-mist">Aún no se ha ejecutado. Usa «Ejecutar ahora» para probarla.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RunRow({ run }: { run: AutomationRunDto }) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS_LABEL[run.status] ?? { text: run.status, className: 'bg-white/10 text-mist' };
  const done = run.items.filter((item) => item.status === 'COMPLETED').length;
  const download = useMutation({
    mutationFn: async () => {
      const res = await api.get(`/automations/runs/${run.id}/download`, { responseType: 'blob' });
      const blob = res.data as Blob;
      if (blob.type.includes('json')) {
        const data = JSON.parse(await blob.text()) as { url: string };
        window.location.href = data.url;
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = run.zipName ?? 'videos.zip';
      link.click();
      URL.revokeObjectURL(url);
    },
  });

  return (
    <div className="rounded-lg border border-white/5 bg-ink-950/50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button className="flex min-w-0 items-center gap-3 text-left" onClick={() => setExpanded((v) => !v)}>
          <span className="font-semibold text-white">Día {run.seq}</span>
          <span className="text-sm text-mist">
            {run.localDate}
            {run.trigger === 'manual' ? ' · manual' : ''}
          </span>
          <span className={cn('rounded-full px-2 py-0.5 text-xs', status.className)}>{status.text}</span>
          <span className="text-xs text-mist">
            {run.status === 'RUNNING' ? `${done}/${run.items.length} videos listos` : null}
            {run.videoCount ? `${run.videoCount} videos` : null}
          </span>
          {expanded ? <ChevronUp className="h-4 w-4 text-mist" /> : <ChevronDown className="h-4 w-4 text-mist" />}
        </button>
        {run.zipName ? (
          <Button size="sm" variant="secondary" onClick={() => download.mutate()} disabled={download.isPending}>
            <Download className="h-4 w-4" /> {download.isPending ? 'Preparando…' : run.zipName}
          </Button>
        ) : null}
      </div>
      {run.error ? <p className="mt-1 text-sm text-red-300">{run.error}</p> : null}
      {download.isError ? <p className="mt-1 text-sm text-red-400">{errorMessage(download.error)}</p> : null}
      {expanded ? (
        <div className="mt-3 space-y-2 text-sm">
          {run.topics.length ? <p className="text-xs text-mist">Temas del día: {run.topics.join(' · ')}</p> : null}
          {run.items.map((item, index) => (
            <div key={`${item.blockId}-${index}`} className="rounded-md bg-white/[0.03] px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-white">
                  {AUTOMATION_FORMATS[item.format]?.label ?? item.format} · {item.language.slice(0, 2).toUpperCase()}
                </span>
                <span className="text-xs text-mist">{JOB_STATUS[item.status] ?? item.status}</span>
                {item.clipJobId ? (
                  <Link className="text-xs text-accent underline" to={`/dashboard/clips/${item.clipJobId}`}>
                    Ver clip
                  </Link>
                ) : null}
              </div>
              {item.topic ? <p className="mt-0.5 text-xs text-mist">Tema: {item.topic}</p> : null}
              {item.sourceUrl ? (
                <a className="mt-0.5 block truncate text-xs text-mist underline" href={item.sourceUrl} target="_blank" rel="noreferrer">
                  {item.sourceUrl}
                </a>
              ) : null}
              {item.error ? <p className="mt-0.5 text-xs text-red-300">{item.error}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AutomationEditor({
  id,
  initial,
  onDone,
}: {
  id: string | null;
  initial: AutomationInput;
  onDone: () => void;
}) {
  const [input, setInput] = useState<AutomationInput>(initial);
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get<ProjectDto[]>('/projects')).data,
  });
  const save = useMutation({
    mutationFn: async () => (id ? api.put(`/automations/${id}`, input) : api.post('/automations', input)),
    onSuccess: onDone,
  });

  const totals = useMemo(() => {
    let prompts = 0;
    let sources = 0;
    let clips = 0;
    for (const block of input.blocks) {
      if (AUTOMATION_FORMATS[block.format].kind === 'youtube') {
        sources += block.count;
        clips += block.count * (block.clipCount ?? 3);
      } else prompts += block.count;
    }
    return { prompts, sources, videos: prompts + clips };
  }, [input.blocks]);

  const set = <K extends keyof AutomationInput>(key: K, value: AutomationInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }));
  const setBlock = (index: number, patch: Partial<AutomationBlock>) =>
    setInput((current) => ({
      ...current,
      blocks: current.blocks.map((block, i) => (i === index ? { ...block, ...patch } : block)),
    }));

  return (
    <div className="space-y-5 rounded-xl border border-accent/30 bg-ink-900/80 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-white">{id ? 'Editar automatización' : 'Nueva automatización'}</h2>
        <Button variant="ghost" size="icon" onClick={onDone}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5 md:col-span-1">
          <Label htmlFor="auto-name">Nombre</Label>
          <Input id="auto-name" value={input.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="auto-time">Hora diaria</Label>
          <Input
            id="auto-time"
            type="time"
            value={`${pad(input.runHour)}:${pad(input.runMinute)}`}
            onChange={(e) => {
              const [h, m] = e.target.value.split(':').map(Number);
              if (Number.isFinite(h) && Number.isFinite(m)) setInput((c) => ({ ...c, runHour: h, runMinute: m }));
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="auto-tz">Zona horaria</Label>
          <Input id="auto-tz" value={input.timezone} onChange={(e) => set('timezone', e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="auto-topics">¿Qué tipo de temas buscar?</Label>
        <Textarea
          id="auto-topics"
          rows={2}
          placeholder="Ej.: tecnología, ciencia curiosa, finanzas personales, historia. Evitar política."
          value={input.topicHint}
          onChange={(e) => set('topicHint', e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-mist">
          <input type="checkbox" checked={input.useTrends} onChange={(e) => set('useTrends', e.target.checked)} />
          Buscar en la web lo que es tendencia hoy dentro de estos temas
        </label>
      </div>

      <div className="space-y-1.5 md:w-1/2">
        <Label htmlFor="auto-project">Proyecto (opcional)</Label>
        <select
          id="auto-project"
          className="h-11 w-full rounded-md border border-ink-600 bg-ink-900 px-3 text-sm text-white"
          value={input.projectId ?? ''}
          onChange={(e) => set('projectId', e.target.value || null)}
        >
          <option value="">Sin proyecto</option>
          {(Array.isArray(projects.data) ? projects.data : []).map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-mist">Videos de cada día</h3>
          <span className="text-xs text-mist">
            ≈ {totals.videos} videos/día · IA: {totals.prompts}/{AUTOMATION_LIMITS.promptVideos} · YouTube:{' '}
            {totals.sources}/{AUTOMATION_LIMITS.youtubeSources}
          </span>
        </div>
        {input.blocks.map((block, index) => (
          <BlockEditor
            key={block.id}
            block={block}
            onChange={(patch) => setBlock(index, patch)}
            onRemove={
              input.blocks.length > 1
                ? () => setInput((c) => ({ ...c, blocks: c.blocks.filter((_, i) => i !== index) }))
                : undefined
            }
          />
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setInput((c) => ({ ...c, blocks: [...c.blocks, blankBlock()] }))}
          disabled={input.blocks.length >= 12}
        >
          <Plus className="h-4 w-4" /> Agregar bloque
        </Button>
      </div>

      {save.isError ? <p className="text-sm text-red-400">{errorMessage(save.error)}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      className="h-10 w-full rounded-md border border-ink-600 bg-ink-900 px-2 text-sm text-white"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {children}
    </select>
  );
}

const AUTO_VOICE = 'Automática: una voz nativa del idioma';

/** Collapsed voice row; expands into the full picker with previews. */
function BlockVoice({
  language,
  value,
  onChange,
}: {
  language: ClipLanguage;
  value: string | null | undefined;
  onChange: (voiceId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['voices', language],
    queryFn: async () => (await api.get<VoiceDto[]>('/voices', { params: { language } })).data,
    staleTime: 30 * 60 * 1000,
    enabled: Boolean(value),
  });
  const name = value ? (Array.isArray(data) ? data.find((voice) => voice.id === value)?.name : undefined) : undefined;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <Label>Voz</Label>
          <p className="truncate text-xs text-mist">{value ? (name ?? 'Voz elegida') : AUTO_VOICE}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {open ? 'Cerrar' : 'Elegir voz'}
        </Button>
      </div>
      {open ? <VoicePicker language={language} value={value} onChange={onChange} autoLabel={AUTO_VOICE} /> : null}
    </div>
  );
}

function BlockEditor({
  block,
  onChange,
  onRemove,
}: {
  block: AutomationBlock;
  onChange: (patch: Partial<AutomationBlock>) => void;
  onRemove?: () => void;
}) {
  const format = AUTOMATION_FORMATS[block.format];
  const youtube = format.kind === 'youtube';

  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-ink-950/60 p-4">
      <div className="grid gap-3 md:grid-cols-5">
        <div className="space-y-1 md:col-span-2">
          <Label>Formato</Label>
          <Select
            value={block.format}
            onChange={(value) => {
              const next = value as AutomationFormat;
              const nextYoutube = AUTOMATION_FORMATS[next].kind === 'youtube';
              onChange({
                format: next,
                ...(nextYoutube !== youtube
                  ? nextYoutube
                    ? { count: 1, clipCount: 3, durationSec: 60, visualStyle: undefined, motion: undefined, styleNotes: undefined }
                    : { count: 3, clipCount: undefined, durationSec: 30 }
                  : {}),
              });
            }}
          >
            {AUTOMATION_FORMAT_IDS.map((id) => (
              <option key={id} value={id}>
                {AUTOMATION_FORMATS[id].label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Idioma</Label>
          <Select value={block.language} onChange={(value) => onChange({ language: value as ClipLanguage, voiceId: undefined })}>
            {LANGUAGES.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{youtube ? 'Videos fuente' : 'Cantidad'}</Label>
          <Input
            type="number"
            min={1}
            max={10}
            className="h-10"
            value={block.count}
            onChange={(e) => onChange({ count: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })}
          />
        </div>
        <div className="flex items-end justify-end">
          {onRemove ? (
            <Button variant="ghost" size="sm" onClick={onRemove}>
              <Trash2 className="h-4 w-4" /> Quitar
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-mist">{format.hint}</p>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="space-y-1">
          <Label>Duración</Label>
          <Select value={String(block.durationSec)} onChange={(value) => onChange({ durationSec: Number(value) as AutomationBlock['durationSec'] })}>
            {DURATIONS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds} s
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Plataforma</Label>
          <Select value={block.platform} onChange={(value) => onChange({ platform: value as AutomationBlock['platform'] })}>
            {PLATFORMS.map((platform) => (
              <option key={platform.id} value={platform.id}>
                {platform.label}
              </option>
            ))}
          </Select>
        </div>
        {youtube ? (
          <div className="space-y-1">
            <Label>Clips por video</Label>
            <Select value={String(block.clipCount ?? 3)} onChange={(value) => onChange({ clipCount: Number(value) as 3 | 5 | 8 })}>
              {[3, 5, 8].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <Label>Estilo visual</Label>
              <Select value={block.visualStyle ?? ''} onChange={(value) => onChange({ visualStyle: (value || undefined) as AutomationBlock['visualStyle'] })}>
                <option value="">Auto (según descripción)</option>
                {VISUAL_STYLES.map((style) => (
                  <option key={style.id} value={style.id}>
                    {style.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Animación</Label>
              <Select value={block.motion ?? ''} onChange={(value) => onChange({ motion: (value || undefined) as AutomationBlock['motion'] })}>
                <option value="">Auto (según descripción)</option>
                {MOTIONS.map((motion) => (
                  <option key={motion.id} value={motion.id} title={motion.hint}>
                    {motion.label} — {motion.hint}
                  </option>
                ))}
              </Select>
            </div>
          </>
        )}
      </div>

      {!youtube ? (
        <div className="space-y-1">
          <Label>¿Cómo deben verse estos videos?</Label>
          <Textarea
            rows={2}
            placeholder="Ej.: 2D con motion graphics, colores vivos, textos grandes en pantalla, ritmo rápido."
            value={block.styleNotes ?? ''}
            onChange={(e) => onChange({ styleNotes: e.target.value || undefined })}
          />
          <p className="text-xs text-mist">
            Se agrega a cada prompt. Si Estilo o Animación están en «Auto», la IA los elige según esta descripción.
          </p>
        </div>
      ) : null}

      {!youtube ? (
        <BlockVoice
          language={block.language}
          value={block.voiceId}
          onChange={(voiceId) => onChange({ voiceId: voiceId ?? undefined })}
        />
      ) : null}

      <div className="space-y-1">
        <Label>Temas para este bloque (opcional)</Label>
        <Input
          className="h-10"
          placeholder={youtube ? 'Ej.: podcasts de emprendimiento' : 'Vacío = usa los temas generales'}
          value={block.topicHint ?? ''}
          onChange={(e) => onChange({ topicHint: e.target.value || undefined })}
        />
      </div>
    </div>
  );
}
