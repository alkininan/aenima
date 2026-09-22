import { describe, expect, it } from "vitest";

import { NO_USAGE } from "@/lib/ai/types";
import type { AiResult } from "@/lib/ai/types";
import { applicableChecks, featurePrdPack } from "@/packs";

import { draftSection, fit, refineSection } from "./loop";
import type { Agents, Ledger, RefineInput, RoundWrite } from "./loop";
import type { AssembledRequest, Turn } from "./prompt";
import { ROUND_TEXT_MAX } from "./rounds";
import type { StoredRound } from "./rounds";
import type { AuthorAnswer, CriticAnswer } from "./schema";

/**
 * The loop against recorded answers — T3.1's Tests: "The model-facing paths use
 * the seam's recorded fixtures rather than live calls."
 *
 * Each agent is a script of the answers a model gave, played back in order, and
 * every request it was sent is kept. A script that runs out throws, so a loop
 * that calls a model more often than the test says fails loudly instead of
 * quietly reading an empty answer. The ledger is an array, which is all a
 * ledger has to be for the loop: rows in, rows back.
 */

const pack = featurePrdPack;
const checkIds = applicableChecks(pack, []).map((check) => check.id);

const SCHEDULING =
  "## Scheduling\nPropose 2 time options; the other person accepts one or declines.\n\n";
const MEET = "## Meet\nOne-tap arrived safe check-in during the date.\n";
const BODY = `# Juno\n\n${SCHEDULING}${MEET}`;

const EVIDENCE = "Propose 2 time options";

const CONVERSATION: Turn[] = [
  { speaker: "human", text: "HUMAN-TURN-7f3a: I am really sure two options is enough." },
  { speaker: "author", text: "AUTHOR-TURN-91c2: Noted, keeping two." },
];

function ok<T>(value: T): AiResult<T> {
  return {
    ok: true,
    value,
    provider: "anthropic",
    model: "claude-opus-5",
    tier: "generation",
    usage: NO_USAGE,
    escalatedFrom: null,
  };
}

function scripted(critic: CriticAnswer[], author: AuthorAnswer[]) {
  const sent = { critic: [] as AssembledRequest[], author: [] as AssembledRequest[] };
  const agents: Agents = {
    critic: async (request) => {
      sent.critic.push(request);
      const answer = critic.shift();
      if (!answer) throw new Error("the critic was asked more often than the script says");
      return ok(answer);
    },
    author: async (request) => {
      sent.author.push(request);
      const answer = author.shift();
      if (!answer) throw new Error("the author was asked more often than the script says");
      return ok(answer);
    },
  };
  return { agents, sent };
}

function memoryLedger(seed: StoredRound[] = []) {
  const rows: StoredRound[] = seed.map((row) => ({ ...row }));
  const recorded: RoundWrite[] = [];
  let versions = 1;
  const ledger: Ledger = {
    rounds: async () => rows.map((row) => ({ ...row })),
    record: async (round) => {
      recorded.push(round);
      rows.push({
        sectionId: round.sectionId,
        checkId: round.checkId,
        cycleNo: round.cycleNo,
        baseSectionHash: round.baseSectionHash,
        roundNo: round.roundNo,
        outcome: round.outcome,
        reason: round.reason,
        reasonTruncated: round.reasonTruncated,
        evidence: round.evidence,
        evidenceTruncated: round.evidenceTruncated,
        authorPosition: round.authorPosition,
      });
      if (round.outcome !== "revised") return { versionId: null };
      versions += 1;
      return { versionId: `v${versions}` };
    },
  };
  return { ledger, rows, recorded };
}

/** An objection from the critic, complete, bound, quoting the scheduling section. */
function objection(overrides: Partial<CriticAnswer["objections"][number]> = {}) {
  return {
    checkId: "prd-4",
    reason: "It never says what happens when neither time works.",
    evidence: EVIDENCE,
    scope: "scheduling",
    ...overrides,
  };
}

const none: CriticAnswer = { objections: [] };
const objects = (...objections: CriticAnswer["objections"]): CriticAnswer => ({ objections });

/** A revision of the scheduling section that stays inside it. */
function revision(n: number, position = `position ${n}`): AuthorAnswer {
  return {
    section: `## Scheduling\n${EVIDENCE}; the other person accepts one, declines, or asks for more (${n}).\n\n`,
    position,
  };
}

/** The baseline every fixture round is written under — the human's text, unchanged. */
const BASE = "base-hash";

