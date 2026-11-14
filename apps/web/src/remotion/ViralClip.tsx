import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { RemotionCompositionProps, WordTimestamp } from '@piwu/shared';
import { KaraokeCaptions } from './KaraokeCaptions';
import { SceneVisual } from './SceneVisual';

function activeCaption(words: WordTimestamp[], timeSec: number): string {
  const window = words.filter(
    (w) => w.start <= timeSec && w.end >= timeSec - 0.05,
  );
  if (window.length) {
    return window.map((w) => w.word).join(' ');
  }
  const nearby = words.filter(
    (w) => Math.abs(w.start - timeSec) < 0.4 || Math.abs(w.end - timeSec) < 0.4,
  );
  return nearby
    .slice(0, 4)
    .map((w) => w.word)
    .join(' ');
}

export const ViralClip: React.FC<RemotionCompositionProps> = ({
  title,
  audioUrl,
  assets,
  whisperTimestamps,
  scenes,
  targetDurationSec,
  captionStyle,
  captionSafeZone,
  imageMotion = 'kenburns',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames: compositionFrames } = useVideoConfig();
  const timeSec = frame / fps;

  const caption = useMemo(
    () => activeCaption(whisperTimestamps, timeSec),
    [whisperTimestamps, timeSec],
  );

  const baseAssets: Array<{
    sceneIndex: number;
    type: string;
    url: string;
    durationSec: number;
    prompt: string;
    mediaDurationSec?: number;
  }> = assets.length
    ? assets
    : (scenes ?? []).map((s, i) => ({
        sceneIndex: i,
        type: s.type,
        url: '',
        durationSec: s.durationSec,
        prompt: s.visualPrompt,
      }));

  let cursorFrame = 0;
  const sequences = baseAssets.map((asset, index) => {
    let durationInFrames = Math.max(1, Math.round(asset.durationSec * fps));
    const from = cursorFrame;
    if (index === baseAssets.length - 1) {
      const remaining = compositionFrames - from;
      if (remaining > durationInFrames) {
        durationInFrames = remaining;
      }
    }
    cursorFrame += durationInFrames;
    return { asset, from, durationInFrames };
  });

  const audioEndFrame = targetDurationSec
    ? Math.round(targetDurationSec * fps)
    : undefined;

  const titleOpacity = interpolate(frame, [0, 15, 45], [0, 1, 0], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#121826' }}>
      {sequences.map(({ asset, from, durationInFrames }) => (
        <Sequence
          key={`${asset.sceneIndex}-${from}`}
          from={from}
          durationInFrames={durationInFrames}
        >
          <AbsoluteFill>
            <SceneVisual
              type={asset.type}
              url={asset.url}
              prompt={asset.prompt}
              durationInFrames={durationInFrames}
              sceneIndex={asset.sceneIndex}
              mediaDurationSec={asset.mediaDurationSec}
              imageMotion={imageMotion}
            />
            <AbsoluteFill
              style={{
                background:
                  'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, transparent 30%, transparent 60%, rgba(0,0,0,0.55) 100%)',
              }}
            />
          </AbsoluteFill>
        </Sequence>
      ))}

      <AbsoluteFill
        style={{
          justifyContent: 'flex-start',
          alignItems: 'center',
          paddingTop: 48,
          opacity: titleOpacity,
        }}
      >
        <div
          style={{
            color: '#f8fafc',
            fontSize: 36,
            fontWeight: 800,
            textAlign: 'center',
            padding: '0 24px',
          }}
        >
          {title}
        </div>
      </AbsoluteFill>

      {captionStyle ? (
        <KaraokeCaptions
          words={whisperTimestamps}
          style={captionStyle}
          safeZone={captionSafeZone}
        />
      ) : (
        <AbsoluteFill
          style={{
            justifyContent: 'flex-end',
            alignItems: 'center',
            paddingBottom: 96,
            paddingLeft: 24,
            paddingRight: 24,
          }}
        >
          <div
            style={{
              color: '#fff',
              fontSize: 28,
              fontWeight: 800,
              lineHeight: 1.2,
              textAlign: 'center',
              textTransform: 'uppercase',
              textShadow: '0 4px 18px rgba(0,0,0,0.9)',
              minHeight: 72,
            }}
          >
            {caption}
          </div>
        </AbsoluteFill>
      )}

      {audioUrl ? (
        <Audio
          src={audioUrl}
          durationInFrames={audioEndFrame}
        />
      ) : null}
    </AbsoluteFill>
  );
};
