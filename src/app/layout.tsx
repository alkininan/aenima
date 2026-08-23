import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono, Space_Grotesk } from "next/font/google";

import { FOCUS_MODALITY_SCRIPT } from "@/lib/focus-modality";

import "./globals.css";

/**
 * design-spec.md §3 — three faces, all self-hosted woff2, `font-display: swap`,
 * full Latin Extended so Turkish and Dutch are covered on every face.
 *
 * `next/font/google` downloads the files at build time and serves them from our
 * own origin (verified against the installed Next 16.3.1 docs, `next/font`
 * reference: "CSS and font files are downloaded at build time and self-hosted
 * with the rest of your static assets. No requests are sent to Google by the
 * browser."), so this satisfies the no-CDN rule without checking binaries in.
 *
 * All three are variable fonts, so one file per subset carries every weight the
 * type scale asks for and no `weight` array is needed.
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  // §3 preloads SpaceGrotesk Bold + Medium; as a variable font both live in the
  // one file this preloads.
  preload: true,
  variable: "--font-space-grotesk",
});

const dmSans = DM_Sans({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  // Deviation from §3, agreed on the ticket: DM Sans carries nearly all
  // first-paint text, so it is preloaded too rather than swapping in late.
  preload: true,
  variable: "--font-dm-sans",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  preload: false,
  variable: "--font-jetbrains-mono",
});

/**
 * The one string that cannot wait for i18n: a document title is chrome, not
 * product copy, and it is what a browser tab and a search result show. The
 * description is product-spec.md §0's opening line, verbatim.
 */
export const metadata: Metadata = {
  title: "aenima",
  description:
    "Aenima turns raw product ideas into validated, developer-ready specifications — " +
    "automatically monitored, scored, and handed over.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      /**
       * §6: the focus-modality script writes `data-focus-modality` onto this
       * element, and it can do so before React hydrates — a Tab pressed on a
       * still-loading page lands in exactly that window. The server renders no
       * such attribute, because there is no modality until a device has been
       * used, so React finds one it did not write and warns that a tree
       * hydrated with attributes it cannot patch up.
       *
       * This is the case `suppressHydrationWarning` exists for: an element
       * deliberately mutated by an inline script before hydration. It applies to
       * this element only, one level deep, so nothing inside the app loses the
       * warning where it would mean something.
       */
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${dmSans.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <head>
        {/* §6: the focus split needs to know which device moved focus. The
            attribute starts absent — an autofocused field already has a caret,
            so a ring around it is the double stroke the split removes — and the
            script writes it on the first pointer or focus key. Still inlined in
            the head so the listeners are attached before anyone can beat them
            to it. */}
        <script dangerouslySetInnerHTML={{ __html: FOCUS_MODALITY_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
