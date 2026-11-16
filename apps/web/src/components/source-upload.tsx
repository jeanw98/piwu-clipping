import { useRef, useState } from 'react';
import axios from 'axios';
import { FileVideo, Loader2, UploadCloud, X } from 'lucide-react';
import type { SourceUploadDto } from '@piwu/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const MAX_MB = 1024;
const MAX_MIN = 30;

const fmtSize = (bytes: number) =>
  bytes > 1024 * 1024 * 1024
    ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;
const fmtDuration = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

/** Reads the duration in the browser so a too-long file fails before uploading. */
function videoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
    setTimeout(() => done(null), 8000);
  });
}

/**
 * Upload a source video to clip (alternative to a YouTube/Instagram link —
 * always works, even when the platform blocks downloads from the server).
 */
export function SourceUpload({
  value,
  onUploaded,
  onClear,
  onBusyChange,
}: {
  value: SourceUploadDto | null;
  onUploaded: (upload: SourceUploadDto) => void;
  onClear: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const setBusy = (busy: boolean) => onBusyChange?.(busy);

  const upload = async (file: File) => {
    setError(null);
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name)) {
      setError('Elige un archivo de video (MP4, MOV, WEBM…).');
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`El archivo pesa ${fmtSize(file.size)}; el máximo es ${MAX_MB / 1024} GB.`);
      return;
    }
    const duration = await videoDuration(file);
    if (duration && duration > MAX_MIN * 60) {
      setError(`El video dura ${fmtDuration(duration)}; el máximo es ${MAX_MIN} min. Recórtalo antes de subirlo.`);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setFileName(file.name);
    setProgress(0);
    setBusy(true);
    const onUploadProgress = (event: { loaded: number; total?: number }) => {
      if (event.total) setProgress(event.loaded / event.total);
    };
    const viaApi = async () =>
      (
        await api.put<SourceUploadDto>('/clips/uploads', file, {
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-Filename': encodeURIComponent(file.name),
          },
          signal: controller.signal,
          timeout: 0,
          onUploadProgress,
        })
      ).data;
    try {
      let data: SourceUploadDto;
      const { data: init } = await api.post<
        | { mode: 'direct'; uploadUrl: string; headers: Record<string, string>; sourceRef: string }
        | { mode: 'api' }
      >('/clips/uploads/init', {
        filename: file.name,
        contentType: file.type || 'video/mp4',
        sizeBytes: file.size,
      });
      if (init.mode === 'direct') {
        // Straight to S3 with the signed URL (no auth header: it would break the signature).
        let direct = true;
        try {
          await axios.put(init.uploadUrl, file, {
            headers: init.headers,
            signal: controller.signal,
            timeout: 0,
            onUploadProgress,
          });
        } catch (err) {
          if (controller.signal.aborted) throw err;
          // Network/CORS problem with the bucket: fall back to the API route.
          if ((err as { response?: unknown }).response) throw err;
          direct = false;
          setProgress(0);
        }
        data = direct
          ? (
              await api.post<SourceUploadDto>('/clips/uploads/complete', {
                sourceRef: init.sourceRef,
                filename: file.name,
              })
            ).data
          : await viaApi();
      } else {
        data = await viaApi();
      }
      onUploaded(data);
    } catch (err) {
      if (controller.signal.aborted) return;
      const status = (err as { response?: { status?: number } })?.response?.status;
      const message = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(
        status === 413
          ? `El archivo es demasiado grande para el servidor (máx. ${MAX_MB / 1024} GB).`
          : (Array.isArray(message) ? message.join(', ') : message) ?? 'No se pudo subir el video. Inténtalo de nuevo.',
      );
    } finally {
      abortRef.current = null;
      setProgress(null);
      setBusy(false);
    }
  };

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void upload(file);
    if (inputRef.current) inputRef.current.value = '';
  };

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2.5">
        <FileVideo className="h-5 w-5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-white">{value.filename}</p>
          <p className="text-[11px] text-mist">
            {fmtDuration(value.durationSec)} · {fmtSize(value.sizeBytes)} · listo para clipear
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded p-1 text-mist hover:bg-white/10 hover:text-white"
          aria-label="Quitar video"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (progress != null) {
    return (
      <div className="space-y-2 rounded-lg border border-white/10 bg-ink-950/60 px-3 py-3">
        <div className="flex items-center gap-2 text-sm text-white">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          <span className="min-w-0 flex-1 truncate">{fileName}</span>
          <span className="text-xs text-mist">{Math.round(progress * 100)}%</span>
          <button
            type="button"
            className="text-xs text-mist hover:text-red-400"
            onClick={() => abortRef.current?.abort()}
          >
            Cancelar
          </button>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        {progress >= 0.999 ? <p className="text-[11px] text-mist">Verificando el video…</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          pick(event.dataTransfer.files);
        }}
        className={cn(
          'flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center transition',
          dragging ? 'border-accent bg-accent/10' : 'border-white/15 hover:border-white/30',
        )}
      >
        <UploadCloud className="h-6 w-6 text-mist" />
        <span className="text-sm text-white">Arrastra un video o haz clic para elegirlo</span>
        <span className="text-[11px] text-mist">
          MP4, MOV o WEBM · hasta {MAX_MIN} min y {MAX_MB / 1024} GB · necesita voz
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/*,.mp4,.mov,.m4v,.webm,.mkv"
        className="hidden"
        onChange={(event) => pick(event.target.files)}
      />
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
