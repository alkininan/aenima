/**
 * product-spec.md §12: UI, chat, interviews, evidence and digests all render in
 * EN/TR/NL. §16 rules out RTL — all three are LTR.
 */
export const LOCALES = ["en", "tr", "nl"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
