"use client";

import { useId, type ReactNode } from "react";

import { Overlay } from "./Overlay";
import {
  MODAL_BODY_CLASSES,
  MODAL_FOOTER_CLASSES,
  MODAL_TITLE_CLASSES,
  SHEET_VIEWPORT_CLASSES,
  sheetClasses,
} from "./variants";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

/**
 * Side sheet (design-spec.md §8) — 480 wide, right slide-in over `--t-med`,
 * glass recipe, `--r-lg` on the leading corners only, so the sheet reads as
 * having come from off-screen rather than as a floating card.
 *
 * Same layer and the same §11 obligations as the modal; only the geometry and
 * the entrance differ.
 */
export function Sheet({ open, onClose, title, children, footer, className }: SheetProps) {
  const titleId = useId();

  return (
    <Overlay
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      viewportClassName={SHEET_VIEWPORT_CLASSES}
      surfaceClassName={sheetClasses(className)}
    >
      <h2 id={titleId} className={MODAL_TITLE_CLASSES}>
        {title}
      </h2>
      <div className={`${MODAL_BODY_CLASSES} mt-[16px] text-n-primary`}>{children}</div>
      {footer ? <div className={MODAL_FOOTER_CLASSES}>{footer}</div> : null}
    </Overlay>
  );
}
