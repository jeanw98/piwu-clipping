/**
 * Loaded element images (library SVGs / generated PNGs), keyed by `src`.
 * MotionGraphicsClip preloads them (delayRender) before the first frame, so
 * drawing stays synchronous and deterministic.
 */
const images = new Map<string, CanvasImageSource>();

export function setImage(src: string, image: CanvasImageSource) {
  images.set(src, image);
}

export function getImage(src: string | undefined): CanvasImageSource | undefined {
  return src ? images.get(src) : undefined;
}
