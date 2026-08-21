import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import {
  avatarClasses,
  avatarInitialsClasses,
  avatarStatusClasses,
  type AvatarSize,
  type AvatarStatus,
} from "./variants";

type AvatarProps = {
  /** §8: 24 · 32 · 40 · 44 · 48 · 56 · 64 · 80 · 96 · 112 (row 32, switcher 40, profile 96). */
  size?: AvatarSize;
  /** Falls back to initials when there is no portrait. */
  name?: string;
  status?: AvatarStatus;
  /**
   * §13 keeps meaning off colour alone, so a status dot needs words somewhere;
   * this is the screen-reader half of the pair.
   */
  statusLabel?: string;
  /** A caller-supplied portrait element. Keeps image config out of the primitive. */
  children?: ReactNode;
  className?: string;
};

/** First letters of the first two words — "Alkın İnan" → "Aİ". */
function initialsFrom(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.slice(0, 1).toLocaleUpperCase())
    .join("");
}

/**
 * Avatar (design-spec.md §8) — circular, the fixed size scale, optional status
 * dot bottom-right in `--success` (present) or `--warning` (away), the same dot
 * language as freshness.
 *
 * The portrait is passed in rather than fetched here: an `<img>` and a
 * `next/image` have different configuration needs, and a primitive should not
 * decide that for every screen that uses it.
 */
export function Avatar({ size = 32, name, status, statusLabel, children, className }: AvatarProps) {
  const initials = name ? initialsFrom(name) : "";

  return (
    <span className={cx("relative inline-flex shrink-0", className)}>
      <span className={avatarClasses(size)}>
        {children ??
          (initials ? <span className={avatarInitialsClasses(size)}>{initials}</span> : null)}
      </span>
      {status ? (
        <>
          <span className={avatarStatusClasses(status)} />
          {statusLabel ? (
            <span className="absolute size-[1px] overflow-hidden [clip:rect(0,0,0,0)]">
              {statusLabel}
            </span>
          ) : null}
        </>
      ) : null}
    </span>
  );
}
