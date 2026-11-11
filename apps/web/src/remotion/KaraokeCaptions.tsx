import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionStyle, WordTimestamp } from '@piwu/shared';

const SIZE_RATIO = { sm: 0.034, md: 0.046, lg: 0.056, xl: 0.068 };

function captionTokens(words: WordTimestamp[], timeSec: number) {
  let index = words.findIndex(
    (word) => timeSec >= word.start - 0.04 && timeSec <= word.end + 0.08,
  );
  if (index < 0) {
    const upcoming = words.findIndex((word) => word.start > timeSec);
    if (upcoming > 0 && timeSec - words[upcoming - 1].end < 0.18) {
      index = upcoming - 1;
    } else {
      return [];
    }
  }
  const group = Math.floor(index / 4) * 4;
  return words.slice(group, group + 4).map((word, offset) => ({
    text: word.word,
    active: group + offset === index,
  }));
}

export const KaraokeCaptions: React.FC<{
  words: WordTimestamp[];
  style: CaptionStyle;
  safeZone?: boolean;
}> = ({ words, style, safeZone = false }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const timeSec = frame / fps;
  const tokens = useMemo(
    () => (style.enabled ? captionTokens(words, timeSec) : []),
    [style.enabled, words, timeSec],
  );
  if (!style.enabled || !tokens.length) return null;

  const fontSize = Math.round(height * SIZE_RATIO[style.size]);
  const justify =
    style.position === 'top'
      ? 'flex-start'
      : style.position === 'middle'
        ? 'center'
        : 'flex-end';

  return (
    <AbsoluteFill
      style={{
        justifyContent: justify,
        alignItems: 'center',
        paddingTop: style.position === 'top' ? height * 0.16 : 0,
        paddingBottom:
          style.position === 'bottom' ? height * (safeZone ? 0.22 : 0.1) : 0,
        paddingLeft: height * 0.04,
        paddingRight: height * 0.04,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: fontSize * 0.22,
          maxWidth: '92%',
          textAlign: 'center',
          textTransform: 'uppercase',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontWeight: 800,
          lineHeight: 1.15,
          background:
            style.look === 'pill' ? 'rgba(0,0,0,0.75)' : 'transparent',
          borderRadius: height * 0.012,
          padding:
            style.look === 'pill'
              ? `${height * 0.01}px ${height * 0.018}px`
              : 0,
        }}
      >
        {tokens.map((token, index) => (
          <span
            key={`${token.text}-${index}`}
            style={{
              color: token.active ? style.highlight : style.color,
              fontSize: token.active ? fontSize * 1.08 : fontSize,
              textShadow:
                style.look === 'stroke'
                  ? '0 4px 16px rgba(0,0,0,0.95), 0 2px 0 rgba(0,0,0,0.85)'
                  : 'none',
            }}
          >
            {token.text}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};
