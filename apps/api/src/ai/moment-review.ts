/**
 * How a source video is framed, decided from sampled frames.
 * - facecam: a webcam box over gameplay/screen → split layout (cam on top, gameplay below);
 * - camera: a person fills the shot (vlog, IRL, podcast) → follow the face;
 * - screen: gameplay/screen with no visible person → show the action whole.
 */
export type SourceLayout =
  | { type: 'facecam'; cam: { x: number; y: number; w: number; h: number } }
  | { type: 'camera' }
  | { type: 'screen' };

export interface MomentReview {
  layout: SourceLayout;
  /** Point to keep in a vertical crop, per frame id (0–1). */
  points: Map<string, { x: number; y: number }>;
  /** Per candidate index. */
  verdicts: Map<number, { keep: boolean; score: number; note: string }>;
}

type Box = { x: number; y: number; w: number; h: number };

const unit = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function readBox(raw: unknown): Box | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const x = unit(r.x);
  const y = unit(r.y);
  const w = unit(r.w);
  const h = unit(r.h);
  if (x == null || y == null || w == null || h == null) return null;
  const box = { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) };
  return box.w > 0.04 && box.h > 0.04 ? box : null;
}

/**
 * The webcam box is fixed for a whole stream: take the median of the frames
 * that report one, and only trust it when most frames agree and it looks like
 * a webcam (not the whole frame, not a speck).
 */
export function consensusCam(boxes: Array<Box | null>, totalFrames: number): Box | null {
  const found = boxes.filter((box): box is Box => Boolean(box));
  if (found.length < Math.max(2, Math.ceil(totalFrames * 0.5))) return null;
  const cam = {
    x: median(found.map((box) => box.x)),
    y: median(found.map((box) => box.y)),
    w: median(found.map((box) => box.w)),
    h: median(found.map((box) => box.h)),
  };
  const area = cam.w * cam.h;
  if (area < 0.01 || area > 0.4) return null;
  // Most boxes must sit near the median: a moving or flickering box is not a webcam overlay.
  const agree = found.filter(
    (box) => Math.abs(box.x + box.w / 2 - (cam.x + cam.w / 2)) < 0.08 && Math.abs(box.y + box.h / 2 - (cam.y + cam.h / 2)) < 0.08,
  );
  return agree.length >= Math.ceil(found.length * 0.7) ? cam : null;
}

export function parseMomentReview(json: unknown, totalFrames: number): MomentReview | null {
  if (!json || typeof json !== 'object') return null;
  const raw = json as { layout?: unknown; frames?: unknown; candidates?: unknown };
  const frames = Array.isArray(raw.frames) ? (raw.frames as Array<Record<string, unknown>>) : [];
  const points = new Map<string, { x: number; y: number }>();
  const camBoxes: Array<Box | null> = [];
  for (const frame of frames) {
    if (!frame || frame.id == null) continue;
    const x = unit(frame.x);
    const y = unit(frame.y);
    if (x != null && y != null) points.set(String(frame.id), { x, y });
    camBoxes.push(readBox(frame.cam));
  }

  let layout: SourceLayout = { type: 'camera' };
  if (raw.layout === 'facecam') {
    const cam = consensusCam(camBoxes, totalFrames);
    // Unreliable box: a gameplay crop still beats a split with half a face.
    layout = cam ? { type: 'facecam', cam } : { type: 'screen' };
  } else if (raw.layout === 'screen') {
    layout = { type: 'screen' };
  }

  const verdicts = new Map<number, { keep: boolean; score: number; note: string }>();
  for (const item of Array.isArray(raw.candidates) ? (raw.candidates as Array<Record<string, unknown>>) : []) {
    const index = Number(item?.index);
    if (!Number.isInteger(index)) continue;
    verdicts.set(index, {
      keep: item.keep !== false,
      score: Math.round(Math.min(100, Math.max(0, Number(item.score) || 50))),
      note: String(item.note ?? '').slice(0, 200),
    });
  }
  return { layout, points, verdicts };
}

/**
 * Keep the candidates the review accepted, best combined score first. If the
 * review rejected everything, still return the single best one.
 */
export function selectReviewed<T extends { score: number }>(
  candidates: T[],
  review: MomentReview | null,
  count: number,
): Array<{ candidate: T; index: number }> {
  const scored = candidates.map((candidate, index) => {
    const verdict = review?.verdicts.get(index);
    return {
      candidate,
      index,
      keep: verdict ? verdict.keep : true,
      combined: verdict ? (candidate.score + verdict.score) / 2 : candidate.score,
    };
  });
  const kept = scored.filter((item) => item.keep).sort((a, b) => b.combined - a.combined);
  const chosen = kept.length ? kept : [...scored].sort((a, b) => b.combined - a.combined).slice(0, 1);
  return chosen.slice(0, count).map(({ candidate, index }) => ({ candidate, index }));
}
