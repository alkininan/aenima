"use client";

import { useCallback, useEffect, useId, useRef, type RefObject } from "react";

import { getFocusableElements, nextTrapTarget } from "@/lib/focus";
import { isTopLayer, pushLayer, removeLayer, type LayerKind } from "@/lib/layer-stack";

/**
 * Keeps a callback current without making every listener re-subscribe.
 *
 * The write happens in an effect rather than during render: render has to stay
 * pure, and every reader here is itself an effect that runs afterwards.
 */
function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

export type EscapeLayerOptions = {
  open: boolean;
  /** Which rung of the §4 ladder this layer sits on. */
  kind: LayerKind;
  onClose: () => void;
};

/**
 * design-spec.md §11: "`Esc` closes the topmost z-layer."
 *
 * Registering with the shared stack is what makes "topmost" meaningful — a menu
 * inside a modal swallows the first Escape, and the modal takes the second.
 */
export function useEscapeLayer({ open, kind, onClose }: EscapeLayerOptions): void {
  const id = useId();
  const onCloseRef = useLatest(onClose);

  useEffect(() => {
    if (!open) return;
    pushLayer(id, kind);
    return () => removeLayer(id);
  }, [open, id, kind]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !isTopLayer(id)) return;
      // Stop here so one keypress never travels down two rungs of the ladder.
      event.stopPropagation();
      event.preventDefault();
      onCloseRef.current();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, id, onCloseRef]);
}

export type FocusTrapOptions = {
  open: boolean;
  containerRef: RefObject<HTMLElement | null>;
  /** Modals trap Tab; a popover only borrows focus and hands it back. */
  trap?: boolean;
  /** Move focus into the layer when it opens. */
  autoFocus?: boolean;
};

/**
 * design-spec.md §11: "focus trapped inside modals; on close, focus returns to
 * the opener."
 */
export function useFocusTrap({
  open,
  containerRef,
  trap = true,
  autoFocus = true,
}: FocusTrapOptions): void {
  useEffect(() => {
    if (!open) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (autoFocus) {
      const container = containerRef.current;
      if (container) {
        // The container itself carries tabIndex -1, so a layer with nothing
        // focusable in it still takes focus rather than leaving it outside.
        (getFocusableElements(container)[0] ?? container).focus();
      }
    }

    return () => {
      opener?.focus();
    };
  }, [open, containerRef, autoFocus]);

  useEffect(() => {
    if (!open || !trap) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;

      const target = nextTrapTarget(
        getFocusableElements(container),
        document.activeElement,
        event.shiftKey,
      );
      if (!target) return;

      event.preventDefault();
      target.focus();
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, trap, containerRef]);
}

export type OutsideDismissOptions = {
  open: boolean;
  refs: ReadonlyArray<RefObject<HTMLElement | null>>;
  onDismiss: () => void;
};

/** Closes a popover when the next pointer press lands outside it. */
export function useOutsideDismiss({ open, refs, onDismiss }: OutsideDismissOptions): void {
  const onDismissRef = useLatest(onDismiss);
  const refsRef = useLatest(refs);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (refsRef.current.some((ref) => ref.current?.contains(target))) return;
      onDismissRef.current();
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, onDismissRef, refsRef]);
}

/**
 * §8: a select "opens below (above if <320px space)". Measured against the
 * trigger at the moment of opening, not on every scroll — the panel is
 * dismissed by any outside interaction anyway.
 */
export function usePanelPlacement(
  triggerRef: RefObject<HTMLElement | null>,
  maxHeight: number,
): (open: boolean) => "below" | "above" {
  return useCallback(
    (open: boolean) => {
      if (!open) return "below";
      const trigger = triggerRef.current;
      if (!trigger) return "below";
      const below = window.innerHeight - trigger.getBoundingClientRect().bottom;
      return below < maxHeight ? "above" : "below";
    },
    [triggerRef, maxHeight],
  );
}
