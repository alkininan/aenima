"use client";

import { useId, type ReactNode } from "react";

import { getDictionary } from "@/i18n";

import { Button } from "./Button";
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
  /**
   * §8: footer buttons right, primary last. Pass them in that order. Left out, the footer
   * is §8.21's floor — a Neutral md Close — "so the scrim is never its only way out".
   */
  footer?: ReactNode;
  className?: string;
};

/**
 * Modal (design-spec.md §8) — scrim `--bg-scrim`, glass recipe, `--r-md`, modal
 * shadow, 400 wide to confirm and 640 to hold content, display-lg title, footer
 * buttons right with the primary last.
 *
 * The body scrolls and the footer stays put, so the confirming action is
 * reachable however long the content runs. **Every modal carries a footer**
 * (§8.21): at least a Neutral md Close, and below 768 — where the modal is a
 * bottom sheet — the footer is lg, full width and stacked, from the same
 * element at every width.
 *
 * It reads its own copy for the Close: a client component is never handed the
 * dictionary, whose formatters cannot cross the boundary.
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
  const t = getDictionary();
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
      <div className={MODAL_FOOTER_CLASSES}>
        {footer ?? (
          <Button variant="neutral" size="md" onClick={onClose}>
            {t.common.close}
          </Button>
        )}
      </div>
    </Overlay>
  );
}
