import React from 'react';
import { Composition } from 'remotion';
import { ViralClip, viralClipSchema } from './ViralClip';
import type { RemotionCompositionProps } from '@piwu/shared';

const DEFAULT_PROPS: RemotionCompositionProps = {
  title: 'Clip',
  audioUrl: '',
  assets: [],
  whisperTimestamps: [],
  scenes: [],
  width: 1080,
  height: 1920,
  fps: 30,
  targetDurationSec: 30,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ViralClip"
        // Remotion's LooseComponentType expects Record<string, unknown>
        component={ViralClip as unknown as React.FC<Record<string, unknown>>}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={DEFAULT_PROPS as unknown as Record<string, unknown>}
        calculateMetadata={async ({ props }) => {
          const parsed = viralClipSchema.parse(props);
          const fps = parsed.fps ?? 30;
          const assetDuration = parsed.assets.reduce(
            (sum, asset) => sum + asset.durationSec,
            0,
          );
          const sceneDuration = parsed.scenes.reduce(
            (sum, s) => sum + s.durationSec,
            0,
          );
          const lastWord = parsed.whisperTimestamps.at(-1);
          const speechEnd =
            typeof lastWord?.end === 'number' ? lastWord.end + 0.35 : 0;
          // Prefer full speech — never shorten below Whisper end
          const seconds = Math.max(
            assetDuration,
            sceneDuration,
            speechEnd,
            parsed.targetDurationSec ?? 0,
            5,
          );
          return {
            durationInFrames: Math.max(1, Math.ceil(seconds * fps)),
            fps,
            width: parsed.width ?? 1080,
            height: parsed.height ?? 1920,
            props: parsed as unknown as Record<string, unknown>,
          };
        }}
      />
    </>
  );
};
