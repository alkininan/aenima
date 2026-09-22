import { Space_Grotesk } from "next/font/google";
import localFont from "next/font/local";

/**
 * design-spec.md §3 — three faces, all self-hosted woff2, `font-display: swap`, each
 * face's Latin subset preloaded, full Latin Extended so TR `ğĞşŞİı` and NL `ĳĲ` are
 * covered.
 *
 * **Only Space Grotesk comes from Google Fonts.** §3 names what its builds of the other
 * two cost: DM Sans 4.004 there carries no `tnum`, so `tabular-nums` does nothing in it
 * and law 6's typed-digits exception cannot render, and JetBrains Mono 2.211 lacks Ĳ ĳ
 * and the ⌘ ⇧ the kbd hint draws (§8.15). Both are vendored from their own repositories
 * instead — upstream DM Sans is the same 4.004 rebuilt with tabular figures, JetBrains
 * Mono is 2.305 — and cut into subsets by `scripts/fonts/vendor.py`, which is where the
 * pinned commits and the ranges below come from.
 *
 * `next/font/local` emits one `@font-face` per file in a call and one family name for the
 * call, so each vendored face is **two calls sharing one family**: the family is declared
 * outright rather than left to the generated name, and each call carries the
 * `unicode-range` of the subset it loads. Two calls with two generated families would put
 * the first family's metric fallback ahead of the second family in the stack, and every
 * Turkish letter would render in that fallback rather than in the face.
 *
 * **The ranges are written out in full, four times, because the compiler reads these
 * calls out of the source**: every option must be a literal, and a range held in a
 * constant reaches the loader as a missing value. They are still stated once — this is
 * the once. `scripts/fonts/vendor.py` reads them from here and cuts each file to the
 * range declared for it, so the file a browser is told to fetch for a letter is the file
 * that holds it. They are Google Fonts' own ranges, so a vendored face and a served one
 * split at the same place.
 *
 * `next/font/google` downloads every subset the font has and preloads only the ones named
 * in `subsets` (verified in the installed Next 16.3.1: `findFontFilesInCss` marks a file
 * for preload when its subset is listed, and downloads it either way). So Space Grotesk
 * needs `subsets: ["latin"]` alone to satisfy §3: Latin Extended is still declared, with
 * its own `unicode-range`, and fetched when a Turkish or Dutch letter is painted.
 *
 * §3's Latin Extended preload is the one clause of this section that cannot be written
 * yet. `preload` is read off the source the same way, so it cannot ask which locale is
 * rendering — and nothing renders TR or NL today: `i18n` carries one dictionary and
 * `getDictionary()` takes `DEFAULT_LOCALE`. So the Latin Extended subsets are declared
 * and not preloaded, which is exactly §3's rule for EN, and the day a locale is resolved
 * per request this becomes a per-locale entry point rather than a flag on these calls.
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  preload: true,
  variable: "--font-space-grotesk",
});

const dmSansLatin = localFont({
  src: "./fonts/dm-sans-latin.woff2",
  weight: "100 1000",
  style: "normal",
  display: "swap",
  preload: true,
  variable: "--font-dm-sans-latin",
  declarations: [
    { prop: "font-family", value: "'DM Sans'" },
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    },
  ],
});

const dmSansLatinExt = localFont({
  src: "./fonts/dm-sans-latin-ext.woff2",
  weight: "100 1000",
  style: "normal",
  display: "swap",
  preload: false,
  variable: "--font-dm-sans-latin-ext",
  declarations: [
    { prop: "font-family", value: "'DM Sans'" },
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
    },
  ],
});

const jetBrainsMonoLatin = localFont({
  src: "./fonts/jetbrains-mono-latin.woff2",
  weight: "100 800",
  style: "normal",
  display: "swap",
  preload: true,
  variable: "--font-jetbrains-mono-latin",
  declarations: [
    { prop: "font-family", value: "'JetBrains Mono'" },
    {
      // §8.15's kbd hint draws ⌘ and ⇧ whatever the locale, and neither is in Google's
      // Latin range, so this face's Latin subset carries them: U+2318 and U+21E7.
      prop: "unicode-range",
      value:
        "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD,U+21E7,U+2318",
    },
  ],
});

const jetBrainsMonoLatinExt = localFont({
  src: "./fonts/jetbrains-mono-latin-ext.woff2",
  weight: "100 800",
  style: "normal",
  display: "swap",
  preload: false,
  variable: "--font-jetbrains-mono-latin-ext",
  declarations: [
    { prop: "font-family", value: "'JetBrains Mono'" },
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
    },
  ],
});

/**
 * The classes for the root element.
 *
 * Space Grotesk's carries `--font-display`'s family, which is what `globals.css` reads —
 * a Google face's family name is generated, so the variable is the only way to name it.
 * The vendored faces declare their family outright, so `globals.css` names `'DM Sans'`
 * and `'JetBrains Mono'` as §3 writes them, and the variables these four calls generate
 * are read by nothing: each is named for the subset it loads, not for the face, so that
 * nothing later reaches for `--font-dm-sans` and gets a family that does not exist. The
 * classes are on the element so that each subset's `@font-face` is in the document.
 */
export const FONT_VARIABLES = [
  spaceGrotesk.variable,
  dmSansLatin.variable,
  dmSansLatinExt.variable,
  jetBrainsMonoLatin.variable,
  jetBrainsMonoLatinExt.variable,
].join(" ");
