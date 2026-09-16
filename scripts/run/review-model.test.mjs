import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  causeOf,
  fallbackModels,
  nextReviewer,
  pinnedModel,
  reviewChain,
} from "./review-model.mjs";

const root = join(import.meta.dirname, "..", "..");

/** The failure the reviewer's pinned model returned on T0.19, T0.20, T0.21, T0.13 and T2.9. */
const CREDITS =
  "Agent terminated early due to an API error: You're out of usage credits. Switch to another model, or manage usage credits at claude.ai/settings/usage?from=cc_cli_limit_message, to continue. (error type rate_limit, HTTP 429, request id req_011Cf5dz2qYUQoGvCV8LM)";
const OVERLOADED =
  "Agent terminated early due to an API error: Overloaded (error type overloaded, HTTP 529, request id req_011Cf5dz2qYUQoGvCV8LM)";

const AGENT =
  "---\nname: reviewer\ntools: Read, Grep, Glob, Bash\nmodel: fable\nmaxTurns: 30\n---\n\nBody.\n";
const SETTINGS = JSON.stringify({ fallbackModel: ["opus"], hooks: {} });
const CHAIN = ["fable", "opus"];

// T0.22 Rules — the fallback is the configured chain, never a model the run picks for itself.
describe("reviewChain", () => {
  it("is the model the reviewer's definition pins, then settings' fallbackModel", () => {
    expect(pinnedModel(AGENT)).toBe("fable");
    expect(fallbackModels(SETTINGS)).toEqual(["opus"]);
    expect(reviewChain({ agent: AGENT, settings: SETTINGS })).toEqual(CHAIN);
  });

  it("reads a fallbackModel written as one string, and names each model once", () => {
    expect(fallbackModels(JSON.stringify({ fallbackModel: "opus" }))).toEqual(["opus"]);
    const settings = JSON.stringify({ fallbackModel: ["fable", "opus"] });
    expect(reviewChain({ agent: AGENT, settings })).toEqual(CHAIN);
  });

  it("starts at the fallbacks when the definition pins no model or inherits one", () => {
    expect(pinnedModel("---\nname: reviewer\n---\n")).toBeNull();
    expect(pinnedModel("---\nname: reviewer\nmodel: inherit\n---\n")).toBeNull();
    expect(reviewChain({ agent: "---\nname: reviewer\n---\n", settings: SETTINGS })).toEqual([
      "opus",
    ]);
    expect(fallbackModels("{}")).toEqual([]);
  });
});

describe("causeOf", () => {
  it("reads the out-of-credits refusal as credits", () => {
    expect(causeOf(CREDITS)).toBe("credits");
    expect(causeOf("API Error: 429 rate_limit_error")).toBe("credits");
  });

  it("reads an overloaded or unanswering model as availability", () => {
    expect(causeOf(OVERLOADED)).toBe("availability");
    expect(causeOf("API Error: 503 service unavailable")).toBe("availability");
    expect(
      causeOf(
        'API Error: 404 {"type":"error","error":{"type":"not_found_error","message":"model: fable"}}',
      ),
    ).toBe("availability");
  });

  // T0.22 TC3 → AC3
  it("reads every other failure as other — a bad request, a key, a tool, a number that is not a status", () => {
    expect(causeOf("API Error: 400 prompt is too long: 212500 tokens > 200000 maximum")).toBe(
      "other",
    );
    expect(causeOf("API Error: 400 max_tokens: 512 is below the thinking budget")).toBe("other");
    expect(causeOf("API Error: 401 authentication_error invalid x-api-key")).toBe("other");
    expect(causeOf("Tool Bash is not available to this agent")).toBe("other");
    expect(causeOf("the reviewer answered with usage limit notes and no verdict")).toBe("other");
    expect(causeOf("")).toBe("other");
    expect(causeOf(undefined)).toBe("other");
  });
});

describe("nextReviewer", () => {
  it("falls back to the next configured model when the pinned one is out of credits", () => {
    expect(nextReviewer({ chain: CHAIN, tried: ["fable"], error: CREDITS })).toEqual({
      chain: CHAIN,
      cause: "credits",
      stop: false,
      model: "opus",
      why: null,
      detail: CREDITS,
    });
  });

  it("falls back on availability too, and matches the models tried whatever their case", () => {
    expect(nextReviewer({ chain: CHAIN, tried: ["Fable"], error: OVERLOADED })).toMatchObject({
      cause: "availability",
      stop: false,
      model: "opus",
    });
  });

  // T0.22 TC3 → AC3
  it("stops on a failure that is neither credits nor availability — the review did not run", () => {
    const error = "API Error: 400 prompt is too long: 212500 tokens > 200000 maximum\nmore";
    expect(nextReviewer({ chain: CHAIN, tried: ["fable"], error })).toEqual({
      chain: CHAIN,
      cause: "other",
      stop: true,
      model: null,
      why: "the reviewer's call failed for a reason that is neither credits nor availability, so the review did not run",
      detail: "API Error: 400 prompt is too long: 212500 tokens > 200000 maximum",
    });
  });

  // T0.22 Rules — a review that could not run at all is a stop, not a pass.
  it("stops when every model in the chain has refused", () => {
    expect(nextReviewer({ chain: CHAIN, tried: ["fable", "opus"], error: CREDITS })).toMatchObject({
      cause: "credits",
      stop: true,
      model: null,
      why: "every model in the configured chain — fable, opus — refused the call, so the review did not run",
    });
    expect(nextReviewer({ chain: [], tried: [], error: CREDITS })).toMatchObject({
      stop: true,
      model: null,
    });
  });

  // T0.22 Rules — never a model the run picks for itself.
  it("stops when the models tried are not the start of the configured chain", () => {
    for (const tried of [["sonnet"], ["opus"], [], ["fable", "sonnet"]]) {
      expect(nextReviewer({ chain: CHAIN, tried, error: CREDITS }), tried.join()).toMatchObject({
        stop: true,
        model: null,
        why: `the models tried (${tried.join(", ") || "none"}) are not the start of the configured chain — fable, opus`,
      });
    }
  });
});

// T0.22 TC1 → AC1
describe("guidelines §5 step 5", () => {
  const guidelines = readFileSync(join(root, "docs/guidelines.md"), "utf8");
  const skill = readFileSync(join(root, ".claude/skills/ticket/SKILL.md"), "utf8");

  /** Step 5's rows of §5's step table, from `5  Review` up to `6  Migration`. */
  const step5 = guidelines.match(/^5 {2}Review[\s\S]*?(?=^6 {2}Migration)/m)?.[0] ?? "";

  it("states the fallback: credits or availability, the configured chain, a fresh session unbriefed", () => {
    expect(step5).toContain("credits or availability");
    expect(step5).toContain("fallbackModel");
    expect(step5).toContain("review-model.mjs");
    expect(step5).toContain("only the model changes");
  });

  it("states the reporting duty and the stop for any other failure", () => {
    expect(step5).toContain("names every pass's model in the report");
    expect(step5).toContain("is a stop");
  });

  it("is what the skill's step 5 tells a run to do", () => {
    const skillStep5 = skill.match(/^## 5 Review\n[\s\S]*?(?=^## 6 )/m)?.[0] ?? "";
    expect(skillStep5).toContain("node scripts/run/review-model.mjs");
    expect(skillStep5).toContain("fallbackModel");
    expect(skillStep5).toContain("`refused`");
  });
});
