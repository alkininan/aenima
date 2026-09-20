import { describe, expect, it } from "vitest";

import { featurePrdPack } from "@/packs";
import type { SkillPack } from "@/packs";

import {
  AUTHOR_PROTOCOL,
  CRITIC_PROTOCOL,
  criticRequest,
  renderChecks,
  revisionRequest,
} from "./prompt";

/** A pack small enough to read every line of what it renders. */
const pack: SkillPack = {
  id: "tiny",
  version: "1.0.0",
  artifactKind: "prd",
  checks: [
    { id: "t-1", prose: "Problem stated", tag: "must", points: 60, probes: ["Who hurts?"] },
    { id: "t-2", prose: "Metric named", tag: "should", points: 40 },
  ],
  layers: [
    {
      id: "safety",
      appliesWhen: { id: "meets", when: "People meet in person." },
      checks: [{ id: "t-3", prose: "Safety step", tag: "must", points: 5 }],
    },
  ],
  interview: [{ checkId: "t-2", prompt: "How will we know?", criticTest: "A number is named." }],
};

describe("renderChecks", () => {
  it("renders the checks in play in pack order, with probes and the bank's critic test beneath", () => {
    expect(renderChecks(pack, ["t-3", "t-2", "t-1"])).toBe(
      [
        "t-1 (must): Problem stated",
        "  probe: Who hurts?",
        "t-2 (should): Metric named",
        "  critic test: A number is named.",
        "t-3 (must): Safety step",
      ].join("\n"),
    );
  });

  it("renders only the checks in play, and nothing for an id the pack does not hold", () => {
    expect(renderChecks(pack, ["t-2", "t-9"])).toBe(
      "t-2 (should): Metric named\n  critic test: A number is named.",
    );
  });
});

describe("criticRequest", () => {
  it("puts the protocol and the checks in the cached context, and the section alone in the input", () => {
    const request = criticRequest(pack, ["t-1"], {
      id: "problem",
      text: "## Problem\nIt hurts.\n",
    });
    expect(request.context.startsWith(CRITIC_PROTOCOL)).toBe(true);
    expect(request.context).toContain("t-1 (must): Problem stated");
    expect(request.context).not.toContain("t-2");
    expect(request.context).not.toContain("It hurts.");
    expect(request.input).toBe("SECTION problem\n## Problem\nIt hurts.\n");
  });
});

describe("revisionRequest", () => {
  it("names the objection's check in the rubric's words beside the critic's reason", () => {
    const request = revisionRequest(
      featurePrdPack,
      ["prd-7"],
      { checkId: "prd-7", reason: "No baseline.", evidence: "measured", scope: "metrics" },
      { id: "metrics", text: "## Metrics\nmeasured\n" },
      [{ speaker: "human", text: "We have no baseline yet." }],
    );
    expect(request.context.startsWith(AUTHOR_PROTOCOL)).toBe(true);
    expect(request.input).toContain(
      "check: prd-7 — Metric has baseline + target (or an instrumentation plan if new)",
    );
    expect(request.input).toContain("reason: No baseline.");
    expect(request.input).toContain("SECTION metrics\n## Metrics\nmeasured\n");
    expect(request.input).toContain("human: We have no baseline yet.");
  });
});
