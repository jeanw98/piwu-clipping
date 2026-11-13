import { useEffect, useState } from 'react';
import { JobStatus, type ClipJobDto } from '@piwu/shared';
import { api, mediaUrl } from '@/lib/api';
import { authStorage } from '@/lib/auth-storage';
import { cn } from '@/lib/utils';

function pickCoverPath(clip: ClipJobDto): string | null {
  if (clip.coverUrl) return clip.coverUrl;
  const still = [...(clip.assets ?? [])]
    .sort((a, b) => a.sceneIndex - b.sceneIndex)
    .find(
      (asset) =>
        asset.type === 'IMAGE' ||
        /\.(png|jpe?g|webp)(\?|$)/i.test(asset.url ?? ''),
    );
  if (still?.url) return still.url;
  if (clip.status === JobStatus.COMPLETED && clip.outputVideoUrl) {
    return clip.outputVideoUrl;
  }
  return null;
}

export function ClipCover({
  clip,
  className,
}: {
  clip: ClipJobDto;
  className?: string;
}) {
  const path = pickCoverPath(clip);
  const [src, setSrc] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);

  useEffect(() => {
    if (!path) {
      setSrc(null);
      return;
    }
    const controller = new AbortController();
    let objectUrl = '';
    let cancelled = false;

    const run = async () => {
      try {
        const { data } = await api.get<{ url: string; direct: boolean }>(
          '/storage/resolve',
          { params: { path }, signal: controller.signal },
        );
        if (cancelled) return;
        const videoLike =
          /\.mp4(\?|$)/i.test(path) ||
          /\.mp4(\?|$)/i.test(data.url) ||
          path.includes('/renders/');
        setIsVideo(videoLike);

        if (data.direct && data.url.startsWith('http')) {
          setSrc(data.url);
          return;
        }

        const token = authStorage.getAccessToken();
        const res = await fetch(mediaUrl(path), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`cover ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setSrc(null);
      }
    };

    void run();
    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (src) {
    return isVideo ? (
      <video
        className={cn('h-full w-full object-cover', className)}
        src={src}
        muted
        playsInline
        preload="metadata"
      />
    ) : (
      <img
        src={src}
        alt=""
        className={cn('h-full w-full object-cover', className)}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col justify-end bg-[linear-gradient(160deg,#1a2030,#0b0d10)] p-3',
        className,
      )}
    >
      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-ink-700">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${clip.progress}%` }}
        />
      </div>
      <p className="text-[11px] text-mist">{clip.progress}%</p>
    </div>
  );
}
