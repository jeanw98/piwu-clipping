import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { z } from 'zod';
import type { RemotionCompositionProps, WordTimestamp } from '@piwu/shared';
import { KaraokeCaptions } from './KaraokeCaptions';
import { SceneVisual } from './SceneVisual';

export const viralClipSchema = z.object({
  title: z.string(),
  audioUrl: z.string(),
  assets: z.array(
    z.object({
      sceneIndex: z.number(),
      type: z.string(),
      url: z.string(),
      durationSec: z.number(),
      prompt: z.string(),
      mediaDurationSec: z.number().optional(),
      cartoon: z
        .object({
          setting: z.enum([
            'kitchen',
            'office',
            'gym',
            'city',
            'studio',
            'classroom',
            'space',
            'outdoor',
            'bunker',
            'beach',
            'ocean',
            'desert',
            'quick_sand',
            'generic',
          ]),
          action: z.enum([
            'idle',
            'walk',
            'talk',
            'point',
            'react',
            'work',
            'celebrate',
            'panic',
            'sink',
            'wave',
          ]),
          props: z.array(z.string()).optional(),
        })
        .optional(),
    }),
  ),
  whisperTimestamps: z.array(
    z.object({
      word: z.string(),
      start: z.number(),
      end: z.number(),
    }),
  ),
  scenes: z.array(
    z.object({
      index: z.number(),
      narration: z.string(),
      visualPrompt: z.string(),
      type: z.string(),
      durationSec: z.number(),
    }),
  ),
  width: z.number().optional(),
  height: z.number().optional(),
  fps: z.number().optional(),
  targetDurationSec: z.number().optional(),
  captionStyle: z
    .object({
      enabled: z.boolean(),
      size: z.enum(['sm', 'md', 'lg', 'xl']),
      color: z.string(),
      highlight: z.string(),
      position: z.enum(['top', 'middle', 'bottom']),
      look: z.enum(['stroke', 'pill']),
    })
    .optional(),
  captionSafeZone: z.boolean().optional(),
  imageMotion: z.enum(['kenburns', 'fake']).optional(),
});

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

  const baseAssets: RemotionCompositionProps['assets'] = assets.length
    ? assets
    : scenes.map((s, i) => ({
        sceneIndex: i,
        type: s.type,
        url: '',
        durationSec: s.durationSec,
        prompt: s.visualPrompt,
        cartoon: s.cartoon,
      }));

  let cursorFrame = 0;
  const sequences = baseAssets.map((asset, index) => {
    let durationInFrames = Math.max(1, Math.round(asset.durationSec * fps));
    const from = cursorFrame;
    // Stretch the last scene to fill any leftover composition frames (no black tail)
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
    <AbsoluteFill
      style={{
        backgroundColor: '#121826',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
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
              cartoon={asset.cartoon}
            />
            {imageMotion === 'fake' ? null : (
              <AbsoluteFill
                style={{
                  background:
                    'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, transparent 30%, transparent 60%, rgba(0,0,0,0.55) 100%)',
                }}
              />
            )}
          </AbsoluteFill>
        </Sequence>
      ))}

      {imageMotion === 'fake' ? null : (
        <AbsoluteFill
          style={{
            justifyContent: 'flex-start',
            alignItems: 'center',
            paddingTop: 80,
            opacity: titleOpacity,
          }}
        >
          <div
            style={{
              color: '#f8fafc',
              fontSize: 54,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              textShadow: '0 8px 30px rgba(0,0,0,0.8)',
              textAlign: 'center',
              padding: '0 48px',
            }}
          >
            {title}
          </div>
        </AbsoluteFill>
      )}

      {/* Fake canvas MP4 already burns in captions — skip Remotion karaoke */}
      {imageMotion === 'fake' ? null : captionStyle ? (
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
            paddingBottom: 160,
            paddingLeft: 48,
            paddingRight: 48,
          }}
        >
          <div
            style={{
              color: '#fff',
              fontSize: 52,
              fontWeight: 800,
              lineHeight: 1.2,
              textAlign: 'center',
              textTransform: 'uppercase',
              textShadow: '0 4px 18px rgba(0,0,0,0.9)',
              minHeight: 120,
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
