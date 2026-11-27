/**
 * Whether the model accepts `output_config.effort`: Claude Opus 4.5, the 4.6+
 * models and every 5.x model. Older ones (Sonnet 4.5, Haiku 4.5, ...) reject it.
 */
export function supportsEffort(model: string): boolean {
  const match = /claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?(?!\d)/.exec(model);
  if (!match) return false;
  const [, family, majorText, minorText] = match;
  const major = Number(majorText);
  const minor = minorText ? Number(minorText) : 0;
  if (major >= 5) return true;
  if (major === 4 && minor >= 6) return true;
  return family === 'opus' && major === 4 && minor === 5;
}