const input = (overrides: Partial<RefineInput> = {}): RefineInput => ({
  pack,
  checkIds,
  body: BODY,
  versionId: "v1",
  sectionId: "scheduling",
  baseSectionHash: BASE,
  conversation: CONVERSATION,
  ...overrides,
});

describe("refineSection — TC2 → AC2", () => {
  it("refuses a revision that grows a section outside its scope, and counts the round as spent", async () => {
    const { agents, sent } = scripted(
      [objects(objection()), objects(objection()), none],
      [
        {
          section: `${SCHEDULING}## Cancellation\nEither person can cancel.\n`,
          position: "Added a cancellation section.",
        },
        revision(2),
      ],
    );
    const { ledger, recorded } = memoryLedger();

    const result = await refineSection(input(), agents, ledger);

    expect(recorded.map((r) => [r.roundNo, r.outcome])).toEqual([
      [1, "refused"],
      [2, "revised"],
    ]);
    expect(recorded[0]!.outsideSections).toEqual(["cancellation"]);
    expect(recorded[0]!.revisedBody).toBeNull();
    // The refused round cut no version: the second objection was raised
    // against the same document and the same version as the first.
    expect(sent.critic[1]!.input).toBe(sent.critic[0]!.input);
    expect(recorded[1]!.versionId).toBe("v1");
    expect(result.ok && result.versionId).toBe("v2");
  });

  it("refuses a revision that renames its own heading, since the id the rounds are keyed on moves", async () => {
    const { agents } = scripted(
      [objects(objection()), none],
      [{ section: `## Scheduling a date\n${EVIDENCE}.\n\n`, position: "Renamed it." }],
    );
    const { ledger, recorded } = memoryLedger();

    const result = await refineSection(input(), agents, ledger);

    expect(recorded.map((r) => r.outcome)).toEqual(["refused"]);
    expect(result.ok && result.body).toBe(BODY);
  });
});

describe("refineSection — TC3 → AC3", () => {
  it("surfaces the third objection as one open question, keeping the author's latest draft", async () => {
    const { agents, sent } = scripted(
      [
        objects(objection({ reason: "first" })),
        objects(objection({ reason: "second" })),
        objects(objection({ reason: "third" })),
      ],
      [revision(1), revision(2, "Nobody has said what a third option looks like.")],
    );
    const { ledger, recorded } = memoryLedger();

    const result = await refineSection(input(), agents, ledger);

    expect(sent.author).toHaveLength(2);
    expect(recorded.map((r) => [r.roundNo, r.outcome])).toEqual([
      [1, "revised"],
      [2, "revised"],
      [3, "surfaced"],
    ]);

    const surfaced = recorded.filter((r) => r.outcome === "surfaced");
    expect(surfaced).toHaveLength(1);
    expect(surfaced[0]).toMatchObject({
      checkId: "prd-4",
      evidence: EVIDENCE,
      reason: "third",
      authorPosition: "Nobody has said what a third option looks like.",
      revisedBody: null,
    });

    // The document as it stands is the second revision, not the original and
    // not an empty section: no work is thrown away.
    expect(result.ok).toBe(true);
    expect(result.ok && result.body).toBe(`# Juno\n\n${revision(2).section}${MEET}`);
    expect(result.ok && result.versionId).toBe("v3");
  });

  it("writes nothing more for a check whose question is already open", async () => {
    const { agents, sent } = scripted([objects(objection())], []);
    const { ledger, recorded } = memoryLedger([
      stored(1, "revised"),
      stored(2, "revised"),
      stored(3, "surfaced"),
    ]);

    const result = await refineSection(input(), agents, ledger);

    expect(sent.author).toHaveLength(0);
    expect(recorded).toHaveLength(0);
    expect(result.ok).toBe(true);
  });
});

describe("refineSection — TC4 → AC4", () => {
  it("never puts a turn of the conversation, or the author's position, into a request the critic is sent", async () => {
    const position = "AUTHOR-POSITION-5d0e: I am confident this answers it.";
    const { agents, sent } = scripted(
      [objects(objection()), objects(objection({ reason: "again" })), none],
      [revision(1, position), revision(2, position)],
    );
    const { ledger } = memoryLedger();

    await refineSection(input(), agents, ledger);

    expect(sent.critic).toHaveLength(3);
    for (const request of sent.critic) {
      const assembled = `${request.context}\n${request.input}`;
      for (const turn of CONVERSATION) expect(assembled).not.toContain(turn.text);
      expect(assembled).not.toContain("HUMAN-TURN-7f3a");
      expect(assembled).not.toContain("AUTHOR-TURN-91c2");
      expect(assembled).not.toContain("AUTHOR-POSITION-5d0e");
      // Bounded to the section under refinement: another section's text is not read.
      expect(assembled).not.toContain("arrived safe");
      expect(request.input).toContain("## Scheduling");
    }
    // The conversation was in play the whole time — the author was sent it.
    expect(sent.author[0]!.input).toContain("HUMAN-TURN-7f3a");
  });
});

