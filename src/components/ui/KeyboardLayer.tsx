"use client";

import { useEffect } from "react";

import { hasLayerOfKind } from "@/lib/layer-stack";
import { openShortcutSheet } from "@/lib/shortcut-sheet";
import { globalShortcut, readPage } from "@/lib/shortcuts";
import { isTextField } from "@/lib/text-field";

import { ShortcutSheet } from "./ShortcutSheet";

/**
 * design-spec.md §11 — the global shortcuts that belong to no component, and the sheet.
 *
 * "Global shortcuts work regardless of what has focus" — so the listener is the document's,
 * and `globalShortcut` holds the two exceptions §11 makes: the unmodified keys are typing
 * inside a text field, and while a modal or sheet is open only Esc and the layer's own keys
 * act. `?` opens the shortcut sheet (§8.38); `/` focuses search in list views, which is the
 * page's `input[type="search"]` where one exists and nothing where none does — the key is
 * left to the browser then, so it never swallows a find-as-you-type.
 *
 * `Cmd/Ctrl+Z` is the toast's own (§8.20, `Toast.tsx`), since only a showing undo can take
 * it. `Cmd/Ctrl+K` opens the dock, which is not built (T0.45's Decision).
 *
 * Mounted once in the root layout, so every route — the sink included — has the keys and
 * the sheet, and a route change never re-attaches them.
 */
export function KeyboardLayer() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;

      const action = globalShortcut({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        inTextField: isTextField(document.activeElement),
        modalOpen: hasLayerOfKind("modal"),
      });
      if (action === null) return;

      if (action === "sheet") {
        event.preventDefault();
        openShortcutSheet(readPage(document));
        return;
      }

      const search = document.querySelector<HTMLElement>('input[type="search"]');
      if (!search) return;
      // Taken before the keypress, so the slash does not land in the field it just focused.
      event.preventDefault();
      search.focus();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return <ShortcutSheet />;
}
