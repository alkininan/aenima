import { en, type Dictionary } from "./en";
import { DEFAULT_LOCALE, type Locale } from "./locales";

export type { Dictionary };
export { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from "./locales";

/**
 * `tr` and `nl` resolve to English until their dictionaries are written. The
 * type already demands a complete dictionary, so adding `tr.ts` is one import
 * and one line here — and the compiler will list every string still missing.
 * No call site changes when they land, which is the point.
 */
const dictionaries: Record<Locale, Dictionary> = {
  en,
  tr: en,
  nl: en,
};

export function getDictionary(locale: Locale = DEFAULT_LOCALE): Dictionary {
  return dictionaries[locale];
}
