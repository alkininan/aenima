"use client";

import { useId, type ReactNode } from "react";

import { Overlay } from "./Overlay";
import {
  MODAL_BODY_CLASSES,
  MODAL_FOOTER_CLASSES,
  MODAL_TITLE_CLASSES,
  MODAL_VIEWPORT_CLASSES,
  modalClasses,
  type ModalWidth,
} from "./variants";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  /** §8: title display-lg. */
  title: string;
  /** §8: max 400 (confirm) / 640 (content). */
  width?: ModalWidth;
  children: ReactNode;
  /** §8: footer buttons right, primary last. Pass them in that order. */
  footer?: ReactNode;
  className?: string;
};

/**
 * Modal (design-spec.md §8) — scrim `--bg-scrim`, glass recipe, `--r-md`, modal
 * shadow, 400 wide to confirm and 640 to hold content, display-lg title, footer
 * buttons right with the primary last.
 *
 * The body scrolls and the footer stays put, so the confirming action is
 * reachable however long the content runs.
 */
export function Modal({
  open,
  onClose,
  title,
  width = "confirm",
  children,
  footer,
  className,
}: ModalProps) {
  const titleId = useId();

  return (
    <Overlay
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      viewportClassName={MODAL_VIEWPORT_CLASSES}
      surfaceClassName={modalClasses(width, className)}
    >
      <h2 id={titleId} className={MODAL_TITLE_CLASSES}>
        {title}
      </h2>
      <div className={`${MODAL_BODY_CLASSES} mt-[16px] text-n-primary`}>{children}</div>
      {footer ? <div className={MODAL_FOOTER_CLASSES}>{footer}</div> : null}
    </Overlay>
  );
}
