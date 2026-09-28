"use client";

import { useRef, type ReactNode } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Kbd } from "@/components/ui/Kbd";
import { Menu, type MenuEntry } from "@/components/ui/Menu";
import { KeyCommandIcon, SignOutIcon } from "@/components/ui/icons";
import { useKeyboardOffered } from "@/components/ui/useKeyboardOffered";
import { getDictionary } from "@/i18n";
import { openShortcutSheet } from "@/lib/shortcut-sheet";
import { readPage } from "@/lib/shortcuts";

/** §8.18: a 20 icon leading, the label, and an optional kbd hint trailing. */
function MenuRow({
  icon,
  hint,
  children,
}: {
  icon: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <span className="shrink-0 text-n-secondary [&_svg]:size-[20px]">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint}
    </>
  );
}

/**
 * §4's account slot: "avatar 32 + the signed-in address in ui-body, truncating; it is a menu
 * trigger (§8.18) whose rows are 'Keyboard shortcuts' (`key-command`, §8.38 — always on
 * pointer devices, and on touch once the modality script has recorded keyboard input, §8.15)
 * and 'Sign out' (`log-out`). Sign out is a plain row and takes no confirm."
 *
 * A client island, as the switcher is, because a menu is focus management. Sign-out stays
 * the POST it was — a GET would let any image tag sign a person out — through a form the row
 * submits; the form itself is hidden, since the row is its only trigger. The menu is named by
 * the account it is for, which is the trigger's own text.
 *
 * It reads its own copy rather than being handed a dictionary — see `ItemRowMenu` for why.
 */
export function AccountMenu({ email }: { email: string }) {
  const t = getDictionary();
  const offered = useKeyboardOffered();
  const formRef = useRef<HTMLFormElement | null>(null);

  const entries: readonly MenuEntry[] = [
    ...(offered
      ? [
          {
            kind: "item" as const,
            label: (
              <MenuRow icon={<KeyCommandIcon />} hint={<Kbd chord={["?"]} />}>
                {t.shortcuts.title}
              </MenuRow>
            ),
            onSelect: () => openShortcutSheet(readPage(document)),
          },
        ]
      : []),
    {
      kind: "item" as const,
      label: <MenuRow icon={<SignOutIcon />}>{t.common.signOut}</MenuRow>,
      onSelect: () => formRef.current?.requestSubmit(),
    },
  ];

  return (
    <>
      <Menu
        label={email}
        entries={entries}
        trigger={
          <button
            type="button"
            className="control control-edge-none flex w-full items-center gap-[8px] rounded-pill p-[4px] text-left"
          >
            {/* §8: 32 is the avatar's row size. Initials until there is a portrait — and
                decorative beside the address, so the trigger is named by the address alone. */}
            <span aria-hidden="true" className="inline-flex shrink-0">
              <Avatar size={32} name={email} />
            </span>
            <span className="type-ui-body min-w-0 flex-1 truncate text-n-secondary">{email}</span>
          </button>
        }
      />
      <form ref={formRef} action="/auth/sign-out" method="post" hidden />
    </>
  );
}
