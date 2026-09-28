import { GUTTER_CLASSES } from "@/components/ui/variants";
import { cx } from "@/lib/cx";

/**
 * §4: "item page = content 1fr / chat 380 while the dock is docked", and the dock docks
 * from 1280 — "660 holds the item page and the two-line row (§8.27), 404 holds nothing, so
 * the dock docks at 1280 and floats below it". The column is reserved from `xl` (1280)
 * before the dock exists, so building it fills a column rather than reflowing the page;
 * desk keeps none, since the dock is an overlay there. The gutters are the mode's.
 */
export const ITEM_GRID_CLASSES = cx(
  GUTTER_CLASSES,
  "grid grid-cols-1 gap-[24px] py-[32px] xl:grid-cols-[1fr_380px]",
);

/** The reserved column itself, empty until the dock (T3.2's *Build the dock surface*). */
export const CHAT_COLUMN_CLASSES = "hidden xl:block";
