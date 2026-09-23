"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

import {
  classifyViewportChange,
  readViewport,
  subscribeDockChange,
  type ViewportState,
} from "@/lib/anchor-change";
import { morphPath, runMorph, skipRunningMorph } from "@/lib/morph";
import { placePanel, type Placement } from "@/lib/panel-placement";

import { panelSurfaceClasses, PANEL_MAX_HEIGHT } from "./variants";
import { useEscapeLayer, useOutsideDismiss } from "./useLayer";

/**
 * design-spec.md §6 Morph — the panel every morphing trigger opens.
 *
 * §6 names the mechanism once and this component is it: "The panel is a `popover` — top
 * layer, light dismiss and `Esc` for free, nested popovers closing innermost-first, which
 * is §4's last-opened-wins." Placement is `placePanel` on both of §6's two paths, the
 * transition is `runMorph`, and what closes it is `anchor-change`.
 *
 * **Everything platform-specific here is an enhancement and never a requirement.** §6 says
 * so of the transition — "the morph is pure enhancement and can never be the reason a menu
 * fails to open" — and the same has to be true of the top layer, because the DOM checks run
 * in an emulator that has no `popover` at all. So the panel renders, is placed, takes focus
 * and closes identically whether or not `showPopover` exists; what the platform adds is the
 * top layer and its light dismiss, and where it is absent the v2.17 absolutely-positioned
 * panel is what remains. The escape stack and the outside-press dismiss are ours on both
 * paths rather than the platform's on one: §4's ladder is last-opened-wins across a modal
 * that is a portal and not a `<dialog>`, which the platform cannot order for us (C-16).
 */

/** Whether this engine puts a popover in the top layer. */
function supportsPopover(): boolean {
  return typeof HTMLElement !== "undefined" && "popover" in HTMLElement.prototype;
}

