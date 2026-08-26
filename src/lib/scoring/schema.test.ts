import { describe, expect, it } from "vitest";
import { z } from "zod";

import { allChecks, featurePrdPack, packConditions } from "@/packs";
import type { SkillPack } from "@/packs";

import { maxTokensFor, verdictSchemaFor } from "./schema";

/** A whole answer, so a test can then take one thing away from it. */
function completeAnswer(pack: SkillPack): {
  conditions: Record<string, boolean>;
  results: Record<string, unknown>[];
} {
  return {
    conditions: Object.fromEntries(packConditions(pack).map((c) => [c.id, true])),
    results: allChecks(pack).map((check) => ({
      checkId: check.id,
      passed: true,
      requirementId: "",
      quote: "",
      note: "",
    })),
  };
}

describe("verdictSchemaFor", () => {
  it("accepts an answer that covers every check and every condition", () => {
    const schema = verdictSchemaFor(featurePrdPack);
    expect(schema.safeParse(completeAnswer(featurePrdPack)).success).toBe(true);
  });

  it("accepts a short results array, which is why readAnswer exists", () => {
    // Documented rather than lamented. Anthropic's grammar limit forced the
    // results half from a keyed object to an array (see schema.ts), and an
    // array cannot say "one entry per check". `answer.test.ts` holds the law
    // that replaced it: a run missing an applicable check's verdict is refused,
    // and refusing the run is what keeps a skipped check from scoring as a
    // failure nobody found.
    const answer = completeAnswer(featurePrdPack);
    answer.results = answer.results.slice(0, 3);

    expect(verdictSchemaFor(featurePrdPack).safeParse(answer).success).toBe(true);
  });

  it("rejects an answer that skips a condition", () => {
    // A missing condition is a missing denominator: §4 decides which checks
    // count from these, and defaulting one to false would silently drop a Must.
    const answer = completeAnswer(featurePrdPack);
    delete answer.conditions["user-to-user-or-location"];

    expect(verdictSchemaFor(featurePrdPack).safeParse(answer).success).toBe(false);
  });

  it("rejects a verdict missing a field, because absent is spelled", () => {
    const answer = completeAnswer(featurePrdPack);
    answer.results[0] = { checkId: "prd-1", passed: false, quote: "", note: "no" };

    expect(verdictSchemaFor(featurePrdPack).safeParse(answer).success).toBe(false);
  });

  it("produces a strict JSON Schema with every property required", () => {
    // OpenAI's strict mode requires every property in `required` plus
    // `additionalProperties: false`, and rejects a schema carrying keywords it
    // does not support. This is zod behaviour we depend on and do not control.
    const jsonSchema = z.toJSONSchema(verdictSchemaFor(featurePrdPack), {
      target: "draft-2020-12",
      io: "output",
    }) as unknown as {
      additionalProperties: boolean;
      required: string[];
      properties: {
        results: { items: { required: string[]; additionalProperties: boolean } };
        conditions: { required: string[] };
      };
    };

    expect(jsonSchema.additionalProperties).toBe(false);
    expect(jsonSchema.required.sort()).toEqual(["conditions", "results"]);

    const verdict = jsonSchema.properties.results.items;
    expect(verdict.additionalProperties).toBe(false);
    expect(verdict.required.sort()).toEqual([
      "checkId",
      "note",
      "passed",
      "quote",
      "requirementId",
    ]);

    // Every condition in the pack is asked. This half is still a keyed object,
    // so a missing condition is impossible rather than merely caught.
    expect(jsonSchema.properties.conditions.required.sort()).toEqual(
      packConditions(featurePrdPack)
        .map((condition) => condition.id)
        .sort(),
    );

    // No length keyword: strict mode rejects a schema that carries one, and
    // paying that price would buy back only half a guarantee.
    expect(JSON.stringify(jsonSchema)).not.toContain("minItems");
  });
});

describe("maxTokensFor", () => {
  it("scales with the number of checks rather than being a guessed constant", () => {
    const twenty = maxTokensFor(featurePrdPack);
    const half: SkillPack = { ...featurePrdPack, checks: featurePrdPack.checks.slice(0, 10) };

    expect(twenty).toBeGreaterThan(maxTokensFor(half));
    // Room for a verdict, a quote and a reading per check — and for the
    // thinking block the provider bills against the same ceiling.
    expect(twenty).toBeGreaterThan(700 * allChecks(featurePrdPack).length);
  });
});
