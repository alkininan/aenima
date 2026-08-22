import type { Database } from "@/db/database.types";

/**
 * Derived stage — product-spec.md §3, and the executable form of CLAUDE.md's
 * first law: "Status is **derived** from which artifacts exist and what they
 * score. There is no settable status field anywhere in the schema or the UI."
 *
 * This is the only place in the system where a stage exists. Nothing in
 * `information_schema` names one, no view computes one, no row stores one — a
 * test asserts that no column is called `status`, `stage` or `state`, and this
 * function is why that test can keep passing.
 *
 * It lives in TypeScript rather than SQL for three reasons. Phase 2 feeds it
 * readiness scores that live in the app layer. It has to be unit-testable
 * without a database, which is what lets every branch below be covered cheaply.
 * And a SQL derivation would mean a view column named `stage` — the first-law
 * test would catch it, which is the test telling us where derivation belongs.
 *
 * The cost, paid deliberately: deriving here means the list surface must fetch
 * every item's artifacts to sort by stage. That is why `src/db/queries/item.ts`
 * fetches artifacts and versions in the same round trip as the items, and why
 * an N+1 there would be a real problem rather than an inefficiency.
 */

type ArtifactKind = Database["public"]["Enums"]["artifact_kind"];

/** §3, in order. `handed_over` is terminal — it archives out of active views. */
export const STAGES = ["discover", "define", "design", "handed_over"] as const;

export type Stage = (typeof STAGES)[number];

/**
 * One artifact's identity plus how much content it actually carries.
 *
 * `versionCount` matters because `artifact` rows are identity only — creating
 * one is not authoring anything. §3 keys each stage on an artifact existing as
 * *content*, so an artifact with no versions advances nothing.
 */
export type ArtifactPresence = {
  kind: ArtifactKind;
  versionCount: number;
};

export type StageInput = {
  artifacts: readonly ArtifactPresence[];
  /**
   * §8's signed packet, which flips an item to Handed over.
   *
   * There is no packet table yet, so nothing can observe a signature and no
   * caller can construct this field. `never` says exactly that in the type
   * system. A `boolean` would say something different and false — "observable,
   * currently false" — and would invite a caller to pass `false` as though that
   * were a real answer about a ceremony that cannot yet happen.
   *
   * The branch below is therefore unreachable today, on purpose. It is written
   * out rather than omitted so that §3's terminal state is visible here, and so
   * that adding the packet table is a change to this field's type rather than a
   * new rule someone has to remember to write.
   */
  signedPacket?: never;
};

/** True when the item carries that artifact with at least one authored version. */
function hasContent(artifacts: readonly ArtifactPresence[], kind: ArtifactKind): boolean {
  return artifacts.some((artifact) => artifact.kind === kind && artifact.versionCount > 0);
}

/**
 * The stage an item is in, from what it owns. Ordered most-advanced first: a
 * later stage's evidence outranks an earlier one's, so an item with both a PRD
 * and a design package is in Design.
 */
export function deriveStage(input: StageInput): Stage {
  // §3: "packet signed → Handed over, a terminal state". Unreachable until the
  // packet table exists; `signedPacket` is `never`, so TypeScript knows.
  if (input.signedPacket !== undefined) return "handed_over";

  // §3: "frames linked and mapped → Design".
  if (hasContent(input.artifacts, "design_package")) return "design";

  // §3: "PRD in progress → Define".
  //
  // This cannot yet tell a complete PRD from an incomplete one — completeness
  // is a score, and scores arrive in Phase 2. Today every PRD with content
  // reads as Define, which is right for "PRD in progress" and merely incomplete
  // for its successor. Phase 2 widens `StageInput` rather than rewriting this.
  if (hasContent(input.artifacts, "prd")) return "define";

  // §3: "no PRD → Discover". Also where an item with no artifacts at all sits,
  // which is every item on the day it is created.
  return "discover";
}
