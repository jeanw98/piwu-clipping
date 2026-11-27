/**
 * Cheap check for topics that repeat an earlier one with other words
 * ("Beber agua de mar" vs "¿Qué pasa si bebes agua de mar?"). The planner is
 * told not to repeat; this catches what slips through.
 */
const STOPWORDS = new Set([
  'que', 'qué', 'pasaria', 'pasaría', 'pasa', 'para', 'por', 'como', 'cómo', 'una', 'uno', 'los', 'las', 'del', 'con',
  'sin', 'sus', 'tus', 'mas', 'más', 'muy', 'cuando', 'donde', 'realmente', 'sabias', 'sabías', 'what', 'would',
  'happen', 'if', 'you', 'your', 'the', 'and', 'with', 'for', 'from', 'that', 'this', 'into', 'every', 'all', 'one',
  'day', 'dia', 'día', 'really', 'did', 'know', 'why', 'how',
]);

function stems(topic: string): Set<string> {
  const words = topic
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word));
  // 5-letter prefixes: "oceano"/"oceanos", "deshidrata"/"deshidratarte" match.
  return new Set(words.map((word) => word.slice(0, 5)));
}

export function isRepeatedTopic(topic: string, recent: string[]): string | null {
  const own = stems(topic);
  if (own.size < 2) return null;
  for (const past of recent) {
    const other = stems(past);
    if (other.size < 2) continue;
    let shared = 0;
    for (const stem of own) if (other.has(stem)) shared++;
    if (shared >= 2 && shared / Math.min(own.size, other.size) >= 0.6) return past;
  }
  return null;
}
