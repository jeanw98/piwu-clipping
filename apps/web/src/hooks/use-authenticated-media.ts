import { useEffect, useState } from 'react';
import type { ClipJobDto, RemotionCompositionProps } from '@piwu/shared';
import {
  MediaAssetType,
  resolveVideoFormat,
  usesCaptionSafeZone,
} from '@piwu/shared';
import { api, mediaUrl } from '@/lib/api';
import { authStorage } from '@/lib/auth-storage';

async function toPlayableUrl(path: string | null | undefined): Promise<string> {
  if (!path) return '';
  try {
    const { data } = await api.get<{ url: string; direct: boolean }>(
      '/storage/resolve',
      { params: { path } },
    );
    if (data.direct && data.url.startsWith('http')) {
      return data.url;
    }
  } catch {
    // Fall through to authenticated proxy fetch (local storage).
  }

  const absolute = mediaUrl(path);
  const token = authStorage.getAccessToken();
  const res = await fetch(absolute, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error(`Failed to load media ${res.status}`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function useAuthenticatedMedia(clip: ClipJobDto | undefined): {
  inputProps: RemotionCompositionProps | null;
  durationInFrames: number;
  width: number;
  height: number;
  fps: number;
  loading: boolean;
  error: string | null;
} {
  const [inputProps, setInputProps] = useState<RemotionCompositionProps | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const format = resolveVideoFormat(
    clip?.orientation ?? 'portrait',
    clip?.resolution ?? '1080p',
  );

  const assetSum =
    clip?.assets?.reduce((sum, a) => sum + a.durationSec, 0) ?? 0;
  const target = clip?.durationSec ?? 30;
  const audioEnd = clip?.timestampsJson?.at(-1)?.end ?? 0;
  const durationSec = Math.min(
    Math.max(assetSum, Math.min(audioEnd, target + 1), 4),
    target + 1,
  );
  const durationInFrames = Math.ceil(durationSec * format.fps);

  useEffect(() => {
    if (!clip) return;
    if (!clip.audioUrl && !clip.assets?.length) {
      setInputProps(null);
      return;
    }

    let cancelled = false;
    const objectUrls: string[] = [];

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const audioUrl = clip.audioUrl
          ? await toPlayableUrl(clip.audioUrl)
          : '';
        if (audioUrl && audioUrl.startsWith('blob:')) objectUrls.push(audioUrl);

        const assets = await Promise.all(
          (clip.assets ?? []).map(async (asset) => {
            if (!asset.url || asset.url.startsWith('placeholder://')) {
              return {
                sceneIndex: asset.sceneIndex,
                type: asset.type,
                url: '',
                durationSec: asset.durationSec,
                prompt: asset.prompt,
              };
            }

            try {
              const url = await toPlayableUrl(asset.url);
              if (!url) {
                return {
                  sceneIndex: asset.sceneIndex,
                  type: asset.type,
                  url: '',
                  durationSec: asset.durationSec,
                  prompt: asset.prompt,
                };
              }
              if (url.startsWith('blob:')) objectUrls.push(url);
              return {
                sceneIndex: asset.sceneIndex,
                type: asset.type,
                url,
                durationSec: asset.durationSec,
                prompt: asset.prompt,
              };
            } catch {
              return {
                sceneIndex: asset.sceneIndex,
                type: asset.type,
                url: '',
                durationSec: asset.durationSec,
                prompt: asset.prompt,
              };
            }
          }),
        );

        if (cancelled) return;

        setInputProps({
          title: clip.title || 'Clip preview',
          audioUrl,
          assets,
          whisperTimestamps: clip.timestampsJson ?? [],
          scenes: (clip.assets ?? []).map((asset) => ({
            index: asset.sceneIndex,
            narration: '',
            visualPrompt: asset.prompt,
            type:
              asset.type === MediaAssetType.VIDEO
                ? MediaAssetType.VIDEO
                : MediaAssetType.IMAGE,
            durationSec: asset.durationSec,
          })),
          width: format.width,
          height: format.height,
          fps: format.fps,
          targetDurationSec: durationSec,
          captionStyle: clip.captionStyle ?? undefined,
          captionSafeZone: usesCaptionSafeZone(clip.platform),
          imageMotion: clip.motion === 'semi' ? 'semi' : 'kenburns',
        });
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setInputProps(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
      for (const url of objectUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [
    clip?.id,
    clip?.audioUrl,
    clip?.title,
    clip?.updatedAt,
    clip?.assets,
    clip?.timestampsJson,
    clip?.captionStyle,
    clip?.motion,
    clip?.platform,
    durationSec,
    format.width,
    format.height,
    format.fps,
  ]);

  return {
    inputProps,
    durationInFrames,
    width: format.width,
    height: format.height,
    fps: format.fps,
    loading,
    error,
  };
}
