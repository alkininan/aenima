import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { featurePrdPack } from "@/packs";
import { allChecks, packConditions } from "@/packs";

import {
  PROTOCOL,
  PROTOCOL_RELEASE,
  PROTOCOL_VERSION,
  assembleContext,
  renderArtifact,
  renderPack,
} from "./prompt";

/**
 * The line between the run's protocol and the pack's prose — the ticket's rule
 * that "a rubric's prose belongs to the pack; the run assembles, it does not
 * author".
 */
describe("assembleContext", () => {
  it("is exactly the protocol and the rendered pack, and nothing else", () => {
    // The load-bearing assertion of this file. Any sentence added to the
    // context — an instruction, an example, a hint about a particular check —
    // has to land in one of the two halves, and one of the two halves is data.
    expect(assembleContext(featurePrdPack)).toBe(`${PROTOCOL}\n\n${renderPack(featurePrdPack)}`);
  });
});

/**
 * The review gate on what the scorer reads.
 *
 * **What used to be here was a substring sweep** asserting that no check's
 * `prose` appeared inside `PROTOCOL`, named "carries no rubric prose in the
 * protocol half". It could only ever catch a copy-paste, and it shipped green
 * while the protocol carried "If two readings of a sentence are possible, give
 * both" — `prd-19`'s standard ("Misreading sweep: no sentence two developers
 * could read two ways"), an 8-point Must, paraphrased into the run layer. A
 * test whose name promises a guarantee it cannot deliver is worse than no test:
 * it spends the reviewer's attention and returns a false all-clear.
 *
 * No assertion can decide what a sentence is *about*, so this does not try.
 * It pins the fingerprint instead. Any edit to `PROTOCOL`, `renderCheck`,
 * `renderPack` or `renderArtifact` — a leaked rubric standard among them —
 * turns this red, and the only way to green is to write the new digest into
 * the diff where a human reviews it. The judgement stays a human's; what the
 * test guarantees is that the human is asked.
 */
describe("PROTOCOL_VERSION", () => {
  it("pins the fingerprint of everything the scorer reads", () => {
    // Changed deliberately? Bump `PROTOCOL_RELEASE`, paste the new digest here,
    // and say in the commit what the model will now read differently. Every
    // stored run misses the cache and re-scores, which is the point.
    expect(PROTOCOL_VERSION).toBe("1.1.0+602d20db225ee669");
  });

  it("carries the release, so a stamp groups by generation", () => {
    // `where protocol_version like '1.1.0%'` is how §5's re-baseline finds the
    // runs one protocol generation produced.
    expect(PROTOCOL_VERSION.startsWith(`${PROTOCOL_RELEASE}+`)).toBe(true);
  });

  it("fits scoring_run_protocol_version_len", () => {
    expect(PROTOCOL_VERSION.length).toBeLessThanOrEqual(40);
  });

  it("moves when the rendering moves, not only when PROTOCOL does", () => {
    // The gap migration 0010 left open: the pack's *rendering* is as much of
    // what the model reads as the protocol is, and nothing versioned it.
    // `renderPack` feeding the fingerprint is what closes that, and this is the
    // assertion that the fingerprint is over the assembly rather than over the
    // constant alone.
    expect(PROTOCOL_VERSION).not.toBe(
      `${PROTOCOL_RELEASE}+${createHash("sha256").update(PROTOCOL, "utf8").digest("hex").slice(0, 16)}`,
    );
  });
});

describe("renderPack", () => {
  it("names every check, its tag and its points", () => {
    const rendered = renderPack(featurePrdPack);

    for (const check of allChecks(featurePrdPack)) {
      expect(rendered).toContain(check.id);
      expect(rendered).toContain(check.prose);
      expect(rendered).toContain(`(${check.tag}, ${check.points} points)`);
    }
  });

  it("asks every condition in the pack's own words", () => {
    const rendered = renderPack(featurePrdPack);

    for (const condition of packConditions(featurePrdPack)) {
      expect(rendered).toContain(`${condition.id}: ${condition.when}`);
    }
  });

  it("stamps the rubric version, which every run has to be readable against", () => {
    expect(renderPack(featurePrdPack)).toContain(
      `RUBRIC ${featurePrdPack.id} version ${featurePrdPack.version}`,
    );
  });

  it("puts a layer's checks under the layer", () => {
    const rendered = renderPack(featurePrdPack);
    const layer = featurePrdPack.layers[0]!;

    const layerAt = rendered.indexOf(`Layer ${layer.id}`);
    const checkAt = rendered.indexOf(layer.checks[0]!.id);

    expect(layerAt).toBeGreaterThan(-1);
    // A model deciding whether the layer applies can see what saying yes brings
    // in — §4's layers enter the denominator rather than leaving it.
    expect(checkAt).toBeGreaterThan(layerAt);
  });
});

describe("renderArtifact", () => {
  it("reads the body the seed and the authoring engine write", () => {
    expect(renderArtifact({ body: "# Ghost mode\n\nOne paragraph." })).toBe(
      "# Ghost mode\n\nOne paragraph.",
    );
  });

  it("falls back to stable JSON for a shape no ticket has defined", () => {
    // Key order is not part of a jsonb value, so two renders of one version
    // must be one string — a quote verifies against this text, and a quote that
    // verified on the way in has to still verify on the way out.
    const one = renderArtifact({ b: 1, a: { d: 4, c: 3 } });
    const other = renderArtifact({ a: { c: 3, d: 4 }, b: 1 });

    expect(one).toBe(other);
  });

  it("survives content that is not an object", () => {
    expect(renderArtifact(null)).toBe("null");
    expect(renderArtifact("plain")).toBe('"plain"');
  });
});
