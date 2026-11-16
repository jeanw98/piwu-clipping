import type { ClipLanguage } from './schemas';

/** Spanish UI labels for the clip languages. */
export const LANGUAGE_LABELS_ES: Record<ClipLanguage, string> = {
  'es-LA': 'Español (Latino)',
  'es-ES': 'Español (España)',
  'en-US': 'Inglés (EE. UU.)',
  'en-GB': 'Inglés (Reino Unido)',
  'pt-BR': 'Portugués (Brasil)',
  'fr-FR': 'Francés',
  'de-DE': 'Alemán',
  'it-IT': 'Italiano',
};

export interface VoiceTraits {
  /** ISO 639-1 language of the voice ("es"), when known. */
  language?: string | null;
  accent?: string | null;
  /** e.g. "es-MX", "en-GB". */
  locale?: string | null;
}

interface LanguageRule {
  /** ElevenLabs Voice Library `language` filter. */
  lang: string;
  /** Does this accent/locale belong to the requested variant? */
  accepts: (traits: { accent: string; locale: string }) => boolean;
}

const LATAM_ACCENT =
  /latin|latam|mexic|argentin|rioplat|colombi|chile|venezu|peru|cuba|caribe|caribbean|puerto ?ric|dominic|ecuador|bolivia|urugua|paragua|guatemal|hondur|salvador|nicaragu|costa ?ric|panam|central americ|neutral/;
const SPAIN_ACCENT = /peninsular|castilian|castellan|spain|españa|iberian|andalu|madrid|catal|canari/;

const RULES: Record<ClipLanguage, LanguageRule> = {
  'es-LA': {
    lang: 'es',
    accepts: ({ accent, locale }) =>
      !SPAIN_ACCENT.test(accent) &&
      locale !== 'es-es' &&
      (LATAM_ACCENT.test(accent) || (/^es-/.test(locale) && locale !== 'es-es')),
  },
  'es-ES': {
    lang: 'es',
    accepts: ({ accent, locale }) => locale === 'es-es' || SPAIN_ACCENT.test(accent),
  },
  'en-US': {
    lang: 'en',
    accepts: ({ accent, locale }) =>
      locale === 'en-us' || /americ|\bus\b|u\.s\.|standard$|general american|california|new york|southern|midwest/.test(accent),
  },
  'en-GB': {
    lang: 'en',
    accepts: ({ accent, locale }) =>
      locale === 'en-gb' || /british|english|\buk\b|london|received|rp\b|scottish|welsh|yorkshire|cockney|essex|manchester/.test(accent),
  },
  'pt-BR': {
    lang: 'pt',
    accepts: ({ accent, locale }) => locale === 'pt-br' || /brazil|brasil|paulist|carioca/.test(accent),
  },
  'fr-FR': { lang: 'fr', accepts: ({ accent }) => !/canad|québ|quebec|african|belg|swiss/.test(accent) },
  'de-DE': { lang: 'de', accepts: ({ accent }) => !/swiss|austria/.test(accent) },
  'it-IT': { lang: 'it', accepts: () => true },
};

/** ISO language code for ElevenLabs filters ("es-LA" → "es"). */
export function voiceLanguageCode(language: ClipLanguage): string {
  return RULES[language].lang;
}

/**
 * Whether a voice is native to the requested language variant
 * (e.g. Latin-American Spanish, not Castilian nor an American voice
 * reading Spanish). Voices with no language/accent info never match.
 */
export function voiceMatchesLanguage(language: ClipLanguage, traits: VoiceTraits): boolean {
  const rule = RULES[language];
  const locale = (traits.locale ?? '').trim().toLowerCase();
  const lang = (traits.language ?? locale.split('-')[0] ?? '').trim().toLowerCase();
  if (lang !== rule.lang) return false;
  return rule.accepts({ accent: (traits.accent ?? '').trim().toLowerCase(), locale });
}
