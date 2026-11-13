import { useEffect, useState } from 'react';
import { api, mediaUrl } from '@/lib/api';
import { authStorage } from '@/lib/auth-storage';
import { cn } from '@/lib/utils';

export function AuthImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    const controller = new AbortController();

    const run = async () => {
      try {
        const { data } = await api.get<{ url: string; direct: boolean }>(
          '/storage/resolve',
          { params: { path: src }, signal: controller.signal },
        );
        if (cancelled) return;
        if (data.direct && data.url.startsWith('http')) {
          setUrl(data.url);
          return;
        }
        const token = authStorage.getAccessToken();
        const res = await fetch(mediaUrl(src), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        if (!cancelled) setUrl(null);
      }
    };

    void run();
    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (!url) {
    return <div className={cn('bg-ink-800', className)} aria-label={alt} />;
  }
  return <img src={url} alt={alt} className={className} />;
}
