import type { Metadata } from "next";

import { getDictionary } from "@/i18n";

import { SignInForm } from "./SignInForm";

export const metadata: Metadata = {
  title: "Sign in · aenima",
};

/**
 * design-spec.md §1 puts the glass Æ on the login backdrop; that render is not
 * produced yet, so this uses the flat mark on §2's dot grid — the decorative
 * surface §0 law 9 permits and the pattern §10 already uses for standalone
 * pages. Swapping in the hero render later touches only this file.
 */
export default function SignInPage() {
  const t = getDictionary();

  return (
    // §8.3: the step's mark sits 48 below the top of the page — 16 below 600
    // tall (§4 Height), so a landscape phone still sees a step whole — and the
    // mode's gutters sit outside the column: 16 in hand chrome, 24 from 1024.
    <main className="dot-grid flex flex-1 flex-col items-center px-[16px] py-[48px] lg:px-[24px] [@media(max-height:599px)]:pt-[16px]">
      <SignInForm />
      <p className="sr-only">{t.common.appName}</p>
    </main>
  );
}
