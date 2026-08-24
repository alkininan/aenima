import type { ReactNode } from "react";

/**
 * One titled block on the item page.
 *
 * §3 makes mono-micro the eyebrow — "use it wherever a tiny section label
 * appears" — and these are the same kind of label as §13's bucket headers, so
 * they take the same treatment. The heading is a real `<h2>` bound to its
 * section, because a page of five unlabelled regions is a page nobody can
 * navigate with a screen reader.
 */
export function ItemSection({ title, children }: { title: string; children: ReactNode }) {
  const id = `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <section aria-labelledby={id} className="flex flex-col gap-[12px]">
      <h2 id={id} className="type-mono-micro text-n-secondary">
        {title}
      </h2>
      {children}
    </section>
  );
}
