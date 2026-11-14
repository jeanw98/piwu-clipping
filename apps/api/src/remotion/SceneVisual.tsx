import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Freeze,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

/** Abstract visual only — never dump visualPrompt / instructions on screen. */
function FallbackVisual() {
  return (
    <AbsoluteFill
      style={{
        background:
          'linear-gradient(160deg, #243047 0%, #121826 45%, #2a1f3d 100%)',
      }}
    >
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.08), transparent 55%)',
        }}
      />
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse at 70% 80%, rgba(99,102,241,0.18), transparent 50%)',
        }}
      />
    </AbsoluteFill>
  );
}

function isVideoAsset(type: string, url: string): boolean {
  return (
    type === 'VIDEO' ||
    url.includes('.mp4') ||
    url.startsWith('data:video') ||
    (url.startsWith('blob:') && type === 'VIDEO')
  );
}

function hasRenderableUrl(url: string): boolean {
  return Boolean(url) && !url.startsWith('placeholder://');
}

function ease01(frame: number, duration: number): number {
  const t = Math.max(1, duration);
  return interpolate(frame, [0, t * 0.85], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
}

/** Subtle Ken Burns only — Stills mode. */
function KenBurnsImage({
  url,
  durationInFrames = 90,
}: {
  url: string;
  durationInFrames?: number;
  sceneIndex?: number;
}) {
  const frame = useCurrentFrame();
  const scale = interpolate(
    frame,
    [0, Math.max(1, durationInFrames)],
    [1, 1.08],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#121826', overflow: 'hidden' }}>
      <Img
        src={url}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
      />
    </AbsoluteFill>
  );
}

/**
 * "Almost full" camera on a still (Stills v2 + IMAGE scenes in Highlight):
 * - eased camera move (push-in / pan / pull-out, cycles by sceneIndex);
 * - double framing when the scene is longer than 2.5 s: wide shot, then a
 *   close-up of the same still;
 * - micro-shake on each cut;
 * - a light sweep on top. No blur, no heavy shadows (render cost).
 */
function DynamicStill({
  url,
  durationInFrames = 90,
  sceneIndex = 0,
}: {
  url: string;
  durationInFrames?: number;
  sceneIndex?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const doubleFrame = durationInFrames / fps > 2.5;
  const cutAt = doubleFrame ? Math.round(durationInFrames * 0.55) : durationInFrames;
  const second = doubleFrame && frame >= cutAt;
  const local = second ? frame - cutAt : frame;
  const span = second ? durationInFrames - cutAt : cutAt;
  const progress = ease01(local, span);
  const mode = (sceneIndex + (second ? 2 : 0)) % 4;
  const base = second ? 1.38 : 1;
  const scale =
    base *
    (mode === 0
      ? interpolate(progress, [0, 1], [1.05, 1.18])
      : mode === 3
        ? interpolate(progress, [0, 1], [1.2, 1.08])
        : 1.12);
  const x =
    mode === 1
      ? interpolate(progress, [0, 1], [-6, 6])
      : mode === 2
        ? interpolate(progress, [0, 1], [6, -6])
        : 0;
  const y = mode === 0 ? interpolate(progress, [0, 1], [2, -3]) : 0;
  // Micro-shake: ~0.2 s decaying jitter right after each cut.
  const shakeFrames = Math.round(fps * 0.2);
  const shake =
    local < shakeFrames ? (1 - local / shakeFrames) * 0.6 : 0;
  const sx = shake * Math.sin(local * 2.7 + sceneIndex);
  const sy = shake * Math.cos(local * 3.1 + sceneIndex);
  // Close-up focuses on the upper-middle (faces / subject).
  const origin = second ? '50% 42%' : '50% 55%';
  const sweep = interpolate(frame, [0, Math.max(1, durationInFrames)], [-40, 140], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#121826', overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          transform: `translate(${x + sx}%, ${y + sy}%) scale(${scale})`,
          transformOrigin: origin,
        }}
      >
        <Img
          src={url}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `linear-gradient(115deg, transparent ${sweep - 25}%, rgba(255,255,255,0.10) ${sweep}%, transparent ${sweep + 25}%)`,
          mixBlendMode: 'screen',
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
}

/** Last frame of a short AI clip, held with a slow zoom. */
function FrozenTail({
  url,
  freezeAt,
  frames,
}: {
  url: string;
  freezeAt: number;
  frames: number;
}) {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, Math.max(1, frames)], [1, 1.06], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.quad),
  });
  return (
    <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: '50% 45%' }}>
      <Freeze frame={freezeAt}>
        <OffthreadVideo
          src={url}
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </Freeze>
    </AbsoluteFill>
  );
}

/**
 * Renders a scene visual. Short AI clips are frozen on the last frame so the
 * rest of the Sequence is not black. Still images get Ken Burns or dynamic camera.
 */
export const SceneVisual: React.FC<{
  type: string;
  url: string;
  prompt: string;
  durationInFrames: number;
  sceneIndex?: number;
  mediaDurationSec?: number;
  imageMotion?: 'kenburns' | 'dynamic';
}> = ({
  type,
  url,
  durationInFrames,
  sceneIndex = 0,
  mediaDurationSec,
  imageMotion = 'kenburns',
}) => {
  const { fps } = useVideoConfig();

  if (!hasRenderableUrl(url)) {
    return <FallbackVisual />;
  }

  if (isVideoAsset(type, url)) {
    const sequenceSec = durationInFrames / fps;
    const mediaSec =
      typeof mediaDurationSec === 'number' && mediaDurationSec > 0
        ? mediaDurationSec
        : 6;
    // Hailuo clips are always 6 s. Longer scenes: slow down (≥0.75×), then
    // hold the last frame with a slow push-in instead of paying for 10 s.
    const playbackRate =
      mediaSec >= sequenceSec - 0.05
        ? 1
        : Math.max(0.75, mediaSec / sequenceSec);
    const playFrames = Math.max(
      1,
      Math.min(durationInFrames, Math.floor((mediaSec / playbackRate) * fps) - 1),
    );
    const tailFrames = durationInFrames - playFrames;
    const freezeAt = Math.max(0, Math.floor(mediaSec * fps) - 2);
    return (
      <AbsoluteFill style={{ backgroundColor: '#121826' }}>
        <Sequence durationInFrames={playFrames} layout="none">
          <OffthreadVideo
            src={url}
            muted
            playbackRate={playbackRate}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </Sequence>
        {tailFrames > 0 ? (
          <Sequence from={playFrames} durationInFrames={tailFrames} layout="none">
            <FrozenTail url={url} freezeAt={freezeAt} frames={tailFrames} />
          </Sequence>
        ) : null}
      </AbsoluteFill>
    );
  }

  if (imageMotion === 'dynamic') {
    return (
      <DynamicStill
        url={url}
        durationInFrames={durationInFrames}
        sceneIndex={sceneIndex}
      />
    );
  }

  return (
    <KenBurnsImage
      url={url}
      durationInFrames={durationInFrames}
      sceneIndex={sceneIndex}
    />
  );
};
