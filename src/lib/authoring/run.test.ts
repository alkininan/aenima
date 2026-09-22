import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { applicableChecks, featurePrdPack } from "@/packs";

import { parseSections, sectionHash } from "./sections";

/**
 * The loop wired to the product — what `refineArtifactSection` reads, what it
 * sends through the seam, and what it does when the ledger refuses a write.
 * Everything below the seam and the queries is a fake.
 */

const db = vi.hoisted(() => ({
  artifact: null as Record<string, unknown> | null,
  /** Conditions per artifact version, as `scoring_run` holds them (AA2). */
  conditions: {} as Record<string, string[]>,
  /** Every version id a conditions read was asked for, in order. */
  conditionsAsked: [] as string[],
  /** The newest human-authored version's content, or null where no human wrote one. */
  humanBaseline: null as { versionId: string; content: unknown } | null,
  rounds: [] as unknown[],
  writes: [] as Record<string, unknown>[],
  writeError: null as Error | null,
  readError: null as Error | null,
}));

const ai = vi.hoisted(() => ({
  calls: [] as { purpose: string; context: string; input: string; maxTokens: number }[],
  replies: [] as unknown[],
}));

vi.mock("@/db/queries/scoring", () => ({
  readScorableArtifact: async () => db.artifact,
}));

vi.mock("@/db/queries/refinement", () => ({
  readVersionConditions: async (_workspaceId: string, versionId: string) => {
    db.conditionsAsked.push(versionId);
    return db.conditions[versionId] ?? null;
  },
  readHumanBaseline: async () => db.humanBaseline,
  readRounds: async () => {
    if (db.readError) throw db.readError;
    return db.rounds;
  },
  writeRound: async (write: Record<string, unknown>) => {
    if (db.writeError) throw db.writeError;
    db.writes.push(write);
    return { versionId: null };
  },
}));

vi.mock("@/lib/ai", () => ({
  runGeneration: async (
    _context: unknown,
    request: { purpose: string; context: string; input: string; maxTokens: number },
  ) => {
    ai.calls.push(request);
    return { ok: true, value: ai.replies.shift(), provider: "anthropic", model: "m" };
  },
}));

vi.mock("@/lib/scoring/run", async () => {
  const { featurePrdPack: pack } = await import("@/packs");
  return { packForKind: (kind: string) => (kind === "prd" ? pack : undefined) };
});

const { refineArtifactSection, markdownBody } = await import("./run");

const BODY = "## Scheduling\nPropose 2 time options.\n";
const INPUT = {
  workspaceId: "w1",
  artifactId: "a1",
  sectionId: "scheduling",
  conversation: [],
  actor: { kind: "agent", name: "author" } as const,
};

beforeEach(() => {
  db.artifact = {
    artifactId: "a1",
    itemId: "i1",
    productId: "p1",
    kind: "prd",
    versionId: "v1",
    versionNo: 1,
    content: { body: BODY },
  };
  db.conditions = {};
  db.conditionsAsked = [];
  db.humanBaseline = { versionId: "v0", content: { body: BODY } };
  db.rounds = [];
  db.writes = [];
  db.writeError = null;
  db.readError = null;
  ai.calls = [];
  ai.replies = [];
});

