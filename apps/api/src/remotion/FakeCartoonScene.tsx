import React from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { SceneCartoon } from '@piwu/shared';
import { normalizeSceneCartoon } from '@piwu/shared';

const SKIN = '#F5C9A8';
const HAIR = '#1C1410';
const SHIRT = '#2563EB';
const PANTS = '#1E293B';
const SHOE = '#0F172A';

function ease01(frame: number, duration: number, delay = 0): number {
  const t = Math.max(1, duration);
  return interpolate(frame, [delay, delay + t * 0.85], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
}

function CameraStage({
  sceneIndex,
  durationInFrames,
  children,
}: {
  sceneIndex: number;
  durationInFrames: number;
  children: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const progress = ease01(frame, durationInFrames);
  const mode = sceneIndex % 4;
  // Different shot per scene: push-in, pan L→R, pan R→L, slight pull-out
  const scale =
    mode === 0
      ? interpolate(progress, [0, 1], [1.05, 1.18])
      : mode === 3
        ? interpolate(progress, [0, 1], [1.2, 1.08])
        : 1.12;
  const x =
    mode === 1
      ? interpolate(progress, [0, 1], [-6, 6])
      : mode === 2
        ? interpolate(progress, [0, 1], [6, -6])
        : 0;
  const y = mode === 0 ? interpolate(progress, [0, 1], [2, -2]) : 0;

  return (
    <AbsoluteFill
      style={{
        transform: `translate(${x}%, ${y}%) scale(${scale})`,
        transformOrigin: '50% 60%',
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

function CartoonCharacter({
  action,
  props,
  sinkAmount,
  sceneIndex,
  durationInFrames,
}: {
  action: SceneCartoon['action'];
  props: string[];
  sinkAmount: number;
  sceneIndex: number;
  durationInFrames: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const progress = ease01(frame, durationInFrames);

  // Story beats (mostly one-shot), not endless identical loops
  let xPct = 50;
  let bob = Math.sin(t * 2.2) * 2;
  let legSwing = 0;
  let leftArm = -16;
  let rightArm = 14;
  let mouth = 3;
  let rotate = 0;

  if (action === 'walk') {
    const from = sceneIndex % 2 === 0 ? 18 : 82;
    const to = sceneIndex % 2 === 0 ? 72 : 28;
    xPct = interpolate(progress, [0, 1], [from, to]);
    bob = Math.sin(progress * Math.PI * 6) * 8;
    legSwing = Math.sin(progress * Math.PI * 6) * 22;
    leftArm = -10 + Math.sin(progress * Math.PI * 6) * 24;
    rightArm = 10 - Math.sin(progress * Math.PI * 6) * 24;
  } else if (action === 'wave') {
    xPct = 48 + (sceneIndex % 3) * 4;
    const wavePhase = interpolate(progress, [0, 0.25, 0.75, 1], [0, 1, 1, 0.2]);
    leftArm = -25 - wavePhase * 50 + Math.sin(t * 14) * wavePhase * 28;
    mouth = 5;
    bob = Math.sin(t * 3) * 3;
  } else if (action === 'point') {
    xPct = 42 + (sceneIndex % 2) * 10;
    leftArm = interpolate(progress, [0, 0.35, 1], [-10, -75, -70]);
    rightArm = 18;
    rotate = interpolate(progress, [0, 1], [0, -4]);
    mouth = 4;
  } else if (action === 'sink') {
    xPct = 50;
    bob = interpolate(progress, [0, 1], [0, 6]);
    leftArm = interpolate(progress, [0, 0.5, 1], [-20, -60, -30]);
    rightArm = interpolate(progress, [0, 0.5, 1], [20, 55, 25]);
    mouth = interpolate(progress, [0, 1], [3, 12]);
    rotate = interpolate(progress, [0, 1], [0, 8]);
  } else if (action === 'talk') {
    xPct = 46 + (sceneIndex % 3) * 5;
    // Gesture once mid-scene, then settle — not perpetual shake
    const gesture = interpolate(
      progress,
      [0, 0.2, 0.45, 0.7, 1],
      [0, 0, 1, 0.3, 0],
    );
    leftArm = -14 - gesture * 28;
    rightArm = 12 + gesture * 10;
    mouth = 3 + Math.abs(Math.sin(t * 11)) * 7 * (0.4 + gesture);
    bob = Math.sin(t * 2.5) * 2 + gesture * 4;
  } else {
    // idle — subtle breath only
    xPct = 50 + ((sceneIndex % 5) - 2) * 3;
    bob = Math.sin(t * 1.8) * 3;
    leftArm = -12 + Math.sin(t * 1.5) * 3;
  }

  const bottom = 14 - sinkAmount * 32;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${xPct}%`,
        bottom: `${bottom}%`,
        width: 200,
        height: 340,
        marginLeft: -100,
        transform: `translateY(${bob}px) rotate(${rotate}deg)`,
        transformOrigin: '50% 100%',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 62,
          bottom: 0,
          width: 30,
          height: 22,
          borderRadius: 8,
          background: SHOE,
          transform: `translateX(${legSwing * 0.3}px)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 62,
          bottom: 0,
          width: 30,
          height: 22,
          borderRadius: 8,
          background: SHOE,
          transform: `translateX(${-legSwing * 0.3}px)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 68,
          bottom: 14,
          width: 26,
          height: 88,
          borderRadius: 13,
          background: PANTS,
          transform: `rotate(${legSwing}deg)`,
          transformOrigin: 'top center',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 68,
          bottom: 14,
          width: 26,
          height: 88,
          borderRadius: 13,
          background: PANTS,
          transform: `rotate(${-legSwing}deg)`,
          transformOrigin: 'top center',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 52,
          bottom: 88,
          width: 96,
          height: 118,
          borderRadius: 26,
          background: SHIRT,
          boxShadow: 'inset 0 -12px 0 rgba(0,0,0,0.08)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 22,
          bottom: 150,
          width: 22,
          height: 86,
          borderRadius: 11,
          background: SKIN,
          transform: `rotate(${leftArm}deg)`,
          transformOrigin: 'top center',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 22,
          bottom: 150,
          width: 22,
          height: 86,
          borderRadius: 11,
          background: SKIN,
          transform: `rotate(${rightArm}deg)`,
          transformOrigin: 'top center',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 56,
          bottom: 188,
          width: 88,
          height: 88,
          borderRadius: '50%',
          background: SKIN,
          border: '3px solid rgba(0,0,0,0.06)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -6,
            left: 6,
            width: 76,
            height: 38,
            borderRadius: '40px 40px 6px 6px',
            background: HAIR,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 36,
            left: 22,
            width: 11,
            height: 11,
            borderRadius: '50%',
            background: '#111',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 36,
            right: 22,
            width: 11,
            height: 11,
            borderRadius: '50%',
            background: '#111',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 56,
            left: '50%',
            width: 26,
            height: mouth,
            marginLeft: -13,
            borderRadius: 8,
            background: '#9F1239',
          }}
        />
      </div>
      {props.includes('phone') ? (
        <div
          style={{
            position: 'absolute',
            left: 4,
            bottom: 210,
            width: 26,
            height: 44,
            borderRadius: 6,
            background: '#0F172A',
            border: '2px solid #38BDF8',
            transform: `rotate(${leftArm}deg)`,
            transformOrigin: 'top right',
          }}
        />
      ) : null}
      {props.includes('sign') ? (
        <div
          style={{
            position: 'absolute',
            right: -8,
            bottom: 220,
            width: 72,
            height: 46,
            borderRadius: 8,
            background: '#FEF3C7',
            border: '3px solid #92400E',
            color: '#78350F',
            fontSize: 16,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 16px rgba(0,0,0,0.2)',
          }}
        >
          !
        </div>
      ) : null}
      {props.includes('bag') ? (
        <div
          style={{
            position: 'absolute',
            right: 18,
            bottom: 78,
            width: 44,
            height: 54,
            borderRadius: 10,
            background: '#92400E',
            boxShadow: 'inset 0 8px 0 rgba(255,255,255,0.08)',
          }}
        />
      ) : null}
    </div>
  );
}

function BeachOceanBg({
  setting,
  durationInFrames,
  sceneIndex,
}: {
  setting: 'beach' | 'ocean';
  durationInFrames: number;
  sceneIndex: number;
}) {
  const frame = useCurrentFrame();
  const progress = ease01(frame, durationInFrames);
  // Tide drifts across the shot once (story), plus small ripple
  const tide = interpolate(progress, [0, 1], [sceneIndex % 2 === 0 ? -4 : 4, sceneIndex % 2 === 0 ? 10 : -6]);
  const ripple = Math.sin(frame / 14) * 3;

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            setting === 'ocean'
              ? 'linear-gradient(180deg, #7DD3FC 0%, #38BDF8 35%, #0284C7 70%, #0369A1 100%)'
              : 'linear-gradient(180deg, #7DD3FC 0%, #38BDF8 34%, #FDE68A 34%, #FBBF24 52%, #D97706 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 70 + (sceneIndex % 3) * 20,
          right: 60,
          width: 100,
          height: 100,
          borderRadius: '50%',
          background: '#FDE68A',
          boxShadow: '0 0 80px rgba(253,224,71,0.65)',
          opacity: 0.95,
        }}
      />
      {/* cloud accents — different per scene */}
      <div
        style={{
          position: 'absolute',
          top: 120,
          left: 40 + (sceneIndex % 4) * 40,
          width: 120,
          height: 40,
          borderRadius: 40,
          background: 'rgba(255,255,255,0.75)',
          transform: `translateX(${progress * 30}px)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: -50,
          right: -50,
          bottom: setting === 'ocean' ? '20%' : `${30 + tide}%`,
          height: '46%',
          background:
            'linear-gradient(180deg, #0EA5E9 0%, #0369A1 55%, #0C4A6E 100%)',
          borderRadius: '45% 45% 0 0',
          transform: `translateY(${ripple}px)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: -30,
          right: -30,
          bottom: setting === 'ocean' ? '34%' : `${38 + tide}%`,
          height: 26,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.5)',
          transform: `translateX(${Math.sin(frame / 16) * 24}px)`,
        }}
      />
      {setting === 'beach' ? (
        <>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: '34%',
              background: 'linear-gradient(180deg, #FCD34D 0%, #B45309 100%)',
            }}
          />
          {/* foam line crawling onto sand */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: `${30 + tide * 0.6}%`,
              height: 18,
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.65), transparent)',
            }}
          />
        </>
      ) : null}
    </AbsoluteFill>
  );
}

function DesertBg({
  sinking,
  durationInFrames,
  sceneIndex,
}: {
  sinking: boolean;
  durationInFrames: number;
  sceneIndex: number;
}) {
  const frame = useCurrentFrame();
  const progress = ease01(frame, durationInFrames);
  const heat = Math.sin(frame / 18) * 4;
  const duneShift = interpolate(progress, [0, 1], [0, sceneIndex % 2 === 0 ? 20 : -16]);

  return (
    <AbsoluteFill
      style={{
        background:
          'linear-gradient(180deg, #FDBA74 0%, #FB923C 38%, #C2410C 100%)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 80,
          left: 70,
          width: 90,
          height: 90,
          borderRadius: '50%',
          background: '#FDE68A',
          boxShadow: '0 0 70px rgba(253,224,71,0.55)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: -40 + duneShift,
          right: -40,
          bottom: '24%',
          height: '42%',
          background: '#EA580C',
          borderRadius: '50%',
          transform: `translateY(${heat}px)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: sinking ? `${34 + progress * 10}%` : '28%',
          background: 'linear-gradient(180deg, #9A3412 0%, #7C2D12 100%)',
        }}
      />
      {sinking ? (
        <div
          style={{
            position: 'absolute',
            left: `${28 - progress * 4}%`,
            right: `${28 - progress * 4}%`,
            bottom: `${26 + progress * 4}%`,
            height: 28,
            borderRadius: '50%',
            background: 'rgba(69,26,3,0.5)',
            transform: `scaleX(${0.9 + progress * 0.25})`,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
}

function CityStudioBg({
  setting,
  durationInFrames,
  sceneIndex,
}: {
  setting: 'city' | 'studio' | 'generic';
  durationInFrames: number;
  sceneIndex: number;
}) {
  const frame = useCurrentFrame();
  const progress = ease01(frame, durationInFrames);
  const drift = interpolate(progress, [0, 1], [0, 16 * (sceneIndex % 2 === 0 ? 1 : -1)]);

  if (setting === 'city') {
    return (
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, #312E81 0%, #1E1B4B 50%, #020617 100%)',
        }}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 20 + i * 110 + drift,
              bottom: 140,
              width: 64 + (i % 3) * 18,
              height: 160 + ((i + sceneIndex) % 4) * 50,
              background: i % 2 === 0 ? '#334155' : '#475569',
              borderRadius: 4,
              boxShadow: 'inset -8px 0 0 rgba(0,0,0,0.15)',
            }}
          />
        ))}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 140,
            background: '#020617',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 130,
            height: 10,
            background: 'rgba(250,204,21,0.35)',
          }}
        />
      </AbsoluteFill>
    );
  }

  const isStudio = setting === 'studio';
  return (
    <AbsoluteFill
      style={{
        background: isStudio
          ? 'linear-gradient(160deg, #334155 0%, #0F172A 55%, #1E3A8A 100%)'
          : 'linear-gradient(160deg, #4C1D95 0%, #1E1B4B 45%, #0F172A 100%)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: `${10 + progress * 4}%`,
          right: `${10 + (1 - progress) * 4}%`,
          top: '16%',
          bottom: '22%',
          borderRadius: 32,
          border: '4px solid rgba(255,255,255,0.12)',
          background: 'rgba(255,255,255,0.04)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: '18%',
          right: '18%',
          bottom: '18%',
          height: 16,
          borderRadius: 8,
          background: 'rgba(0,0,0,0.25)',
        }}
      />
    </AbsoluteFill>
  );
}

