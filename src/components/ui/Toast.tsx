"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";

import { TOAST_DISMISS_MS, TOAST_UNDO_DISMISS_MS } from "@/lib/motion";
import { getOverlayHost, subscribeOverlayHost } from "@/lib/overlay-host";
import { isTextField } from "@/lib/text-field";

import { Button } from "./Button";
import { useExitTransition } from "./useExit";
import {
  TOAST_ACTION_CLASSES,
  TOAST_VIEWPORT_CLASSES,
  toastClasses,
  toastDotClasses,
  type ToastTone,
} from "./variants";

export type ToastOptions = {
  message: ReactNode;
  /**
   * §8.20: `--success` or `--warning` only. There is deliberately no danger tone —
   * "never a red toast — errors surface inline".
   */
  tone?: ToastTone;
  /** §8.20: optional undo. */
  action?: { label: string; onAction: () => void };
  /**
   * Defaults to §8.20's 5s, or 8s when an undo is attached. Overridable for the
   * rare longer-lived notice.
   */
  duration?: number;
};

type ToastRecord = {
  id: string;
  message: ReactNode;
  tone: ToastTone;
  action: { label: string; onAction: () => void } | undefined;
  duration: number;
};

type ToastApi = {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Toast host (design-spec.md §8.20) — bottom-centre 24 above the viewport's edge, the
 * glass recipe at `--r-panel` on `--shadow-float`, leading `--success` / `--warning` dot,
 * optional Neutral sm action, max-width 400, z 500.
 *
 * The clock runs 5s, or 8s when the toast carries an undo — an action has to be noticed
 * and reached for, not just read. Hover or focus pauses either.
 *
 * **One toast at a time, and the newest wins** (v2.21). §8.20 gives the reason and it is
 * about what an Undo would come to mean: "an undo toast is a shortcut to a reversal that
 * also stands on the page … so replacing it loses only the shortcut, whereas queuing it
 * would leave an Undo on screen that means an earlier move than the one just made." A
 * failure replacing its own move's undo is the same rule arriving from the other side, so
 * "a failure dismisses its own move's undo at once" needs no second mechanism: the
 * failure toast *is* the dismissal, and with it the shortcut goes.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [showing, setShowing] = useState<ToastRecord | null>(null);
  const nextId = useRef(0);

  const dismiss = useCallback((id: string) => {
    setShowing((current) => (current?.id === id ? null : current));
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    nextId.current += 1;
    const id = `toast-${nextId.current}`;
    setShowing({
      id,
      message: options.message,
      tone: options.tone ?? "success",
      action: options.action,
      duration: options.duration ?? (options.action ? TOAST_UNDO_DISMISS_MS : TOAST_DISMISS_MS),
    });
    return id;
  }, []);

  const api = useMemo<ToastApi>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toast={showing} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside a ToastProvider");
  return api;
}

/** Whether this engine puts a popover in the top layer. */
function supportsPopover(): boolean {
  return typeof HTMLElement !== "undefined" && "popover" in HTMLElement.prototype;
}

/**
 * §8.20: "its host is the `popover="manual"` of §4's ladder, moved into the open modal's
 * subtree so it stays operable."
 *
 * Manual rather than auto: a toast is not dismissed by a click elsewhere and must not take
 * Esc from the layer beneath it — §11 gives Esc to the topmost *dismissable* layer, and a
 * toast is not one. The move into the modal is what C-20's "clickable over an open modal"
 * asks for: the rest of the page is inert while a modal is open, so a toast outside the
 * modal would paint above it and refuse the click.
 */