describe("refineArtifactSection", () => {
  it("shows the critic the checks the version's own scoring run left in play, and meters it as critique", async () => {
    db.conditions = { v1: ["network-dependent-surface"] };
    ai.replies = [{ objections: [] }];

    const result = await refineArtifactSection(INPUT);

    expect(result.ok).toBe(true);
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0]!.purpose).toBe("critique");
    const inPlay = applicableChecks(featurePrdPack, ["network-dependent-surface"]);
    for (const check of inPlay) expect(ai.calls[0]!.context).toContain(`${check.id} (`);
    // prd-15's condition did not hold on that run, so it is not in play.
    expect(ai.calls[0]!.context).not.toContain("prd-15 (");
    expect(ai.calls[0]!.context).toContain("prd-16 (");
  });

  it("leaves conditioned checks out for an artifact that was never scored", async () => {
    ai.replies = [{ objections: [] }];

    await refineArtifactSection(INPUT);

    expect(ai.calls[0]!.context).not.toContain("prd-16 (");
    expect(ai.calls[0]!.context).toContain("prd-1 (");
  });

  // TA2. The addendum's ruling: §5 caches results per artifact version, so
  // applicability belongs to the version too. A run against an older version is
  // an answer about text that is no longer under refinement.
  it("T3.2's TA2 → AA2: asks for the conditions of the version under refinement, and not for the artifact's newest run", async () => {
    db.conditions = { v0: ["network-dependent-surface"] };
    ai.replies = [{ objections: [] }];

    await refineArtifactSection(INPUT);

    expect(db.conditionsAsked).toEqual(["v1"]);
    // v0's run said the conditioned check was in play; v1 has no run of its own,
    // so the set is the unconditioned one and prd-16 stays out.
    expect(ai.calls[0]!.context).not.toContain("prd-16 (");
    expect(ai.calls[0]!.context).toContain("prd-1 (");
  });

  it("meters the author's revision as draft and hands the round to the ledger with the artifact's item and product", async () => {
    ai.replies = [
      {
        objections: [
          {
            checkId: "prd-4",
            reason: "No evidence.",
            evidence: "Propose 2 time options",
            scope: "scheduling",
          },
        ],
      },
      { section: BODY, position: "Nobody has shared evidence yet." },
      { objections: [] },
    ];

    await refineArtifactSection(INPUT);

    expect(ai.calls.map((call) => call.purpose)).toEqual(["critique", "draft", "critique"]);
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0]).toMatchObject({
      workspaceId: "w1",
      productId: "p1",
      itemId: "i1",
      artifactId: "a1",
      round: { outcome: "held", roundNo: 1, checkId: "prd-4" },
    });
  });

  it("answers with a write failure, not an exception, when the ledger refuses a round", async () => {
    db.writeError = new Error("refinement_round_key");
    ai.replies = [
      {
        objections: [
          {
            checkId: "prd-4",
            reason: "r",
            evidence: "Propose 2 time options",
            scope: "scheduling",
          },
        ],
      },
      { section: BODY, position: "p" },
    ];

    const result = await refineArtifactSection(INPUT);

    expect(result).toEqual({ ok: false, reason: "write", detail: "refinement_round_key" });
  });

  it("leaves a failure that is not a ledger write to throw, rather than reporting it as one", async () => {
    db.readError = new Error("connection reset");
    ai.replies = [
      {
        objections: [
          {
            checkId: "prd-4",
            reason: "r",
            evidence: "Propose 2 time options",
            scope: "scheduling",
          },
        ],
      },
    ];

    await expect(refineArtifactSection(INPUT)).rejects.toThrow("connection reset");
  });

  it("refines nothing for content with no markdown body, and calls no model", async () => {
    db.artifact = { ...db.artifact!, content: { blocks: [] } };

    const result = await refineArtifactSection(INPUT);

    expect(!result.ok && result.reason).toBe("not-refinable");
    expect(ai.calls).toHaveLength(0);
  });

  it("refines nothing for an artifact with no versions or no pack", async () => {
    db.artifact = null;
    expect((await refineArtifactSection(INPUT)).ok).toBe(false);

    db.artifact = { kind: "tech_spec", content: { body: BODY } };
    const result = await refineArtifactSection(INPUT);
    expect(!result.ok && result.reason).toBe("not-refinable");
    expect(ai.calls).toHaveLength(0);
  });
});

describe("markdownBody", () => {
  it("reads a string body and nothing else", () => {
    expect(markdownBody({ body: "## A\n" })).toBe("## A\n");
    expect(markdownBody({ body: 3 })).toBeNull();
    expect(markdownBody(null)).toBeNull();
    expect(markdownBody("## A")).toBeNull();
  });
});

/**
 * T3.2's TA1 → AA1, through the wiring: the cycle's baseline is the section's
 * text in the newest human-authored version, so a surfaced check stays closed
 * while the human's text stands and is asked again once it does not.
 */
describe("the cycle's baseline — T3.2's TA1 → AA1", () => {
  const surfaced = (baseSectionHash: string | null) => ({
    sectionId: "scheduling",
    checkId: "prd-4",
    cycleNo: 1,
    baseSectionHash,
    roundNo: 3,
    outcome: "surfaced" as const,
    reason: "It never says what happens when neither time works.",
    reasonTruncated: false,
    evidence: "Propose 2 time options",
    evidenceTruncated: false,
    authorPosition: "The section says what it can.",
  });

  const objecting = () => [
    {
      objections: [
        {
          checkId: "prd-4",
          reason: "It never says what happens when neither time works.",
          evidence: "Propose 2 time options",
          scope: "scheduling",
        },
      ],
    },
    { objections: [] },
  ];

  it("keeps the question closed while the human's text for that section stands", async () => {
    db.rounds = [surfaced(sectionHash(parseSections(BODY), "scheduling"))];
    ai.replies = objecting();

    const result = await refineArtifactSection(INPUT);

    expect(result.ok).toBe(true);
    expect(db.writes).toHaveLength(0);
    // Only the critic was asked; the author was never brought back to a
    // question the human already owns.
    expect(ai.calls.map((call) => call.purpose)).toEqual(["critique"]);
  });

  it("opens the next cycle once the human has rewritten that section", async () => {
    db.rounds = [surfaced(sectionHash(parseSections(BODY), "scheduling"))];
    db.humanBaseline = {
      versionId: "v0",
      content: { body: "## Scheduling\nPropose 3 time options, and a fallback.\n" },
    };
    ai.replies = [
      objecting()[0],
      // The author holds the section, so the round is spent with no version cut
      // — enough to show that the check was asked again, which is AA1's claim.
      { section: BODY, position: "The section already says it." },
      { objections: [] },
    ];

    await refineArtifactSection(INPUT);

    expect(ai.calls.map((call) => call.purpose)).toEqual(["critique", "draft", "critique"]);
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0]!.round).toMatchObject({ cycleNo: 2, roundNo: 1, outcome: "held" });
  });

  it("has no baseline for an artifact no human has written a version of, and the closure holds", async () => {
    db.rounds = [surfaced(sectionHash(parseSections(BODY), "scheduling"))];
    db.humanBaseline = null;
    ai.replies = objecting();

    await refineArtifactSection(INPUT);

    expect(db.writes).toHaveLength(0);
  });
});
