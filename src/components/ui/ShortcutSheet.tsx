"use client";

import { useId, useSyncExternalStore } from "react";

import { getDictionary } from "@/i18n";
import {
  closeShortcutSheet,
  getServerShortcutSheet,
  getShortcutSheet,
  subscribeShortcutSheet,
} from "@/lib/shortcut-sheet";
import { shortcutGroups } from "@/lib/shortcuts";

import { Button } from "./Button";
import { Kbd } from "./Kbd";
import { Modal } from "./Modal";
import { MENU_SECTION_CLASSES } from "./variants";

/**
 * Shortcut sheet (design-spec.md §8.38) — "the keyboard's own map, so no shortcut lives only
 * in the memory of whoever wrote it."
 *
 * A confirm-width modal (§8.21, max 400), title display-lg "Keyboard shortcuts", the
 * shortcuts in groups under mono-micro `--n-secondary` section titles — Anywhere · Lists ·
 * Panels · Chat · Drag — each row ui-body with its kbd hint (§8.15) at the trailing edge, rows
 * 36h and flush like a menu's, and a footer with one Neutral md "Close". Esc and Close close
 * it and return focus — the Modal's own §11 obligations — and it carries no mutation, so no
 * `data-writes`.
 *
 * Which rows it shows is `shortcutGroups` over the page's shape, read by whoever opened it
 * (`KeyboardLayer` for `?`, `AccountMenu` for the row) and kept in `shortcut-sheet.ts`, so the
 * render here is one read of a store. It reads its own dictionary copy, as every client
 * component does.
 */
export function ShortcutSheet() {
  const t = getDictionary();
  const baseId = useId();
  const { open, page } = useSyncExternalStore(
    subscribeShortcutSheet,
    getShortcutSheet,
    getServerShortcutSheet,
  );

  return (
    <Modal
      open={open}
      onClose={closeShortcutSheet}
      title={t.shortcuts.title}
      width="confirm"
      footer={
        <Button variant="neutral" size="md" onClick={closeShortcutSheet}>
          {t.common.close}
        </Button>
      }
    >
      {/* §4: stacked content inside an overlay gaps on the 8-grid. */}
      <div className="flex flex-col gap-[8px]">
        {shortcutGroups(page).map((group) => {
          const titleId = `${baseId}-${group.id}`;
          return (
            <section key={group.id} aria-labelledby={titleId}>
              <h3 id={titleId} className={MENU_SECTION_CLASSES}>
                {t.shortcuts.groups[group.id]}
              </h3>
              <ul>
                {group.rows.map((row) => (
                  // §8.38: rows 36h, flush like a menu's — §8.18's 12 of inline padding, no
                  // fill of their own. A key cap per chord, at the trailing edge.
                  <li
                    key={row.id}
                    className="flex h-[36px] items-center gap-[8px] px-[12px] type-ui-body text-n-primary"
                  >
                    <span className="min-w-0 flex-1 truncate">{t.shortcuts.rows[row.id]}</span>
                    <span className="flex shrink-0 items-center gap-[4px]">
                      {row.chords.map((chord) => (
                        <Kbd key={chord.join("+")} chord={chord} />
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Modal>
  );
}
