"use client";

import {
  cloneElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { cx } from "@/lib/cx";

import { useEscapeLayer } from "./useLayer";
import { TOOLTIP_SHOW_DELAY_MS, tooltipClasses, type TooltipSide } from "./variants";

type TooltipProps = {
  content: ReactNode;
  /** §8 gives no placement; top is the default and bottom is the flip. */
  side?: TooltipSide;
  /** The trigger. It receives `aria-describedby` while the tooltip is open. */
  children: ReactElement<{ "aria-describedby"?: string | undefined }>;
  className?: string;
};

/**
 * Tooltip (design-spec.md §8) — `--surface-2`, radius 8, ui-caption, pad 6/10,
 * max-width 240, no arrow, 500ms show delay, instant hide, z 600.
 *
 * The delay is on the way in only: a tooltip that lingers follows the pointer
 * around the screen. Pointer and keyboard both open it, so §11's "focus ring
 * per §6, every interactive element reachable by Tab" still describes a trigger
 * whose help text can be read without a mouse.
 */
export function Tooltip({ content, side = "top", children, className }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const show = () => {
    clear();
    timer.current = setTimeout(() => setOpen(true), TOOLTIP_SHOW_DELAY_MS);
  };

  // §8: instant hide — no closing delay, and any pending open is dropped.
  const hide = () => {
    clear();
    setOpen(false);
  };

  useEscapeLayer({ open, kind: "tooltip", onClose: hide });
  useEffect(() => clear, []);

  return (
    <span
      className={cx("relative inline-flex", className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {cloneElement(children, { "aria-describedby": open ? id : undefined })}
      {open ? (
        <span role="tooltip" id={id} className={tooltipClasses(side)}>
          {content}
        </span>
      ) : null}
    </span>
  );
}
