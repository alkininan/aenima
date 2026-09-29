import type { ItemRowData } from "@/app/app/ItemRow";
import type { StageCount } from "@/app/app/PipelineStrip";
import { getDictionary } from "@/i18n";

/**
 * The list-surface fixture, shared by both /dev previews.
 *
 * Two previews render it, and that is the point. `Composites` renders it from a
 * client root; `/dev/list` renders it from a Server Component, which is the
 * topology `/app` actually has. Only the second can catch a value that fails to
 * cross the server/client boundary — a function handed to a client component —
 * and it can only catch it if both are looking at the same rows.
 *
 * DELETE BEFORE LAUNCH, with everything else under /dev.
 */

/** A fixed clock, so the freshness readouts do not change between runs. */
export const LIST_NOW = Date.UTC(2026, 7, 23, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

export const LIST_T = getDictionary();

/**
 * One row per case §8.27's geometry has to survive: both accents, no accent, an idle row
 * with a gap (so its chip's dimming can be read), and three gaps on one row — one chip and
 * "+2" — and §10's two clocks: a scored row with a retry queued, a scored row without, and
 * rows nothing has scored yet, which keep last activity.
 *
 * The check ids are `/dev/item`'s run's — `prd-10`, `prd-8`, `prd-5` and `prd-14` are the
 * checks Ghost mode's run reports unclear — so a row's chip links to a line the fixture
 * item page actually draws (§8.27: the chip lands with the check list open and that check
 * in view).
 */
export const LIST_FIXTURE: ItemRowData[] = [
  {
    key: "soc-12",
    title: "Weekly digest email",
    type: "feature",
    stage: "design",
    bucket: "your_move",
    gaps: [
      { id: "g1", checkId: "prd-10", tag: "must" },
      { id: "g2", checkId: "prd-8", tag: "should" },
      { id: "g3", checkId: "prd-5", tag: "should" },
    ],
    lastActivityAt: LIST_NOW - 2 * DAY,
    // §10's own example, 6 h ago with a retry queued: the `--warning` dot, "6 h ago".
    scoredAt: LIST_NOW - 6 * 60 * 60 * 1000,
    retrying: true,
    idle: false,
  },
  {
    key: "soc-4",
    title: "Rewrite the empty states",
    type: "content",
    stage: "define",
    bucket: "at_risk",
    gaps: [{ id: "g4", checkId: "prd-14", tag: "must" }],
    lastActivityAt: LIST_NOW - 9 * DAY,
    scoredAt: LIST_NOW - 2 * DAY,
    retrying: false,
    idle: false,
  },
  {
    key: "aur-1",
    title: "Shared reading lists",
    type: "feature",
    stage: "define",
    bucket: "flowing",
    gaps: [],
    lastActivityAt: LIST_NOW - 3 * 60 * 60 * 1000,
    scoredAt: null,
    retrying: false,
    idle: false,
  },
  // The idle row: its name in --n-secondary, its dot, its chip's fill and its accent at
  // .60, and Park where the readout stands (§8.27, §2). An open Should does not move a
  // Flowing item, so the row keeps its bucket.
  {
    key: "soc-7",
    title: "Can we diff Figma frames by node id?",
    type: "spike",
    stage: "discover",
    bucket: "flowing",
    gaps: [{ id: "g5", checkId: "prd-5", tag: "should" }],
    lastActivityAt: LIST_NOW - 40 * DAY,
    scoredAt: null,
    retrying: false,
    idle: true,
  },
];

/**
 * `/dev/list?box=` — the width the list's wrapper is held at, so a container query can be
 * told apart from a viewport query: at 1440 wide with the box held at 759 the rows are two
 * lines, and only a rule that reads the list's own box says so (§8.27, C-12). Capped: a
 * fixture control, never a layout.
 */
export const DEV_BOX_PARAM = "box";

const BOX_CAP_PX = 2000;

export function heldBox(raw: string | string[] | undefined): number | null {
  const px = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(px) || px <= 0) return null;
  return Math.min(Math.floor(px), BOX_CAP_PX);
}

/** The strip's counts for the fixture above. */
export const LIST_COUNTS: StageCount[] = [
  { stage: "discover", count: 2 },
  { stage: "define", count: 3 },
  { stage: "design", count: 1 },
];
