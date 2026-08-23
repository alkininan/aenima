import { describe, expect, it } from "vitest";

import {
  STAGES,
  deriveStage,
  deriveStageEntry,
  type ArtifactPresence,
  type Stage,
} from "@/lib/stage";

/** An artifact that has actually been authored into. */
const authored = (kind: ArtifactPresence["kind"], versionCount = 1): ArtifactPresence => ({
  kind,
  versionCount,
});

/** An artifact row that exists as identity only — created, never written. */
const empty = (kind: ArtifactPresence["kind"]): ArtifactPresence => ({ kind, versionCount: 0 });

/**
 * Derived stage — product-spec.md §3.
 *
 * This is CLAUDE.md's first law in executable form, so the tests are about the
 * law as much as the function: a stage is *computed* from what an item owns,
 * and there is nowhere to store one. Every case §3 names is covered, including
 * the two that are easy to leave out — an item with no artifacts at all (every
 * item, on the day it is created) and an artifact row with no versions.
 */
describe("deriveStage", () => {
  // §3: "no PRD → Discover". The state every item starts in.
  it("puts an item with nothing at all in Discover", () => {
    expect(deriveStage({ artifacts: [] })).toBe("discover");
  });

  it("keeps an item in Discover while it only has a brief", () => {
    expect(deriveStage({ artifacts: [authored("brief")] })).toBe("discover");
  });

  /**
   * The distinction that makes `versionCount` worth carrying. Creating an
   * `artifact` row is identity, not authorship — §3 keys its stages on the
   * artifact existing as *content*. Without this, opening an empty PRD would
   * advance the item to Define and the meters would describe work nobody did.
   */
  it("does not advance on an artifact that exists but was never written", () => {
    expect(deriveStage({ artifacts: [empty("prd")] })).toBe("discover");
    expect(deriveStage({ artifacts: [empty("prd"), empty("design_package")] })).toBe("discover");
  });

  // §3: "PRD in progress → Define".
  it("moves to Define once the PRD carries content", () => {
    expect(deriveStage({ artifacts: [authored("prd")] })).toBe("define");
    expect(deriveStage({ artifacts: [authored("brief"), authored("prd")] })).toBe("define");
  });

  // §3: "frames linked and mapped → Design".
  it("moves to Design once the design package carries content", () => {
    expect(deriveStage({ artifacts: [authored("prd"), authored("design_package")] })).toBe(
      "design",
    );
  });

  // Later evidence outranks earlier: an item does not fall back to Define just
  // because its PRD is also present.
  it("prefers the most advanced evidence when several artifacts exist", () => {
    const artifacts = [
      authored("brief"),
      authored("prd", 4),
      authored("tech_spec"),
      authored("design_package", 2),
    ];
    expect(deriveStage({ artifacts })).toBe("design");
  });

  /**
   * §3's ordering does not require a PRD before a design package. Backward and
   * out-of-order movement is legal and unceremonious — an item whose design
   * landed before its PRD is in Design, not stuck behind a missing document.
   */
  it("reaches Design from a design package alone, with no PRD", () => {
    expect(deriveStage({ artifacts: [authored("design_package")] })).toBe("design");
  });

  // A tech spec is Design-stage evidence in §3's table, but §3 keys the stage
  // transition on the design package. A tech spec alone advances nothing.
  it("does not advance on a tech spec alone", () => {
    expect(deriveStage({ artifacts: [authored("tech_spec")] })).toBe("discover");
  });

  it("ignores a backlog, which is downstream of every stage it could name", () => {
    expect(deriveStage({ artifacts: [authored("backlog")] })).toBe("discover");
  });
});

/**
 * §3's terminal state exists in the type and cannot yet be reached.
 *
 * There is no packet table, so nothing can observe a signature. The honest
 * encoding is `signedPacket?: never` — a field with no inhabitant — rather than
 * a `boolean` that would read as "observable, currently false". These two tests
 * pin both halves of that: the type has no way to say it, and no input a caller
 * can build produces it.
 */
