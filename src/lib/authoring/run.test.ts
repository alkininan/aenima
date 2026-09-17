import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { applicableChecks, featurePrdPack } from "@/packs";

/**
 * The loop wired to the product — what `refineArtifactSection` reads, what it
 * sends through the seam, and what it does when the ledger refuses a write.
 * Everything below the seam and the queries is a fake.
 */

const db = vi.hoisted(() => ({
  artifact: null as Record<string, unknown> | null,
  conditions: null as string[] | null,
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
  readLatestConditions: async () => db.conditions,
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
  db.conditions = null;
  db.rounds = [];
  db.writes = [];
  db.writeError = null;
  db.readError = null;
  ai.calls = [];
  ai.replies = [];
});

describe("refineArtifactSection", () => {
  it("shows the critic the checks the newest scoring run left in play, and meters it as critique", async () => {
    db.conditions = ["network-dependent-surface"];
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
