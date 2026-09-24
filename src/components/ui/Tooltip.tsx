"use client";

import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { cx } from "@/lib/cx";

import { useEscapeLayer } from "./useLayer";
import {
  TOOLTIP_SHOW_DELAY_MS,
  tooltipBridgeClasses,
  tooltipBubbleClasses,
  type TooltipSide,
} from "./variants";

type TooltipProps = {
  content: ReactNode;
  /**
   * §8.14 places a tooltip below and flips it above at the viewport's edge, so
   * the side is measured rather than passed. A caller may still pin one — a
   * preview that wants both sides on screen at once — and the measurement then
   * stands aside.
   */
  side?: TooltipSide;
  /** The trigger. It receives `aria-describedby` while the tooltip is open. */
  children: ReactElement<{ "aria-describedby"?: string | undefined }>;
  className?: string;
};

/**
 * Tooltip (design-spec.md §8.14) — `--surface-2`, `--r-xs`, ui-caption, pad 6/10, max-width
 * 240, no arrow, `--delay-tooltip` show delay, instant hide, z 600, 8 from the trigger.
 *
 * The delay is on the way in only: a tooltip that lingers follows the pointer around the
 * screen. Pointer and keyboard both open it, so §11's "every interactive element reachable
 * by Tab" still describes a trigger whose help text can be read without a mouse.
 *
 * Three things §8.14 asks for that are easy to miss:
 *
 * - **It is below and centred**, flipping above only when it would leave the viewport. The
 *   flip is measured at open, against the bubble's own height.
 * - **The 8 between trigger and tooltip is part of the hover**, which is what makes the
 *   tooltip reachable at all — see `tooltipBridgeClasses`.
 * - **Esc closes it first and closes nothing else.** That falls out of the layer stack
 *   rather than being special-cased here: the tooltip is the most recently opened layer,
 *   so it is the one Escape belongs to, and the handler stops the keypress there (C-16).
 *
 * It is not portalled, which is how §8.14's "inside an open modal it is hosted in the
 * modal's subtree" is satisfied: rendering in place inside the trigger puts it wherever
 * the trigger already is, so the page's inertness never reaches it.
 */
export function Tooltip({ content, side, children, className }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [measured, setMeasured] = useState<TooltipSide>("bottom");
  const bridgeRef = useRef<HTMLSpanElement | null>(null);
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clear();
    timer.current = setTimeout(() => setOpen(true), TOOLTIP_SHOW_DELAY_MS);
  }, [clear]);

  // §8.14: instant hide — no closing delay, and any pending open is dropped.
  const hide = useCallback(() => {
    clear();
    setOpen(false);
  }, [clear]);

  useEscapeLayer({ open, kind: "tooltip", onClose: hide });
  useEffect(() => clear, [clear]);

  /**
   * §8.14's flip. Measured against the bubble's rendered height rather than a guess, and
   * only where the caller has not pinned a side. The bridge's height already carries the 8
   * the bubble stands off by — it is the bridge's own padding — so nothing is added to it.
   */
  useLayoutEffect(() => {
    if (!open || side) return;
    const host = hostRef.current;
    const bridge = bridgeRef.current;
    if (!host || !bridge) return;

    const trigger = host.getBoundingClientRect();
    setMeasured(window.innerHeight - trigger.bottom < bridge.offsetHeight ? "top" : "bottom");
  }, [open, side]);

  return (
    <span
      ref={hostRef}
      className={cx("relative inline-flex", className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {cloneElement(children, { "aria-describedby": open ? id : undefined })}
      {open ? (
        <span ref={bridgeRef} className={tooltipBridgeClasses(side ?? measured)}>
          <span role="tooltip" id={id} className={tooltipBubbleClasses()}>
            {content}
          </span>
        </span>
      ) : null}
    </span>
  );
}
