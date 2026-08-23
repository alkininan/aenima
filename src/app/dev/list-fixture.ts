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
 * One row per case the §8 geometry has to survive: both accents, no accent, an
 * idle row, and more gap chips than the two that fit.
 */
export const LIST_FIXTURE: ItemRowData[] = [
  {
    key: "soc-12",
    title: "Weekly digest email",
    type: "feature",
    stage: "design",
    bucket: "your_move",
    gaps: [
      { id: "g1", checkId: "MN-2", tag: "must" },
      { id: "g2", checkId: "MN-7", tag: "should" },
      { id: "g3", checkId: "MN-9", tag: "should" },
    ],
    lastActivityAt: LIST_NOW - 2 * DAY,
    idle: false,
  },
  {
    key: "soc-4",
    title: "Rewrite the empty states",
    type: "content",
    stage: "define",
    bucket: "at_risk",
    gaps: [{ id: "g4", checkId: "CN-1", tag: "must" }],
    lastActivityAt: LIST_NOW - 9 * DAY,
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
    idle: false,
  },
  {
    key: "soc-7",
    title: "Can we diff Figma frames by node id?",
    type: "spike",
    stage: "discover",
    bucket: "flowing",
    gaps: [],
    lastActivityAt: LIST_NOW - 40 * DAY,
    idle: true,
  },
];

/** The strip's counts for the fixture above. */
export const LIST_COUNTS: StageCount[] = [
  { stage: "discover", count: 2 },
  { stage: "define", count: 3 },
  { stage: "design", count: 1 },
];
