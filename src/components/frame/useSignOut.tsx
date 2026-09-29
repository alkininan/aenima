"use client";

import { useCallback, useRef, type ReactNode } from "react";

/**
 * §4: "Sign out is a plain row and takes no confirm: ending a session destroys nothing that
 * was saved". A menu row is a button, and the sign-out is a POST to `/auth/sign-out` — the
 * route handler the sidebar's form has always used — so the row submits a form rather than
 * fetching: the handler answers with a redirect and cleared cookies, and a full navigation
 * is what lets the proxy see them. The form is `hidden` and holds no fields; `requestSubmit`
 * runs the browser's own submission.
 */
export function useSignOut(): { form: ReactNode; signOut: () => void } {
  const ref = useRef<HTMLFormElement | null>(null);
  const signOut = useCallback(() => ref.current?.requestSubmit(), []);
  const form = <form ref={ref} action="/auth/sign-out" method="post" hidden />;
  return { form, signOut };
}
