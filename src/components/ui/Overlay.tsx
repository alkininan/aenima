"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cx } from "@/lib/cx";
import { pushOverlayHost } from "@/lib/overlay-host";

import { useExitTransition } from "./useExit";
import { useEscapeLayer, useFocusTrap } from "./useLayer";
import { SCRIM_CLASSES } from "./variants";

/** Never resubscribes: the answer to "is there a document" cannot change. */
const noopSubscribe = () => () => {};

type OverlayProps = {
  open: boolean;
  onClose: () => void;
  /** The id of the element that titles the dialog. */
  labelledBy: string;
  viewportClassName: string;
  surfaceClassName: string;
  children: ReactNode;
};

/**
 * The shared body of a modal and a side sheet (design-spec.md §8).
 *
 * Both sit on rung 400 of the §4 ladder — scrim and surface together — and both
 * owe §11 the same three things: focus trapped inside, `Esc` closing the
 * topmost layer only, and focus returning to the opener on close. That is all
 * this component is; the shape of the surface belongs to its caller.
 *
 * Rendered into `document.body` so an ancestor's transform or filter can never
 * turn `position: fixed` into something relative and drop the layer out of the
 * ladder.
 */
export function Overlay({
  open,
  onClose,
  labelledBy,
  viewportClassName,
  surfaceClassName,
  children,
}: OverlayProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  // §6: the surface stays on the page until its exit transition has run (C-48).
  const { present, leaving } = useExitTransition({ open, ref: surfaceRef });
  // The portal target only exists in the browser; the server renders nothing.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  useEscapeLayer({ open, kind: "modal", onClose });
  useFocusTrap({ open, containerRef: surfaceRef });

  /**
   * §8.20 and §8.14: while this modal is open it is where a toast and a tooltip are
   * hosted. The rest of the page is inert behind the scrim, so a floating layer rendered
   * outside the modal paints above it and refuses the click (C-20). Registering the
   * surface rather than the viewport keeps the portal inside the dialog's own subtree.
   */
  useEffect(() => {
    if (!open) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    return pushOverlayHost(surface);
  }, [open]);

  // A scrim that can be scrolled past is not a scrim.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!present || !mounted) return null;

  return createPortal(
    <>
      {/* The scrim takes backdrop clicks; the viewport above it is a
          click-through frame so only the surface itself is solid. */}
      <div
        className={cx(SCRIM_CLASSES, "overlay-fade")}
        data-leaving={leaving ? "" : undefined}
        onClick={onClose}
        aria-hidden="true"
      />
      <div className={viewportClassName}>
        <div
          ref={surfaceRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          tabIndex={-1}
          data-leaving={leaving ? "" : undefined}
          className={surfaceClassName}
        >
          {children}
        </div>
      </div>
    </>,
    document.body,
  );
}
