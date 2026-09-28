"use client";

import { useRouter } from "next/navigation";

import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/IconButton";
import { Menu, type MenuEntry } from "@/components/ui/Menu";
import { MenuIcon, SignOutIcon } from "@/components/ui/icons";
import { getDictionary } from "@/i18n";
import { NAV } from "@/lib/routes";

import { NAV_ICONS } from "./nav-icons";
import { useSignOut } from "./useSignOut";

/**
 * §4's hand top bar, at the right: "a **menu IconButton** (`menu`), Neutral 34, morphing
 * (§6) into the nav menu — Dashboard, Triage, Graveyard, Settings, a separator, the account
 * row — static, not a `menuitem`, standing where a section title would (avatar 24, address
 * truncating) — then … Sign out beneath it. One mechanism, no bottom tab bar."
 *
 * The "Keyboard shortcuts" row waits for §8.38's sheet (C-43). The `chat-bubble` beside this
 * button is the dock's. An unbuilt row is a disabled `menuitem`, named for a screen reader as
 * the sidebar names its dimmed rows.
 */
export function TopBarMenu({ address, dashboardHref }: { address: string; dashboardHref: string }) {
  const t = getDictionary();
  const router = useRouter();
  const { form, signOut } = useSignOut();

  const entries: MenuEntry[] = [
    ...NAV.map((entry): MenuEntry => {
      const Icon = NAV_ICONS[entry.label];
      const built = entry.built && entry.href !== null;
      const href = entry.label === "dashboard" ? dashboardHref : entry.href;
      return {
        kind: "item",
        label: (
          <span className="flex items-center gap-[8px]">
            <Icon className="size-[20px] shrink-0" />
            {t.nav[entry.label]}
            {built ? null : <span className="sr-only"> — {t.nav.notYet}</span>}
          </span>
        ),
        onSelect: () => {
          if (href !== null) router.push(href);
        },
        disabled: !built,
      };
    }),
    { kind: "separator" },
    {
      kind: "section",
      label: (
        <>
          <Avatar size={24} {...(address ? { name: address } : {})} />
          <span data-testid="frame-account" className="min-w-0 flex-1 truncate">
            {address}
          </span>
        </>
      ),
    },
    {
      kind: "item",
      label: (
        <span className="flex items-center gap-[8px]">
          <SignOutIcon className="size-[20px] shrink-0" />
          {t.common.signOut}
        </span>
      ),
      onSelect: signOut,
    },
  ];

  return (
    <>
      <Menu
        label={t.chrome.menu}
        entries={entries}
        trigger={
          <IconButton
            variant="neutral"
            size="md"
            label={t.chrome.menu}
            icon={<MenuIcon />}
            data-testid="frame-menu"
          />
        }
      />
      {form}
    </>
  );
}
