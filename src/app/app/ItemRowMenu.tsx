"use client";

import { useRouter } from "next/navigation";

import { IconButton } from "@/components/ui/IconButton";
import { Menu } from "@/components/ui/Menu";
import { OverflowIcon } from "@/components/ui/icons";
import { getDictionary } from "@/i18n";
import { itemHref } from "@/lib/routes";

import { ROW_CONTROL_ATTRIBUTE } from "./row-link";

/**
 * §8.27's item-row overflow menu.
 *
 * The one client island in the row, and the reason is real interactivity rather
 * than convenience: a menu is focus management, arrow-key movement and
 * outside-dismiss, all of which need the browser. Everything else in the row is
 * a Server Component.
 *
 * What it offers is deliberately thin. §13's real row actions — park, push
 * gaps, log a decision — are mutations that do not exist yet, and a menu full of
 * disabled rows would be worse than a short one. Open and copy-key both work
 * today, which is the whole test of whether an entry belongs here.
 *
 * **Its trigger is one of the row's controls** (§11): reached with Right from the name,
 * never by Tab — `tabindex="-1"`, and the walker's mark. Open, the menu keeps its own
 * keys; closed, Up and Down from the trigger walk the rows like any other control.
 *
 * **It reads its own copy rather than being handed a dictionary.** The
 * dictionary carries formatter functions, and a function cannot cross the
 * server/client boundary — React has no way to serialize one, so passing `t`
 * from a Server Component throws at request time. A client component imports
 * `getDictionary` the way `SignInForm` does; anything it needs *interpolated*
 * arrives as an already-formatted string, like `label` below.
 */
export function ItemRowMenu({ itemKey, label }: { itemKey: string; label: string }) {
  const t = getDictionary();
  const router = useRouter();

  return (
    <Menu
      // Names the menu itself, not just its trigger — a row of identical
      // overflow buttons is otherwise indistinguishable in the a11y tree.
      label={label}
      trigger={
        <IconButton
          variant="ghost"
          size="sm"
          label={label}
          icon={<OverflowIcon />}
          tabIndex={-1}
          {...{ [ROW_CONTROL_ATTRIBUTE]: "" }}
          // The row is a link with a stretched hit area; the menu sits one above
          // §4's content rung so its own clicks land here rather than navigating.
          className="relative z-[calc(var(--z-content)+1)] shrink-0"
        />
      }
      entries={[
        { kind: "item", label: t.list.openItem, onSelect: () => router.push(itemHref(itemKey)) },
        {
          kind: "item",
          label: t.list.copyKey,
          // `writeText` rejects without a permission or a secure context, and a
          // failed copy is not worth an error surface on a list row — the key is
          // in the URL either way.
          onSelect: () => void navigator.clipboard?.writeText(itemKey).catch(() => {}),
        },
      ]}
    />
  );
}
