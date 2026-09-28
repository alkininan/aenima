"use client";

import { useSyncExternalStore } from "react";

import { KEYBOARD_RECORDED_ATTRIBUTE } from "@/lib/focus-modality";
import { hintsOffered } from "@/lib/shortcuts";

/** §7's pointer query. Everything else is touch, at any width. */
export const POINTER_QUERY = "(hover: hover) and (pointer: fine)";

const pointerQuery = (): MediaQueryList | null =>
  typeof window.matchMedia === "function" ? window.matchMedia(POINTER_QUERY) : null;

function read(): boolean {
  return hintsOffered({
    pointer: pointerQuery()?.matches ?? false,
    keyboardRecorded: document.documentElement.hasAttribute(KEYBOARD_RECORDED_ATTRIBUTE),
  });
}

/**
 * Two things can change the answer: the device's pointer query, and the modality script
 * recording keyboard input on `<html>` at the first focus key (§6) — once, and for good.
 */
function subscribe(listener: () => void): () => void {
  const query = pointerQuery();
  query?.addEventListener("change", listener);
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [KEYBOARD_RECORDED_ATTRIBUTE],
  });
  return () => {
    query?.removeEventListener("change", listener);
    observer.disconnect();
  };
}

/**
 * design-spec.md §4 and §8.15: whether a keyboard hint — and the account menu's "Keyboard
 * shortcuts" row — is offered: "always on pointer devices, and on touch once the modality
 * script has recorded keyboard input". The server answers no; a menu's rows are not rendered
 * until it opens, so the answer is read on the client before it is ever painted.
 */
export function useKeyboardOffered(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
