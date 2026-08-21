import type { ReactNode } from "react";

import { EMPTY_STATE_ICON_CLASSES, EMPTY_STATE_TEXT_CLASSES, emptyStateClasses } from "./variants";

type EmptyStateProps = {
  /** §8: icon 24, --n-secondary. */
  icon?: ReactNode;
  /** §8: one ui-body line. §12: "Nothing needs you right now," not "No data." */
  children: ReactNode;
  /** §8: one action. */
  action?: ReactNode;
  /** §0 law 9 rations the dot grid; §8 allows it here. */
  textured?: boolean;
  className?: string;
};

/**
 * Empty state (design-spec.md §8) — icon 24 in `--n-secondary`, one ui-body
 * line, one action, and the dot-grid texture if the surface is decorative.
 *
 * One line and one action is the whole component on purpose: §8 says an empty
 * state is a single sentence and a single next step, never a panel of advice.
 */
export function EmptyState({
  icon,
  children,
  action,
  textured = false,
  className,
}: EmptyStateProps) {
  return (
    <div className={emptyStateClasses(textured, className)}>
      {icon ? <span className={EMPTY_STATE_ICON_CLASSES}>{icon}</span> : null}
      <p className={EMPTY_STATE_TEXT_CLASSES}>{children}</p>
      {action}
    </div>
  );
}
