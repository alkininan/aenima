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
    <main className="dot-grid flex flex-1 flex-col items-center justify-center px-[24px] py-[48px]">
      <SignInForm />
      <p className="sr-only">{t.common.appName}</p>
    </main>
  );
}
