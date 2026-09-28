import type { Dictionary } from "./en";

/**
 * Dutch — the shortcut sheet and the two strings around it, the first NL copy in the product
 * (T0.45's Decision: the sheet's rows "translated into TR and NL"). Every other key resolves
 * to English in `index.ts` until the dictionary is written whole; the type here is what the
 * merge accepts, so a key added to `shortcuts` in `en.ts` is a type error here until it is
 * translated.
 */
export const nl: Pick<Dictionary, "shortcuts"> & {
  common: Pick<Dictionary["common"], "close" | "skipToContent">;
} = {
  common: {
    close: "Sluiten",
    skipToContent: "Naar de inhoud",
  },
  shortcuts: {
    title: "Sneltoetsen",
    groups: {
      anywhere: "Overal",
      lists: "Lijsten",
      panels: "Panelen",
      chat: "Chat",
      drag: "Slepen",
    },
    rows: {
      showSheet: "Sneltoetsen tonen",
      closeLast: "Het laatst geopende sluiten",
      undo: "Ongedaan maken",
      betweenRows: "Tussen rijen bewegen",
      withinRow: "Binnen een rij bewegen",
      openItem: "Het item openen",
      jump: "Naar de eerste of laatste springen",
      betweenOptions: "Tussen opties bewegen",
      choose: "Kiezen",
    },
  },
};