describe("handover is unreachable until the packet table exists", () => {
  it("offers no way to assert a signed packet", () => {
    // The assertion is the directive: if `signedPacket` ever stops being
    // `never`, this line compiles and the unused-directive check fails the
    // build. Written as a call rather than a bare object so the parameter
    // supplies the contextual type — an object literal assigned to nothing is
    // never checked against the field at all, which made an earlier version of
    // this test silently vacuous.
    // @ts-expect-error `signedPacket` is `never`: there is nothing to pass.
    expect(deriveStage({ artifacts: [], signedPacket: true })).toBe("handed_over");
  });

  it("returns no stage a caller cannot currently reach", () => {
    const everyCombination: Stage[] = [];
    const kinds = ["brief", "prd", "tech_spec", "design_package", "backlog"] as const;

    // Every subset of artifact kinds, each present and absent, authored and not.
    for (let mask = 0; mask < 1 << kinds.length; mask += 1) {
      for (const versionCount of [0, 1, 3]) {
        const artifacts = kinds
          .filter((_, index) => (mask & (1 << index)) !== 0)
          .map((kind) => ({ kind, versionCount }));
        everyCombination.push(deriveStage({ artifacts }));
      }
    }

    expect(everyCombination).not.toContain("handed_over");
    // …and everything it *does* return is a stage §3 names.
    expect(new Set(everyCombination)).toEqual(new Set(["discover", "define", "design"]));
  });

  it("still names handover in the stage list, because §3 does", () => {
    expect(STAGES).toContain("handed_over");
    expect(STAGES).toHaveLength(4);
  });
});

/**
 * §13's clock, for the stage that has no column to start one from.
 *
 * Every case below turns on the difference between an artifact *row* and an
 * artifact with *content*: the row is identity, and identity starts nothing.
 */
describe("deriveStageEntry", () => {
  const CREATED = "2026-01-01T00:00:00+00:00";
  const PRD_V1 = "2026-03-01T00:00:00+00:00";
  const DESIGN_V1 = "2026-05-01T00:00:00+00:00";

  // Discover is entered by existing — there is no artifact to date it from.
  it("dates a Discover item from the item itself", () => {
    expect(deriveStageEntry({ artifacts: [], createdAt: CREATED })).toBe(CREATED);
  });

  it("dates Define from the PRD's first version, not the item", () => {
    const entry = deriveStageEntry({
      artifacts: [{ kind: "prd", versionCount: 2, firstVersionAt: PRD_V1 }],
      createdAt: CREATED,
    });

    expect(entry).toBe(PRD_V1);
  });

  /**
   * The item is in Design, so the Design clock is the one that runs. Reading
   * the PRD's date here would age the item by everything that happened before
   * it moved on — which is exactly the demotion case the function documents,
   * and must not be the ordinary case.
   */
  it("dates Design from the design package, ignoring the older PRD", () => {
    const entry = deriveStageEntry({
      artifacts: [
        { kind: "prd", versionCount: 3, firstVersionAt: PRD_V1 },
        { kind: "design_package", versionCount: 1, firstVersionAt: DESIGN_V1 },
      ],
      createdAt: CREATED,
    });

    expect(entry).toBe(DESIGN_V1);
  });

  /**
   * An artifact row with no versions leaves the item in Discover (see
   * `deriveStage`), so its clock is the item's — and it must not be the empty
   * container's own timestamp, which nothing here is even given.
   */
  it("ignores an artifact nobody has authored into", () => {
    const entry = deriveStageEntry({
      artifacts: [{ kind: "prd", versionCount: 0, firstVersionAt: null }],
      createdAt: CREATED,
    });

    expect(entry).toBe(CREATED);
  });

  // Only `prd` and `design_package` decide a stage. A brief or a tech spec can
  // carry any amount of content without starting a clock.
  it("is unmoved by artifacts that decide no stage", () => {
    const entry = deriveStageEntry({
      artifacts: [
        { kind: "brief", versionCount: 4, firstVersionAt: "2026-02-01T00:00:00+00:00" },
        { kind: "tech_spec", versionCount: 2, firstVersionAt: "2026-02-15T00:00:00+00:00" },
      ],
      createdAt: CREATED,
    });

    expect(entry).toBe(CREATED);
  });

  /**
   * The unreachable fallback, reached the only way a test can reach it: a
   * deciding artifact with content but no timestamp. A missing date must not
   * become an age of zero, which would be an item that just entered its stage —
   * the opposite of what a null there suggests.
   */
  it("falls back to the item rather than inventing a fresh clock", () => {
    const entry = deriveStageEntry({
      artifacts: [{ kind: "prd", versionCount: 1, firstVersionAt: null }],
      createdAt: CREATED,
    });

    expect(entry).toBe(CREATED);
  });
});
