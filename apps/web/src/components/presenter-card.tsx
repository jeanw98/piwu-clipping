import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Trash2, Upload } from 'lucide-react';
import type { PresenterDto } from '@piwu/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MAX_EDGE = 1024;

export function usePresenter() {
  return useQuery({
    queryKey: ['presenter'],
    queryFn: async () => (await api.get<PresenterDto>('/presenter')).data,
    staleTime: 60_000,
  });
}

/** Downscale to ≤1024 px and re-encode as PNG (keeps transparency). */
async function fileToPng(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen'))), 'image/png'),
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function usePresenterImage(presenter: PresenterDto | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!presenter?.hasImage) {
      setUrl(null);
      return;
    }
    let objectUrl = '';
    let cancelled = false;
    api
      .get<Blob>('/presenter/image', { responseType: 'blob', params: { v: presenter.updatedAt } })
      .then(({ data }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(data);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setUrl(null));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [presenter?.hasImage, presenter?.updatedAt]);
  return url;
}

/**
 * The user's on-screen presenter for "¿Qué pasaría si…?" videos (one per
 * account). Upload once; every what-if clip / daily block uses it.
 */
export function PresenterCard({
  enabled,
  onEnabledChange,
  className,
}: {
  /** Per-clip toggle; omit to hide it. */
  enabled?: boolean;
  onEnabledChange?: (value: boolean) => void;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const { data: presenter, isLoading } = usePresenter();
  const image = usePresenterImage(presenter);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async (file: File) => {
      if (!['image/png', 'image/webp', 'image/jpeg'].includes(file.type)) {
        throw new Error('Usa una imagen PNG o WebP.');
      }
      if (file.size > 12 * 1024 * 1024) throw new Error('La imagen pesa demasiado (máx. 12 MB).');
      const data = await fileToPng(file);
      return (await api.put<PresenterDto>('/presenter', { mime: 'image/png', data, name: file.name.replace(/\.\w+$/, '').slice(0, 40) })).data;
    },
    onSuccess: (data, file) => {
      queryClient.setQueryData(['presenter'], data);
      setWarning(
        file.type === 'image/jpeg'
          ? 'Subiste un JPG: se verá con su fondo. Para que el robot quede recortado usa un PNG con fondo transparente.'
          : null,
      );
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message || (err as Error).message || 'No se pudo subir la imagen');
    },
  });

  const remove = useMutation({
    mutationFn: async () => (await api.delete<PresenterDto>('/presenter')).data,
    onSuccess: (data) => queryClient.setQueryData(['presenter'], data),
  });

  return (
    <div className={cn('rounded-xl border border-accent/25 bg-accent/5 p-3', className)}>
      <div className="flex items-start gap-3">
        <div className="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[repeating-conic-gradient(#1f2937_0%_25%,#111827_0%_50%)] bg-[length:16px_16px]">
          {image ? (
            <img src={image} alt="Presentador" className="h-full w-full object-contain" />
          ) : (
            <Bot className="h-8 w-8 text-mist" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm font-medium text-white">
            Presentador {presenter?.name ? <span className="text-mist">· {presenter.name}</span> : null}
          </p>
          <p className="text-[11px] text-mist">
            {presenter?.hasImage
              ? 'Aparece en todas las escenas explicando: habla con la voz, reacciona y cambia de lado.'
              : 'Sube tu robot (PNG con fondo transparente, de cuerpo entero). Se usa en todos los videos «¿Qué pasaría si…?».'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={input}
              type="file"
              accept="image/png,image/webp,image/jpeg"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                setError(null);
                save.mutate(file);
              }}
            />
            <Button type="button" size="sm" variant="outline" disabled={save.isPending || isLoading} onClick={() => input.current?.click()}>
              <Upload className="h-3.5 w-3.5" />
              {save.isPending ? 'Subiendo…' : presenter?.hasImage ? 'Cambiar' : 'Subir presentador'}
            </Button>
            {presenter?.hasImage ? (
              <Button type="button" size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate()}>
                <Trash2 className="h-3.5 w-3.5" /> Quitar
              </Button>
            ) : null}
            {presenter?.hasImage && onEnabledChange ? (
              <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-white">
                <input
                  type="checkbox"
                  checked={enabled !== false}
                  onChange={(event) => onEnabledChange(event.target.checked)}
                />
                Mostrar en el video
              </label>
            ) : null}
          </div>
          {warning ? <p className="text-[11px] text-amber-300">{warning}</p> : null}
          {error ? <p className="text-[11px] text-red-400">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
