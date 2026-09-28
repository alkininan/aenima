import { en, type Dictionary } from "./en";
import { DEFAULT_LOCALE, type Locale } from "./locales";
import { nl } from "./nl";
import { tr } from "./tr";

export type { Dictionary };
export { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from "./locales";

/**
 * `tr` and `nl` carry what has been translated — the shortcut sheet, since T0.45 — over the
 * English for everything else, until their dictionaries are written whole. The type already
 * demands a complete dictionary, so finishing one is a matter of widening its `Pick` until the
 * spread is the whole thing — and the compiler lists every string still missing. No call site
 * changes when they land, which is the point.
 */
const dictionaries: Record<Locale, Dictionary> = {
  en,
  tr: { ...en, common: { ...en.common, ...tr.common }, shortcuts: tr.shortcuts },
  nl: { ...en, common: { ...en.common, ...nl.common }, shortcuts: nl.shortcuts },
};

export function getDictionary(locale: Locale = DEFAULT_LOCALE): Dictionary {
  return dictionaries[locale];
}