function supportsAnchorPositioning(): boolean {
  return typeof CSS !== "undefined" && CSS.supports?.("anchor-name: --a") === true;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/** §17's kitchen-sink switch, read off any ancestor. */
function forcedFallback(node: Element | null): boolean {
  return node?.closest("[data-force-fallback]") != null;
}

export type PanelProps = {
  open: boolean;
  onClose: () => void;
  /** The control the panel grows out of. Hidden for the panel's lifetime (§6). */
  triggerRef: RefObject<HTMLElement | null>;
  /** §8.5: a select's panel takes the field's width. §8.18: a menu takes its own. */
  width?: "trigger" | "auto" | undefined;
  /** §8.5: "At most 320 tall, its 6 padding included." */
  maxHeight?: number | undefined;
  /** What takes focus in the update callback — a select's selected option (§6, C-17). */
  focusOnOpen?: (() => HTMLElement | null) | undefined;
  className?: string | undefined;
  children: ReactNode;
};

export function Panel({
  open,
  onClose,
  triggerRef,
  width = "auto",
  maxHeight = PANEL_MAX_HEIGHT,
  focusOnOpen,
  className,
  children,
}: PanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const anchorName = `--panel-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const viewportRef = useRef<ViewportState | null>(null);
  const onCloseRef = useRef(onClose);
  const focusRef = useRef(focusOnOpen);

  useEffect(() => {
    onCloseRef.current = onClose;
    focusRef.current = focusOnOpen;
  });

  /**
   * §6's placement rule, applied. The decision — which side, which edge, how tall — is
   * `placePanel`'s on both paths; only who writes the pixels differs.
   */
  const place = useCallback((): Placement | null => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return null;

    const rect = trigger.getBoundingClientRect();
    const wanted = {
      width: width === "trigger" ? rect.width : panel.offsetWidth,
      height: panel.scrollHeight,
    };
    const placement = placePanel({
      trigger: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      panel: wanted,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      maxHeight,
    });

    panel.dataset["side"] = placement.side;
    panel.dataset["align"] = placement.left === rect.left ? "start" : "end";
    panel.style.setProperty("--panel-max-h", `${placement.maxHeight}px`);
    panel.style.maxHeight = `${placement.maxHeight}px`;
    if (width === "trigger") panel.style.width = `${rect.width}px`;

    // The two paths §6 requires. The engine does the arithmetic from the live anchor
    // where it can; where it cannot — or where the kitchen-sink route has asked for the
    // positioner so the browser check can compare the two — we write the same numbers.
    const anchored = supportsAnchorPositioning() && !forcedFallback(panel);
    panel.classList.toggle("panel-anchored", anchored);
    if (anchored) {
      trigger.style.setProperty("anchor-name", anchorName);
      panel.style.setProperty("position-anchor", anchorName);
      panel.style.top = "";
      panel.style.left = "";
    } else {
      panel.style.position = "fixed";
      panel.style.top = `${placement.top}px`;
      panel.style.left = `${placement.left}px`;
      panel.style.margin = "0";
    }

    return placement;
  }, [triggerRef, width, maxHeight, anchorName]);

  /** Opening: place, then morph the open — the update callback is showPopover plus focus. */
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    viewportRef.current = readViewport();
    place();

    const path = morphPath({
      hasViewTransition: typeof document !== "undefined" && "startViewTransition" in document,
      reducedMotion: prefersReducedMotion(),
      forceFallback: forcedFallback(panel),
    });

    const update = () => {
      if (supportsPopover()) {
        // Set on the element rather than in the JSX: a capability asked during render
        // answers differently on the server, and React would refuse to patch it up.
        panel.setAttribute("popover", "auto");
        if (!panel.matches(":popover-open")) panel.showPopover();
      }
      // §6: "The trigger is `visibility: hidden` for the panel's lifetime, its box
      // reserved" — which is also what keeps a click that light-dismisses the panel from
      // landing on the trigger and reopening it on the way back up.
      trigger.style.visibility = "hidden";
      // §6: focus is placed here, "straight after `showPopover()`", never deferred to
      // `finished` — the hidden trigger loses focus at the next rendering update and a
      // keystroke in the gap would go nowhere (C-17).
      focusRef.current?.()?.focus();
    };

    if (path === "bare") {
      update();
      return;
    }

    runMorph({
      trigger,
      panel,
      content: contentRef.current,
      triggerHeight: trigger.getBoundingClientRect().height,
      update,
    });
  }, [open, place, triggerRef]);

  /**
   * Closing: instant on every path (§6), and the trigger comes back.
   *
   * A layout effect, not an effect: the trigger is `visibility: hidden` while the panel
   * is open and a hidden element cannot take focus, so the caller's focus-return (§11,
   * "on close, focus returns to the opener") has to run after this and before the paint.
   * React runs a child's layout effects before its parent's, so a caller that returns
   * focus from its own layout effect is ordered behind this one by construction.
   */
  useLayoutEffect(() => {
    if (open) return;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    skipRunningMorph();
    if (panel && supportsPopover() && panel.matches(":popover-open")) panel.hidePopover();
    if (trigger) {
      trigger.style.visibility = "";
      trigger.style.removeProperty("anchor-name");
    }
  }, [open, triggerRef]);

  /**
   * The platform can close a popover without asking — light dismiss, and the close
   * watcher. §6: "every close path, the popover's `toggle` to closed included, calls
   * `skipTransition()` on a running morph."
   */
  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;

    const onToggle = (event: Event) => {
      if ((event as ToggleEvent).newState !== "closed") return;
      skipRunningMorph();
      onCloseRef.current();
    };

    panel.addEventListener("toggle", onToggle);
    return () => panel.removeEventListener("toggle", onToggle);
  }, [open]);

  /**
   * §6's last paragraph, and C-28. A width or orientation change closes the panel — its
   * anchor may have moved and §6 holds the placement choice until close. A height-only
   * change leaves it open and re-places it.
   */
  useEffect(() => {
    if (!open) return;

    const onResize = () => {
      const next = readViewport();
      const previous = viewportRef.current ?? next;
      viewportRef.current = next;
      const verdict = classifyViewportChange(previous, next);
      if (verdict === "close") onCloseRef.current();
      else if (verdict === "replace") place();
    };

    const onScroll = () => {
      // Only the positioner needs this: anchor positioning follows the anchor itself.
      if (!panelRef.current?.classList.contains("panel-anchored")) place();
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    window.addEventListener("scroll", onScroll, true);
    const offDock = subscribeDockChange(() => onCloseRef.current());

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.removeEventListener("scroll", onScroll, true);
      offDock();
    };
  }, [open, place]);

  useEscapeLayer({ open, kind: "popover", onClose });
  useOutsideDismiss({ open, refs: [panelRef, triggerRef], onDismiss: onClose });

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      // §6 makes this a popover — the top layer, light dismiss and Esc for free,
      // innermost-first — and the attribute is set on open, above.
      className={panelSurfaceClasses(className)}
    >
      {/* §6: "The container morphs; the contents fade." The name goes on this element,
          never on the panel — naming the contents as one with the material warps every
          glyph between a 34 pill and a 240×200 panel. */}
      <div ref={contentRef} className="contents">
        {children}
      </div>
    </div>
  );
}