describe("refineSection — TC6 → AC6", () => {
  it("reads the count from the ledger after a reload, not from the document", async () => {
    const { agents, sent } = scripted([objects(objection({ reason: "after reload" }))], []);
    // An earlier session spent both revisions. Nothing in the document says so.
    const { ledger, recorded } = memoryLedger([
      stored(1, "revised", "earlier position 1"),
      stored(2, "held", "earlier position 2"),
    ]);

    await refineSection(input(), agents, ledger);

    expect(sent.author).toHaveLength(0);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      roundNo: 3,
      outcome: "surfaced",
      authorPosition: "earlier position 2",
    });
  });

  it("carries a round written in one session into the next", async () => {
    const shared = memoryLedger();

    const first = scripted([objects(objection()), none], [revision(1)]);
    const one = await refineSection(input(), first.agents, shared.ledger);
    expect(one.ok).toBe(true);

    const second = scripted([objects(objection()), none], [revision(2)]);
    await refineSection(
      input({ body: one.ok ? one.body : BODY, versionId: one.ok ? one.versionId : "v1" }),
      second.agents,
      shared.ledger,
    );

    expect(shared.recorded.map((r) => r.roundNo)).toEqual([1, 2]);
  });
});

describe("refineSection — TC7 → AC7", () => {
  it("leaves another section's count untouched by the rounds spent on one", async () => {
    const { agents, sent } = scripted(
      [objects(objection({ evidence: "arrived safe", scope: "meet" })), none],
      [{ section: `${MEET}Checked in by the server.\n`, position: "Said who checks." }],
    );
    // Scheduling has spent both of its revisions on prd-4.
    const { ledger, recorded } = memoryLedger([stored(1, "revised"), stored(2, "revised")]);

    await refineSection(input({ sectionId: "meet" }), agents, ledger);

    expect(sent.author).toHaveLength(1);
    expect(recorded.map((r) => [r.sectionId, r.roundNo, r.outcome])).toEqual([
      ["meet", 1, "revised"],
    ]);
  });
});

