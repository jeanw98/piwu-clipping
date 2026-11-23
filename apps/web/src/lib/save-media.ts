import { api, mediaUrl } from '@/lib/api';
import { authStorage } from '@/lib/auth-storage';

export type SaveMediaResult =
  | { method: 'share' }
  | { method: 'download' }
  | { method: 'open' }
  | { method: 'cancelled' };

type DownloadMeta = {
  url: string;
  direct: boolean;
  filename: string;
};

function prefersShareSheet(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (!('share' in navigator)) return false;
  const coarse =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(pointer: coarse)').matches;
  const touch =
    typeof navigator !== 'undefined' &&
    (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
  return Boolean(coarse || touch);
}

async function fetchAsFile(
  meta: DownloadMeta,
  fallbackName: string,
): Promise<File> {
  const filename = meta.filename || fallbackName;
  let blob: Blob;

  if (meta.direct) {
    const res = await fetch(meta.url);
    if (!res.ok) {
      throw new Error(`Download failed (${res.status})`);
    }
    blob = await res.blob();
  } else {
    // Authenticated local/API storage — go through axios so refresh works.
    const path = meta.url.replace(/^\//, '');
    const axiosRes = await api.get<Blob>(path, { responseType: 'blob' });
    blob = axiosRes.data;
  }

  const type =
    blob.type && blob.type !== 'application/json'
      ? blob.type
      : 'video/mp4';
  return new File([blob], filename, { type });
}

function triggerAnchorDownload(file: File): void {
  const objectUrl = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = file.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

function openUrl(url: string): void {
  const absolute = url.startsWith('http') ? url : mediaUrl(url);
  const token = authStorage.getAccessToken();
  // For non-direct URLs the browser won't send Bearer; open signed/direct only.
  const a = document.createElement('a');
  a.href = absolute;
  a.rel = 'noopener';
  a.target = '_blank';
  if (token && !url.startsWith('http')) {
    // Last resort for local: still try; user may already be on same session cookies.
  }
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Save a clip MP4 to the device.
 * Prefers Web Share (iOS/Android → Save Video / Files), then blob download,
 * then opening the signed URL as a last resort.
 */
export async function saveClipVideo(
  clipId: string,
  variantId: string | undefined,
  filename: string,
): Promise<SaveMediaResult> {
  const res = await api.get<DownloadMeta>(`/clips/${clipId}/download`, {
    params: variantId ? { variantId } : undefined,
  });
  const meta = res.data;
  const name = meta.filename || filename;

  try {
    const file = await fetchAsFile(meta, name);

    if (
      prefersShareSheet() &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({
          files: [file],
          title: file.name,
        });
        return { method: 'share' };
      } catch (error) {
        const err = error as DOMException;
        if (err?.name === 'AbortError') {
          return { method: 'cancelled' };
        }
        // Fall through to download if share fails for other reasons
      }
    }

    triggerAnchorDownload(file);
    return { method: 'download' };
  } catch {
    openUrl(meta.url);
    return { method: 'open' };
  }
}

/** Whether the primary CTA should read "Save video" (touch / share-capable). */
export function shouldLabelAsSaveVideo(): boolean {
  return prefersShareSheet();
}
