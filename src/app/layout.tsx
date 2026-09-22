import type { Metadata } from "next";

import { FOCUS_MODALITY_SCRIPT } from "@/lib/focus-modality";

import { FONT_VARIABLES } from "./fonts";
import "./globals.css";

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
      className={`${FONT_VARIABLES} h-full antialiased`}
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
