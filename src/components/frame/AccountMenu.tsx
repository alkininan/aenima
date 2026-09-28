"use client";

import { Avatar } from "@/components/ui/Avatar";
import { Menu } from "@/components/ui/Menu";
import { SignOutIcon } from "@/components/ui/icons";
import { SIDEBAR_ROW_CLASSES } from "@/components/ui/variants";
import { getDictionary } from "@/i18n";
import { cx } from "@/lib/cx";

import { usePromise } from "./usePromise";
import { useSignOut } from "./useSignOut";

/**
 * §4's account slot — "pinned to the bottom: avatar 32 + the signed-in address in ui-body,
 * truncating; it is a menu trigger (§8.18) whose rows are 'Keyboard shortcuts' … and 'Sign
 * out' (`log-out`)". The shortcut row opens §8.38's sheet, which is C-43's and the keyboard
 * layer's; a row that opens nothing is not built, so the menu carries Sign out alone.
 *
 * "Identity is something you check and change, not something you navigate between, and the
 * top-left position belongs to the things that move you around."
 *
 * The address arrives with the session read (§4 chrome before data): the row is drawn at
 * once with no address and no skeleton, its menu already open to a press, and the address
 * fills in when the read resolves (`usePromise`).
 */
export function AccountMenu({ address: read }: { address: Promise<string> }) {
  const t = getDictionary();
  const { form, signOut } = useSignOut();
  const address = usePromise(read, "");

  return (
    <>
      <Menu
        label={t.chrome.account}
        className="w-full"
        trigger={
          <button
            type="button"
            data-testid="frame-account"
            className={cx(
              SIDEBAR_ROW_CLASSES,
              "control control-edge-none gap-[8px] rounded-pill px-[8px] text-left",
            )}
          >
            {/* §8: 32 is the avatar's row size. Initials until there is a portrait. */}
            <Avatar size={32} {...(address ? { name: address } : {})} />
            <span className="type-ui-body min-w-0 flex-1 truncate text-n-secondary">{address}</span>
          </button>
        }
        entries={[
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
        ]}
      />
      {form}
    </>
  );
}
