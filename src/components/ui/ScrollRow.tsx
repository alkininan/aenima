"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import { revealActive } from "@/lib/scroll-row";

/**
 * A `<nav>` that scrolls sideways rather than wrapping, with its `[aria-current]` element
 * brought into view on mount — §4's 768 line for the pipeline strip (§8.26: "Below 768 the
 * strip scrolls horizontally with the active segment in view, the same rule as tabs").
 *
 * A client island only for the scroll: the strip's segments stay Server Components (links
 * that write `?stage=`), and this wraps them. It scrolls the row alone, never the page.
 */
export function ScrollRow({
  label,
  className,
  style,
  children,
}: {
  label: string;
  className: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (ref.current) revealActive(ref.current, "[aria-current]");
  });

  return (
    <nav ref={ref} aria-label={label} className={className} style={style}>
      {children}
    </nav>
  );
}
