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
 * Stills v2 — cinematic camera on a full-bleed still:
 * push-in, pan L→R, pan R→L, slight pull-out (cycles by sceneIndex).
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
  const progress = ease01(frame, durationInFrames);
  const mode = sceneIndex % 4;
  const scale =
    mode === 0
      ? interpolate(progress, [0, 1], [1.05, 1.22])
      : mode === 3
        ? interpolate(progress, [0, 1], [1.24, 1.1])
        : 1.14;
  const x =
    mode === 1
      ? interpolate(progress, [0, 1], [-7, 7])
      : mode === 2
        ? interpolate(progress, [0, 1], [7, -7])
        : 0;
  const y = mode === 0 ? interpolate(progress, [0, 1], [2, -3]) : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#121826', overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          transform: `translate(${x}%, ${y}%) scale(${scale})`,
          transformOrigin: '50% 55%',
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
    const playFull =
      typeof mediaDurationSec === 'number' &&
      mediaDurationSec > 0 &&
      mediaDurationSec >= sequenceSec - 0.05;
    const playSec = playFull
      ? sequenceSec
      : typeof mediaDurationSec === 'number' && mediaDurationSec > 0
        ? Math.min(sequenceSec, mediaDurationSec)
        : sequenceSec <= 8.25
          ? sequenceSec
          : 5;
    const playFrames = Math.max(
      1,
      Math.min(durationInFrames, Math.round(playSec * fps)),
    );
    const freezeAt = playFrames - 1;
    return (
      <AbsoluteFill style={{ backgroundColor: '#121826' }}>
        <Sequence durationInFrames={playFrames} layout="none">
          <OffthreadVideo
            src={url}
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </Sequence>
        {!playFull && durationInFrames > playFrames ? (
          <Sequence
            from={playFrames}
            durationInFrames={durationInFrames - playFrames}
            layout="none"
          >
            <Freeze frame={freezeAt}>
              <OffthreadVideo
                src={url}
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </Freeze>
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