describe("refineSection — the doors before the author", () => {
  it("TC1 → AC1, TC5 → AC5: the author sees only the objection that binds and quotes the section", async () => {
    const { agents, sent } = scripted(
      [
        objects(
          objection({ checkId: "prd-99", reason: "UNBOUND-REASON" }),
          objection({ evidence: "a sentence nobody wrote", reason: "UNQUOTED-REASON" }),
          objection({ reason: "BOUND-REASON" }),
        ),
        none,
      ],
      [revision(1)],
    );
    const { ledger, recorded } = memoryLedger();

    await refineSection(input(), agents, ledger);

    expect(sent.author).toHaveLength(1);
    expect(sent.author[0]!.input).toContain("BOUND-REASON");
    expect(sent.author[0]!.input).not.toContain("UNBOUND-REASON");
    expect(sent.author[0]!.input).not.toContain("UNQUOTED-REASON");
    expect(recorded.map((r) => [r.checkId, r.roundNo])).toEqual([["prd-4", 1]]);
  });

  it("discards an objection scoped to a section the critic was not shown", async () => {
    const { agents, sent } = scripted([objects(objection({ scope: "meet" }))], []);
    const { ledger, recorded } = memoryLedger();

    const result = await refineSection(input(), agents, ledger);

    expect(sent.author).toHaveLength(0);
    expect(recorded).toHaveLength(0);
    expect(result.ok).toBe(true);
  });

  // AA3 replaces T3.1's door here: a size is not a reason to discard an
  // objection, because a discarded one is a gap nobody hears about.
  it("cuts an over-long reason to what a round holds, records the cut, and still asks the author", async () => {
    const long = "x".repeat(2001);
    const { agents, sent } = scripted([objects(objection({ reason: long })), none], [revision(1)]);
    const { ledger, recorded } = memoryLedger();

    const result = await refineSection(input(), agents, ledger);

    expect(sent.author).toHaveLength(1);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.reason).toHaveLength(ROUND_TEXT_MAX);
    expect(recorded[0]!.reasonTruncated).toBe(true);
    expect(recorded[0]!.evidenceTruncated).toBe(false);
    expect(recorded[0]!.outcome).toBe("revised");
    // What the author argued from is what the ledger holds, cut and all.
    expect(sent.author[0]!.input).toContain(`reason: ${"x".repeat(ROUND_TEXT_MAX)}`);
    expect(sent.author[0]!.input).not.toContain("x".repeat(ROUND_TEXT_MAX + 1));
    expect(result.ok).toBe(true);
  });

  it("surfaces an objection whose quote will not fit rather than dropping it, and never shows the author a cut quote", async () => {
    const long = "y".repeat(2001);
    const body = `# Juno\n\n## Scheduling\n${long}\n\n${MEET}`;
    const { agents, sent } = scripted([objects(objection({ evidence: long })), none], []);
    const { ledger, recorded } = memoryLedger();

    const result = await refineSection(input({ body }), agents, ledger);

    expect(sent.author).toHaveLength(0);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      outcome: "surfaced",
      roundNo: 1,
      cycleNo: 1,
      evidenceTruncated: true,
      // The author was never asked, so there is no position to record.
      authorPosition: null,
    });
    expect(recorded[0]!.evidence).toHaveLength(ROUND_TEXT_MAX);
    expect(result.ok).toBe(true);
  });

  it("discards no objection for its size on any path — every admitted one is recorded", async () => {
    const long = "z".repeat(2001);
    const body = `# Juno\n\n## Scheduling\n${long}\n\n${MEET}`;
    const { agents } = scripted(
      [objects(objection({ reason: long, evidence: long, checkId: "prd-4" })), none],
      [],
    );
    const { ledger, recorded } = memoryLedger();

    const result = await refineSection(input({ body }), agents, ledger);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.checkId).toBe("prd-4");
    expect(recorded[0]!.reasonTruncated).toBe(true);
    expect(recorded[0]!.evidenceTruncated).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("refines nothing under the preamble, which is not a ## section", async () => {
    const { agents, sent } = scripted([], []);
    const { ledger } = memoryLedger();

    const result = await refineSection(input({ sectionId: "_preamble" }), agents, ledger);

    expect(!result.ok && result.reason).toBe("no-section");
    expect(sent.critic).toHaveLength(0);
  });

  it("refines nothing under a heading whose id is longer than a round can store", async () => {
    const heading = "Scheduling ".repeat(20);
    const { agents, sent } = scripted([], []);
    const { ledger } = memoryLedger();
    const body = `## ${heading}\n${EVIDENCE}.\n`;
    const id = heading.trim().toLowerCase().replace(/ /g, "-");
    expect(id.length).toBeGreaterThan(200);

    const result = await refineSection(input({ body, sectionId: id }), agents, ledger);

    expect(!result.ok && result.reason).toBe("no-section");
    expect(sent.critic).toHaveLength(0);
  });

  it("sends the author only the scoped section of the document", async () => {
    const { agents, sent } = scripted([objects(objection()), none], [revision(1)]);
    const { ledger } = memoryLedger();

    await refineSection(input(), agents, ledger);

    expect(sent.author[0]!.input).toContain("## Scheduling");
    expect(sent.author[0]!.input).not.toContain("arrived safe");
    expect(sent.author[0]!.input).not.toContain("# Juno");
  });
});

