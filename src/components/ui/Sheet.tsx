"use client";

import { useId, type ReactNode } from "react";

import { getDictionary } from "@/i18n";

import { IconButton } from "./IconButton";
import { CloseIcon } from "./icons";
import { Overlay } from "./Overlay";
import {
  MODAL_BODY_CLASSES,
  SHEET_HEADER_CLASSES,
  SHEET_TITLE_CLASSES,
  SHEET_VIEWPORT_CLASSES,
  sheetClasses,
} from "./variants";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
};

/**
 * Side sheet (design-spec.md §8.21) — 480 wide, right slide-in over `--t-med`,
 * glass recipe, `--r-lg` on the leading corners only, so the sheet reads as
 * having come from off-screen rather than as a floating card.
 *
 * Same layer and the same §11 obligations as the modal; what differs is the
 * geometry, the entrance, and the way out: a sheet "carries no footer and
 * instead a 56 header — title display-md, a Neutral 34 close IconButton
 * (`xmark`) at the right — at every width", pinned above a body that scrolls.
 * Below 768 it is a bottom sheet (C-26) with the same header, which is why the
 * header is one element rather than a per-width choice.
 */
export function Sheet({ open, onClose, title, children, className }: SheetProps) {
  const t = getDictionary();
  const titleId = useId();

  return (
    <Overlay
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      viewportClassName={SHEET_VIEWPORT_CLASSES}
      surfaceClassName={sheetClasses(className)}
    >
      <div className={SHEET_HEADER_CLASSES}>
        <h2 id={titleId} className={SHEET_TITLE_CLASSES}>
          {title}
        </h2>
        <IconButton
          variant="neutral"
          size="md"
          label={t.common.close}
          icon={<CloseIcon />}
          onClick={onClose}
        />
      </div>
      <div className={`${MODAL_BODY_CLASSES} text-n-primary`}>{children}</div>
    </Overlay>
  );
}
