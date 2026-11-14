import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  continueRender,
  delayRender,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { z } from 'zod';
import type {
  MotionGraphicsCompositionProps,
  MotionGraphicsSpec,
  MotionGraphicsTiming,
} from '@piwu/shared';
import {
  drawBackground,
  drawIntro,
  drawOverlay,
  drawSceneLayer,
} from './frame';
import { FONT, H, W } from './lib';

export const motionGraphicsClipSchema = z.object({
  spec: z.any(),
  timing: z.object({
    intro: z.tuple([z.number(), z.number()]),
    scenes: z.array(z.tuple([z.number(), z.number()])),
    cues: z.array(z.tuple([z.number(), z.number()])),
    end: z.number(),
  }),
  audioUrl: z.string(),
  musicFile: z.string().nullable().optional(),
  sfx: z.boolean().optional(),
  fps: z.number().optional(),
});

type DrawFn = (X: CanvasRenderingContext2D, t: number) => void;

/** Draws into a 1080×1920 canvas on every frame — deterministic. */
export const CanvasLayer: React.FC<{ draw: DrawFn; ready: boolean; offsetSec?: number }> = ({
  draw,
  ready,
  offsetSec = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    if (!ready || !ref.current) return;
    const X = ref.current.getContext('2d');
    if (!X) return;
    X.setTransform(1, 0, 0, 1, 0, 0);
    X.clearRect(0, 0, W, H);
    draw(X, offsetSec + frame / fps);
  }, [frame, fps, draw, ready, offsetSec]);
  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  );
};

/** Register Poppins Bold (apps/api/assets/fonts) before the first frame. */
function usePoppins(): boolean {
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender('Loading Poppins for Motion Graphics'));
  useEffect(() => {
    let cancelled = false;
    const face = new FontFace(FONT, `url(${staticFile('fonts/Poppins-Bold.ttf')})`);
    face
      .load()
      .then((loaded) => {
        document.fonts.add(loaded);
      })
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return;
        setReady(true);
        continueRender(handle);
      });
    return () => {
      cancelled = true;
    };
  }, [handle]);
  return ready;
}

const SceneSequence: React.FC<{
  spec: MotionGraphicsSpec;
  timing: MotionGraphicsTiming;
  index: number;
  ready: boolean;
  sfx: boolean;
}> = ({ spec, timing, index, ready, sfx }) => {
  const { fps } = useVideoConfig();
  const [s0, s1] = timing.scenes[index];
  const from = Math.round(s0 * fps);
  const duration = Math.max(1, Math.round(s1 * fps) - from);
  const effect = spec.scenes[index].sfx ?? 'whoosh';
  const draw = React.useCallback<DrawFn>(
    (X, t) => drawSceneLayer(X, spec, timing, index, t),
    [spec, timing, index],
  );
  return (
    <Sequence from={from} durationInFrames={duration} name={`Scene ${index + 1}`}>
      <CanvasLayer draw={draw} ready={ready} offsetSec={from / fps} />
      {sfx && effect !== 'none' ? (
        <Audio src={staticFile(`sfx/${effect}.mp3`)} volume={0.35} />
      ) : null}
    </Sequence>
  );
};

export const MotionGraphicsClip: React.FC<MotionGraphicsCompositionProps> = ({
  spec,
  timing,
  audioUrl,
  musicFile,
  sfx = true,
}) => {
  const { fps } = useVideoConfig();
  const ready = usePoppins();
  const bg = React.useCallback<DrawFn>(
    (X, t) => drawBackground(X, spec, timing, t),
    [spec, timing],
  );
  const intro = React.useCallback<DrawFn>(
    (X, t) => drawIntro(X, spec, timing, t),
    [spec, timing],
  );
  const overlay = React.useCallback<DrawFn>(
    (X, t) => drawOverlay(X, spec, timing, t),
    [spec, timing],
  );
  const introFrames = Math.max(1, Math.round(timing.intro[1] * fps));

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* 1. live background, always mounted */}
      <CanvasLayer draw={bg} ready={ready} />
      {/* 2. intro 2–3 s */}
      <Sequence from={0} durationInFrames={introFrames} name="Intro">
        <CanvasLayer draw={intro} ready={ready} />
        {sfx ? <Audio src={staticFile('sfx/whoosh.mp3')} volume={0.3} /> : null}
      </Sequence>
      {/* 3. one Sequence per scene with real timing */}
      {timing.scenes.map((_, index) => (
        <SceneSequence
          key={index}
          spec={spec}
          timing={timing}
          index={index}
          ready={ready}
          sfx={sfx}
        />
      ))}
      {/* 4. captions + vignette */}
      <CanvasLayer draw={overlay} ready={ready} />
      {audioUrl ? <Audio src={audioUrl} /> : null}
      {musicFile ? <Audio src={staticFile(musicFile)} volume={0.15} loop /> : null}
    </AbsoluteFill>
  );
};
