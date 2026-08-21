"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "./Button";
import {
  TOAST_ACTION_CLASSES,
  TOAST_DISMISS_MS,
  TOAST_UNDO_DISMISS_MS,
  TOAST_VIEWPORT_CLASSES,
  toastClasses,
  toastDotClasses,
  type ToastTone,
} from "./variants";

export type ToastOptions = {
  message: ReactNode;
  /**
   * §8: `--success` or `--warning` only. There is deliberately no danger tone —
   * "never a red toast — errors surface inline".
   */
  tone?: ToastTone;
  /** §8: optional undo. */
  action?: { label: string; onAction: () => void };
  /**
   * Defaults to §8's 5s, or §12's 8s when an undo is attached. Overridable for
   * the rare longer-lived notice.
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
 * Toast host (design-spec.md §8) — bottom-center, glass recipe at radius 12,
 * leading `--success` / `--warning` dot, optional `--prime` undo, z 500.
 *
 * The clock runs 5s (§8), or 8s when the toast carries an undo (§12) — an
 * action has to be noticed and reached for, not just read. Hover pauses it.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastRecord[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    nextId.current += 1;
    const id = `toast-${nextId.current}`;
    setToasts((current) => [
      ...current,
      {
        id,
        message: options.message,
        tone: options.tone ?? "success",
        action: options.action,
        duration: options.duration ?? (options.action ? TOAST_UNDO_DISMISS_MS : TOAST_DISMISS_MS),
      },
    ]);
    return id;
  }, []);

  const api = useMemo<ToastApi>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* §12 keeps the label calm; real copy arrives with i18n. */}
      <div className={TOAST_VIEWPORT_CLASSES} role="region" aria-label="Notifications">
        {toasts.map((item) => (
          <ToastItem key={item.id} toast={item} dismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside a ToastProvider");
  return api;
}

function ToastItem({ toast, dismiss }: { toast: ToastRecord; dismiss: (id: string) => void }) {
  const { id, duration } = toast;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remaining = useRef(duration);
  const startedAt = useRef(0);

  // Stable, because `dismiss` and the id both are — so the clock below is
  // started once per toast rather than restarted on every render.
  const close = useCallback(() => dismiss(id), [dismiss, id]);

  const resume = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    startedAt.current = Date.now();
    timer.current = setTimeout(close, remaining.current);
  }, [close]);

  // §8: hover pauses. Focus pauses too, or a keyboard user could never reach an
  // undo that disappears in five seconds.
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

  return (
    <div
      role="status"
      className={toastClasses()}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <span className={toastDotClasses(toast.tone)} aria-hidden="true" />
      <span className="min-w-0">{toast.message}</span>
      {toast.action ? (
        <Button
          size="sm"
          variant="ghost"
          className={TOAST_ACTION_CLASSES}
          onClick={() => {
            toast.action?.onAction();
            close();
          }}
        >
          {toast.action.label}
        </Button>
      ) : null}
    </div>
  );
}
