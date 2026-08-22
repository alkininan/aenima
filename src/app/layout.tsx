import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono, Space_Grotesk } from "next/font/google";

import {
  DEFAULT_FOCUS_MODALITY,
  FOCUS_MODALITY_ATTRIBUTE,
  FOCUS_MODALITY_SCRIPT,
} from "@/lib/focus-modality";

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
      // §6 (v2.5): the default modality is rendered, not left to the script to
      // add. Setting it client-side only would mismatch the server's HTML on
      // hydration, and it keeps the keyboard ring working with JS disabled.
      {...{ [FOCUS_MODALITY_ATTRIBUTE]: DEFAULT_FOCUS_MODALITY }}
      className={`${spaceGrotesk.variable} ${dmSans.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <head>
        {/* §6 (v2.5): the focus split needs to know which device moved focus,
            and it has to know before the first paint — sign-in autofocuses. */}
        <script dangerouslySetInnerHTML={{ __html: FOCUS_MODALITY_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