function ToastViewport({
  toast,
  dismiss,
}: {
  toast: ToastRecord | null;
  dismiss: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const host = useSyncExternalStore(subscribeOverlayHost, getOverlayHost, () => null);

  /**
   * The attribute is set here rather than in the JSX, and that is not a style choice: the
   * server has no `HTMLElement` to ask, so a capability read during render answers one
   * thing on the server and another on the client, and React reports the mismatch and
   * leaves the attribute unpatched. Setting it after mount asks the engine that will
   * actually honour it.
   */
  useEffect(() => {
    const node = ref.current;
    if (!node || !supportsPopover()) return;
    node.setAttribute("popover", "manual");
    // The host is shown once and stays: it is the region, not the toast.
    if (!node.matches(":popover-open")) node.showPopover();
  }, [host]);

  const viewport = (
    <div ref={ref} className={TOAST_VIEWPORT_CLASSES} role="region" aria-label="Notifications">
      <ToastSlot toast={toast} dismiss={dismiss} />
    </div>
  );

  return host ? createPortal(viewport, host) : viewport;
}

/**
 * Holds the last toast on the page while its exit runs (§6, C-48): a toast enters over
 * `--t-med` and leaves over `--t-fast`, and React would otherwise unmount it on the frame
 * it was dismissed. Keyed on the toast's id, so a replacement is a fresh entrance rather
 * than the old one mutating into it — which is what "the newest replaces the one showing"
 * looks like when it is watched.
 */
function ToastSlot({
  toast,
  dismiss,
}: {
  toast: ToastRecord | null;
  dismiss: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { present, leaving } = useExitTransition({ open: toast !== null, ref });
  // The last toast shown, kept so the exit has something to render. State rather than a
  // ref: it is read during render, and adjusting state during render is the shape React
  // sanctions for deriving one value from another that just changed.
  const [shown, setShown] = useState<ToastRecord | null>(toast);
  if (toast && toast !== shown) setShown(toast);

  const record = toast ?? shown;
  if (!present || !record) return null;

  return (
    <ToastItem
      key={record.id}
      ref={ref}
      toast={record}
      dismiss={dismiss}
      leaving={leaving || toast === null}
    />
  );
}

function ToastItem({
  ref,
  toast,
  dismiss,
  leaving,
}: {
  ref: Ref<HTMLDivElement>;
  toast: ToastRecord;
  dismiss: (id: string) => void;
  leaving: boolean;
}) {
  const { id, duration } = toast;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remaining = useRef(duration);
  const startedAt = useRef(0);

  // Stable, because `dismiss` and the id both are — so the clock below is started once
  // per toast rather than restarted on every render.
  const close = useCallback(() => dismiss(id), [dismiss, id]);

  const resume = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    startedAt.current = Date.now();
    timer.current = setTimeout(close, remaining.current);
  }, [close]);

  // §8.20: hover pauses. Focus pauses too, or a keyboard user could never reach an undo
  // that disappears in five seconds.
  const pause = useCallback(() => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
    remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
  }, []);

  useEffect(() => {
    resume();
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [resume]);

  // One reversal, however it is asked for: a toast on its way out still takes a press for
  // the length of its exit, so the undo goes quiet the moment it has run, and while the
  // toast is leaving for any other reason.
  const action = toast.action;
  const fired = useRef(false);
  const fire = useCallback(() => {
    if (fired.current || leaving) return;
    fired.current = true;
    action?.onAction();
    close();
  }, [action, close, leaving]);

  /**
   * §8.20: "While an undo shows, `Cmd/Ctrl+Z` triggers it when focus is not in a text
   * field." §11 says the same of every global shortcut: they work regardless of focus and
   * go quiet in a text field, where the platform's own undo is what the keystroke means.
   */
  useEffect(() => {
    if (!action || leaving) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "z" || event.shiftKey || event.altKey) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      if (isTextField(document.activeElement)) return;
      event.preventDefault();
      fire();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [action, fire, leaving]);

  return (
    <div
      ref={ref}
      role="status"
      data-leaving={leaving ? "" : undefined}
      className={toastClasses()}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <span className={toastDotClasses(toast.tone)} aria-hidden="true" />
      <span className="min-w-0">{toast.message}</span>
      {action ? (
        // §8.20 (v2.21): "a Neutral sm button … Neutral, not Soft, because an aqua label
        // on `--prime-soft` falls under AA on glass with a bright fill beneath it (§13)".
        <Button size="sm" variant="neutral" className={TOAST_ACTION_CLASSES} onClick={fire}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
