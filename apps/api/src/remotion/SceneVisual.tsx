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
import type { SceneCartoon } from '@piwu/shared';
import { FakeCartoonScene } from './FakeCartoonScene';

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
 * Renders a scene visual. Short AI clips are frozen on the last frame so the
 * rest of the Sequence is not black. Still images get Ken Burns.
 * Fake without a URL → Remotion FakeCartoonScene fallback; with URL → media.
 */
export const SceneVisual: React.FC<{
  type: string;
  url: string;
  prompt: string;
  durationInFrames: number;
  sceneIndex?: number;
  mediaDurationSec?: number;
  imageMotion?: 'kenburns' | 'fake';
  cartoon?: SceneCartoon | null;
}> = ({
  type,
  url,
  prompt,
  durationInFrames,
  sceneIndex = 0,
  mediaDurationSec,
  imageMotion = 'kenburns',
  cartoon,
}) => {
  const { fps } = useVideoConfig();

  if (imageMotion === 'fake' && !hasRenderableUrl(url)) {
    return (
      <FakeCartoonScene
        durationInFrames={durationInFrames}
        sceneIndex={sceneIndex}
        prompt={prompt}
        cartoon={cartoon}
      />
    );
  }

  if (!hasRenderableUrl(url)) {
    return <FallbackVisual />;
  }

  if (isVideoAsset(type, url)) {
    const sequenceSec = durationInFrames / fps;
    // Fake HTML cartoon = full-bleed continuous MP4 — never freeze mid-clip.
    // Hailuo shorts may be shorter than the scene; only then freeze last frame.
    const playFull =
      imageMotion === 'fake' ||
      (typeof mediaDurationSec === 'number' &&
        mediaDurationSec > 0 &&
        mediaDurationSec >= sequenceSec - 0.05);
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

  return (
    <KenBurnsImage
      url={url}
      durationInFrames={durationInFrames}
      sceneIndex={sceneIndex}
    />
  );
};