function fallbackBgKind(
  setting: SceneCartoon['setting'],
): 'beach' | 'ocean' | 'desert' | 'quick_sand' | 'city' | 'studio' | 'generic' {
  if (setting === 'beach' || setting === 'ocean') return setting;
  if (setting === 'desert' || setting === 'quick_sand') return setting;
  if (setting === 'city') return 'city';
  if (
    setting === 'studio' ||
    setting === 'office' ||
    setting === 'classroom' ||
    setting === 'kitchen'
  ) {
    return 'studio';
  }
  return 'generic';
}

function fallbackAction(
  action: SceneCartoon['action'],
): 'idle' | 'walk' | 'talk' | 'point' | 'sink' | 'wave' {
  if (
    action === 'idle' ||
    action === 'walk' ||
    action === 'talk' ||
    action === 'point' ||
    action === 'sink' ||
    action === 'wave'
  ) {
    return action;
  }
  return 'talk';
}

export const FakeCartoonScene: React.FC<{
  durationInFrames: number;
  sceneIndex?: number;
  prompt?: string;
  cartoon?: SceneCartoon | null;
}> = ({ durationInFrames, sceneIndex = 0, prompt = '', cartoon }) => {
  const frame = useCurrentFrame();
  const spec = normalizeSceneCartoon(cartoon, prompt);
  const bg = fallbackBgKind(spec.setting);
  const sinkProgress =
    spec.action === 'sink' || spec.setting === 'quick_sand'
      ? ease01(frame, durationInFrames)
      : 0;

  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: '#38BDF8' }}>
      <CameraStage sceneIndex={sceneIndex} durationInFrames={durationInFrames}>
        {bg === 'beach' || bg === 'ocean' ? (
          <BeachOceanBg
            setting={bg}
            durationInFrames={durationInFrames}
            sceneIndex={sceneIndex}
          />
        ) : bg === 'desert' || bg === 'quick_sand' ? (
          <DesertBg
            sinking={bg === 'quick_sand' || spec.action === 'sink'}
            durationInFrames={durationInFrames}
            sceneIndex={sceneIndex}
          />
        ) : (
          <CityStudioBg
            setting={bg}
            durationInFrames={durationInFrames}
            sceneIndex={sceneIndex}
          />
        )}

        <CartoonCharacter
          action={fallbackAction(spec.action)}
          props={spec.props ?? []}
          sinkAmount={sinkProgress}
          sceneIndex={sceneIndex}
          durationInFrames={durationInFrames}
        />
      </CameraStage>
    </AbsoluteFill>
  );
};