describe("refineSection — how a round ends", () => {
  it("records a section returned with only its trailing blank line dropped as held", async () => {
    const { agents } = scripted(
      [objects(objection()), none],
      [{ section: SCHEDULING.trimEnd(), position: "Nothing new to add." }],
    );
    const { ledger, recorded } = memoryLedger();

    const result = await refineSection(input(), agents, ledger);

    expect(recorded.map((r) => r.outcome)).toEqual(["held"]);
    expect(result.ok && result.body).toBe(BODY);
  });

  it("stops on a position longer than a round can hold, writing no round for it", async () => {
    const { agents } = scripted([objects(objection())], [revision(1, "p".repeat(2001))]);
    const { ledger, recorded } = memoryLedger();

    const result = await refineSection(input(), agents, ledger);

    expect(!result.ok && result.reason).toBe("answer");
    expect(recorded).toHaveLength(0);
  });

  it("records a revision that changed nothing as held, cutting no version", async () => {
    const { agents } = scripted(
      [objects(objection()), none],
      [{ section: SCHEDULING, position: "Nobody has said what else to offer." }],
    );
    const { ledger, recorded } = memoryLedger();

    const result = await refineSection(input(), agents, ledger);

    expect(recorded.map((r) => [r.roundNo, r.outcome])).toEqual([[1, "held"]]);
    expect(result.ok && result.versionId).toBe("v1");
  });

  it("stops on a call that did not come back, keeping the rounds already written", async () => {
    const { agents } = scripted([objects(objection())], [revision(1)]);
    const failing: Agents = {
      ...agents,
      critic: (() => {
        let calls = 0;
        return async (request: AssembledRequest) => {
          calls += 1;
          if (calls === 1) return agents.critic(request);
          return {
            ok: false,
            failure: { kind: "unavailable", retryable: true, detail: "503" },
          } as const;
        };
      })(),
    };
    const { ledger, recorded } = memoryLedger();

    const result = await refineSection(input(), failing, ledger);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("provider");
    expect(recorded).toHaveLength(1);
  });

  it("stops on a revision with no position, writing no round for it", async () => {
    const { agents } = scripted([objects(objection())], [revision(1, "   ")]);
    const { ledger, recorded } = memoryLedger();

    const result = await refineSection(input(), agents, ledger);

    expect(!result.ok && result.reason).toBe("answer");
    expect(recorded).toHaveLength(0);
  });

  it("says so when the section is not in the document", async () => {
    const { agents, sent } = scripted([], []);
    const { ledger } = memoryLedger();

    const result = await refineSection(input({ sectionId: "pricing" }), agents, ledger);

    expect(!result.ok && result.reason).toBe("no-section");
    expect(sent.critic).toHaveLength(0);
  });
});

describe("draftSection", () => {
  it("takes a draft that reads as the one section asked for", async () => {
    const { agents, sent } = scripted(
      [],
      [{ section: `## Date & Meet\n${EVIDENCE}.`, position: "From the Juno doc." }],
    );

    const result = await draftSection(
      { pack, checkIds, heading: "Date & Meet", material: "MATERIAL-1b", conversation: [] },
      agents,
    );

    expect(result).toEqual({
      ok: true,
      text: `## Date & Meet\n${EVIDENCE}.\n`,
      position: "From the Juno doc.",
    });
    expect(sent.author[0]!.input).toContain("MATERIAL-1b");
  });

  it("refuses a draft that grows a second section or loses its heading", async () => {
    for (const section of [
      `## Date & Meet\ntext\n## Also this\nmore\n`,
      `Intro first\n## Date & Meet\ntext\n`,
      `## Dating\ntext\n`,
    ]) {
      const { agents } = scripted([], [{ section, position: "p" }]);
      const result = await draftSection(
        { pack, checkIds, heading: "Date & Meet", material: "m", conversation: [] },
        agents,
      );
      expect(!result.ok && result.reason, section).toBe("answer");
    }
  });
});

/** A round already in the ledger on scheduling/prd-4. */
function stored(roundNo: number, outcome: StoredRound["outcome"], authorPosition = `p${roundNo}`) {
  return {
    sectionId: "scheduling",
    checkId: "prd-4",
    cycleNo: 1,
    baseSectionHash: BASE,
    roundNo,
    outcome,
    reason: `stored ${roundNo}`,
    reasonTruncated: false,
    evidence: EVIDENCE,
    evidenceTruncated: false,
    authorPosition,
  } satisfies StoredRound;
}

describe("fit — T3.2's TA3 → AA3", () => {
  it("keeps text a round can hold, whole and unmarked", () => {
    expect(fit("short")).toEqual({ text: "short", truncated: false });
    const exact = "x".repeat(ROUND_TEXT_MAX);
    expect(fit(exact)).toEqual({ text: exact, truncated: false });
  });

  it("cuts to what the column holds, and says it cut", () => {
    const long = "x".repeat(ROUND_TEXT_MAX + 50);
    expect(fit(long)).toEqual({ text: "x".repeat(ROUND_TEXT_MAX), truncated: true });
  });

  it("never cuts a character in half", () => {
    // An emoji is a surrogate pair, so the 2000th code unit falls inside one.
    const text = `${"x".repeat(ROUND_TEXT_MAX - 1)}😀tail`;
    const cut = fit(text);

    expect(cut.truncated).toBe(true);
    expect(cut.text).toHaveLength(ROUND_TEXT_MAX - 1);
    // A lone surrogate is replaced on its way to the driver, and the stored
    // quote would then no longer occur in the section it came from.
    expect([...cut.text].every((ch) => ch.codePointAt(0)! < 0xd800)).toBe(true);
    expect(cut.text).toBe("x".repeat(ROUND_TEXT_MAX - 1));
  });
});
