import { MediaAssetType } from './enums';
import { mgNarration, type MotionGraphicsSpec } from './motion-graphics';
import type { GeneratedScript } from './types';
import { planScriptTimeline } from './video-format';

/**
 * Wrap a Motion Graphics spec as a GeneratedScript so the existing review
 * screen, scriptJson storage and title/audioScript columns keep working.
 * Scene 0 is the intro (cue 0); then one SceneScript per spec scene.
 */
export function mgScriptFromSpec(
  spec: MotionGraphicsSpec,
  targetSeconds: number,
): GeneratedScript {
  const ranges: Array<{ label: string; from: number; to: number }> = [
    { label: 'Intro', from: 0, to: spec.scenes[0]?.firstCue ?? spec.cues.length },
    ...spec.scenes.map((scene, i) => ({
      label: `${scene.component} · ${scene.headline.map(([t]) => t).join(' ')}`,
      from: scene.firstCue,
      to: spec.scenes[i + 1]?.firstCue ?? spec.cues.length,
    })),
  ];
  const scenes = planScriptTimeline(
    ranges.map((range, index) => ({
      index,
      narration: spec.cues
        .slice(range.from, range.to)
        .map(([text]) => text)
        .join(' '),
      visualPrompt: range.label,
      type: MediaAssetType.IMAGE,
      durationSec: 1,
    })),
    targetSeconds,
  );
  return {
    title: spec.title,
    audioScript: mgNarration(spec),
    styleAnchor: '',
    scenes,
    motionGraphics: spec,
  };
}
