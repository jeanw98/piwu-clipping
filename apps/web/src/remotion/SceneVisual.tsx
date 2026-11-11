import React from 'react';
import {
  AbsoluteFill,
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

/** Subtle Ken Burns only — real motion comes from VIDEO/mp4 scenes. */
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
 * Fake “layered animation” from one still: blurred background drifts one way,
 * sharper foreground the other. Feels animated without Hailuo.
 */
function SemiLayeredImage({
  url,
  durationInFrames = 90,
  sceneIndex = 0,
}: {
  url: string;
  durationInFrames?: number;
  sceneIndex?: number;
}) {
  const frame = useCurrentFrame();
  const t = Math.max(1, durationInFrames);
  const direction = sceneIndex % 2 === 0 ? 1 : -1;

  const bgScale = interpolate(frame, [0, t], [1.18, 1.32], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const bgX = interpolate(frame, [0, t], [-4 * direction, 4 * direction], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fgScale = interpolate(frame, [0, t], [1.04, 1.14], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fgX = interpolate(frame, [0, t], [3 * direction, -3 * direction], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fgY = interpolate(frame, [0, t], [1.5, -1.5], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#121826', overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          transform: `translateX(${bgX}%) scale(${bgScale})`,
          transformOrigin: 'center center',
          filter: 'blur(10px) saturate(1.1)',
          opacity: 0.72,
        }}
      >
        <Img
          src={url}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          transform: `translate(${fgX}%, ${fgY}%) scale(${fgScale})`,
          transformOrigin:
            sceneIndex % 3 === 0
              ? '30% 40%'
              : sceneIndex % 3 === 1
                ? '70% 35%'
                : '50% 55%',
        }}
      >
        <Img
          src={url}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/**
 * Renders a scene visual. Short AI clips are frozen on the last frame so the
 * rest of the Sequence is not black. Still images get Ken Burns or semi layers.
 */
export const SceneVisual: React.FC<{
  type: string;
  url: string;
  prompt: string;
  durationInFrames: number;
  sceneIndex?: number;
  mediaDurationSec?: number;
  imageMotion?: 'kenburns' | 'semi';
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
    const playSec =
      typeof mediaDurationSec === 'number' && mediaDurationSec > 0
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
        {durationInFrames > playFrames ? (
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

  if (imageMotion === 'semi') {
    return (
      <SemiLayeredImage
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
