import type { Dictionary } from "./en";

/**
 * Turkish — the shortcut sheet and the two strings around it, the first TR copy in the
 * product (T0.45's Decision: the sheet's rows "translated into TR and NL"). Every other key
 * resolves to English in `index.ts` until the dictionary is written whole; the type here is
 * what the merge accepts, so a key added to `shortcuts` in `en.ts` is a type error here until
 * it is translated.
 *
 * §12: aenima's TR register is *sen* — the imperatives are the bare second person.
 */
export const tr: Pick<Dictionary, "shortcuts"> & {
  common: Pick<Dictionary["common"], "close" | "skipToContent">;
} = {
  common: {
    close: "Kapat",
    skipToContent: "İçeriğe atla",
  },
  shortcuts: {
    title: "Klavye kısayolları",
    groups: {
      anywhere: "Her yerde",
      lists: "Listeler",
      panels: "Paneller",
      chat: "Sohbet",
      drag: "Sürükleme",
    },
    rows: {
      showSheet: "Klavye kısayollarını göster",
      closeLast: "Son açılanı kapat",
      undo: "Geri al",
      betweenRows: "Satırlar arasında geç",
      withinRow: "Satır içinde geç",
      openItem: "Öğeyi aç",
      jump: "İlke ya da sonuncuya atla",
      betweenOptions: "Seçenekler arasında geç",
      choose: "Seç",
    },
  },
};
