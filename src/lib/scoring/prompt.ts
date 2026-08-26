import { createHash } from "node:crypto";

import { packConditions } from "@/packs";
import type { SkillPack } from "@/packs";

/**
 * What the scorer is told, and where the line falls between this file and the
 * pack — product-spec.md §5, §7 and §12.
 *
 * **The protocol is the run's; the rubric's prose is the pack's.** Everything
 * below is about *how to answer* — that a check is binary, that a failure
 * quotes the artifact rather than paraphrasing it, that a condition is a
 * separate question from a verdict. None of it is about what any particular
 * rubric asks, and none of it changes when a second pack ships. The alternative
 * — a protocol copied into each pack — would let two packs disagree about what
 * "pass" means, and a rubric review would have to read past the same three
 * paragraphs five times to reach the checks.
 *
 * `assembleContext` is therefore exactly `PROTOCOL + renderPack(pack)` and
 * `prompt.test.ts` asserts that equality, so rubric prose cannot leak into the
 * protocol without the suite going red.
 *
 * The split is also §12's cache split. The context repeats across every scoring
 * call for a pack version and is what a provider caches; the artifact is the
 * part that changes and goes in `input`, last.
 */

/**
 * The protocol's release number — the readable half of `PROTOCOL_VERSION`.
 *
 * **Editing `PROTOCOL` changes verdicts**, exactly as editing a rubric does —
 * it is the instruction the model scores against. §5 promises a re-baseline
 * "so numbers never wobble without explanation" when a rubric moves, and the
 * pack version is what makes that findable; without a version here the same
 * promise did not cover the half of the prompt that lives in this repo. A run
 * stamped with an old protocol version is a run to re-score, and the cache key
 * carrying it means the next run does that by itself.
 *
 * Semver, like a pack's. **Bump it whenever anything in this file changes what
 * the scorer reads** — which is nearly any change, so bump on any edit that is
 * not a typo. Cheap: the cost of bumping needlessly is one re-score, and the
 * cost of not bumping is two incomparable numbers with no way to tell them
 * apart.
 *
 * Forgetting to bump it is not, however, load-bearing: `PROTOCOL_VERSION`
 * appends a fingerprint of the assembled context, and that moves whether or not
 * anybody remembers this number. The release is here so a human can read a
 * stamp and know which generation of the protocol produced it.
 */
export const PROTOCOL_RELEASE = "1.1.0";

/**
 * The scoring protocol. No rubric content, no artifact content, no example
 * phrased in the words of any particular check.
 *
 * §1 law 3 ("evidence or nothing") and §5's binary law are the whole of it.
 * The rule about a quote being verbatim is stated here *and* enforced in code
 * after the answer arrives — the model is told because it can then comply, and
 * the code checks because §1 law 3 cannot rest on compliance.
 */
export const PROTOCOL = `You are scoring one artifact against one rubric.

Answer in two parts.

CONDITIONS. Each condition below describes something that may or may not be
true of this artifact. Decide each one from the artifact alone. A condition is
not a verdict about quality — it decides which checks are being asked at all.

CHECKS. Return one verdict per check, naming the check by its id. Every check
listed below gets exactly one, including checks whose condition you decided does
not hold — a verdict you leave out fails the whole run rather than skipping that
check. Never invent a check id that is not listed.

A verdict is binary: the artifact satisfies the check or it does not. There is
no partial credit, no confidence, and no score — a check you are unsure about
has not been satisfied.

A failing verdict carries the gap:

- quote: the exact text from the artifact that the gap lives in, copied
  character for character. Never a paraphrase, never a summary, never a
  sentence you composed. If the check fails because something is *absent* —
  there is nothing in the artifact to point at — leave it empty.
- note: what is wrong, in one or two sentences. Say the specific gap, not the
  check restated.
- requirementId: the artifact's own label for the requirement or story the gap
  sits in, if it has one and the gap sits in one. This is the artifact's
  identifier for its own content, not the check's id. Otherwise leave it empty.

A passing verdict carries none of the three. Leave all three empty.

Write every note in English.`;

/** One line per check: id, tag, points, and the check itself. Pack words only. */
function renderCheck(check: {
  id: string;
  prose: string;
  tag: string;
  points: number;
  appliesWhen?: { id: string } | undefined;
}): string {
  const condition = check.appliesWhen ? ` [only when: ${check.appliesWhen.id}]` : "";
  return `${check.id} (${check.tag}, ${check.points} points)${condition}: ${check.prose}`;
}

/**
 * The pack, as the scorer reads it.
 *
 * Every string in the output comes from the pack: check ids, `prose`, tags,
 * points and each condition's `when`, which §4 carries "in the spec's own
 * words, so that the agent that evaluates it and the human who reviews the pack
 * read the same sentence". The scaffolding around them is punctuation and
 * headings, which is what "the run assembles, it does not author" leaves it.
 *
 * A layer's checks are rendered under the layer so that a model deciding a
 * layer's condition can see what turning it on brings in — §4's layers "float
 * above all types" and enter the denominator rather than leaving it.
 */
export function renderPack(pack: SkillPack): string {
  const conditions = packConditions(pack)
    .map((condition) => `${condition.id}: ${condition.when}`)
    .join("\n");

  const checks = pack.checks.map(renderCheck).join("\n");

  const layers = pack.layers
    .map((layer) =>
      [
        `Layer ${layer.id} — applies only when: ${layer.appliesWhen.id}`,
        ...layer.checks.map(renderCheck),
      ].join("\n"),
    )
    .join("\n\n");

  return [
    `RUBRIC ${pack.id} version ${pack.version}`,
    "",
    "CONDITIONS",
    conditions.length > 0 ? conditions : "(none)",
    "",
    "CHECKS",
    checks,
    ...(layers.length > 0 ? ["", layers] : []),
  ].join("\n");
}

/**
 * The stable prefix of a scoring call: protocol, then rubric.
 *
 * Stable per pack version, which is what makes it worth caching and what makes
 * a cache key out of the pack version alone honest.
 */
export function assembleContext(pack: SkillPack): string {
  return `${PROTOCOL}\n\n${renderPack(pack)}`;
}

/**
 * The artifact, as text the model reads and a quote can be checked against.
 *
 * `artifact_version.content` is jsonb and no ticket has defined a document
 * model for it; the shape in use is `{ body: string }`, which the seed writes
 * and the authoring engine (§6, Phase 3) will replace with something richer.
 * So this reads `body` when it is a string and falls back to stable JSON for
 * anything else, rather than inventing a schema this ticket was not given.
 *
 * **Whatever this returns is what a quote is checked against**, so the fallback
 * has to be deterministic: two renders of one version must produce one string,
 * or a quote could verify on the way in and fail on the way out.
 */
export function renderArtifact(content: unknown): string {
  if (content !== null && typeof content === "object" && "body" in content) {
    const { body } = content as { body: unknown };
    if (typeof body === "string") return body;
  }
  return JSON.stringify(sortKeys(content), null, 2);
}

/** Key order is not part of a jsonb value, so it cannot be part of the render. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return Object.fromEntries(entries.map(([key, inner]) => [key, sortKeys(inner)]));
}

/* -------------------------------------------------------------------------- */
/* The version, and why it is computed rather than typed                      */
/* -------------------------------------------------------------------------- */

/**
 * A pack that exists only to be rendered.
 *
 * **Not a rubric, and never registered.** Its job is to hold one of everything
 * `renderPack` and `renderCheck` know how to draw — a plain check, a check
 * carrying a condition, a layer with a condition and a check inside it — so
 * that the fingerprint below moves when the *rendering* moves. Drop the
 * `[only when: …]` suffix from `renderCheck`, stop printing points, reorder the
 * headings: every one of those changes what a model reads, and every one of
 * them changes this render.
 *
 * A real pack would work too and would be worse: it would fold rubric content
 * into a number that is supposed to describe the layer above the rubric, and a
 * pack edit would then move both stamps. Keeping the fixture synthetic keeps
 * `pack_version` and `protocol_version` answering two different questions.
 */
const FINGERPRINT_PACK: SkillPack = {
  id: "fingerprint",
  version: "0.0.0",
  artifactKind: "prd",
  checks: [
    { id: "f-1", prose: "A check that always applies", tag: "must", points: 1 },
    {
      id: "f-2",
      prose: "A check that can leave the denominator",
      tag: "should",
      points: 1,
      appliesWhen: { id: "f-condition", when: "the condition the pack states" },
    },
  ],
  layers: [
    {
      id: "f-layer",
      appliesWhen: { id: "f-layer-condition", when: "the condition the layer states" },
      checks: [{ id: "f-3", prose: "A check a layer brings in", tag: "must", points: 1 }],
    },
  ],
  interview: [],
};

/** One of each shape `renderArtifact` handles: the body path, and the fallback. */
const FINGERPRINT_CONTENT = [{ body: "# Body" }, { b: 1, a: { d: 4, c: 3 } }, null];

/**
 * Everything in this file that reaches a model, as one string.
 *
 * `assembleContext` is the context; `renderArtifact` produces the input and
 * decides what a quote is checked against. Both belong in the fingerprint, and
 * nothing else in this file does.
 */
function fingerprintSubject(): string {
  return [
    assembleContext(FINGERPRINT_PACK),
    ...FINGERPRINT_CONTENT.map((content) => renderArtifact(content)),
  ].join("\n\u0000\n");
}

/**
 * The protocol's version: a release a human reads, and a digest that holds.
 *
 * §5's cache key has to carry every input that decides a verdict. Migration
 * 0010 put the protocol in it and stopped one layer short — `PROTOCOL` was
 * versioned, and `renderCheck`, `renderPack` and `renderArtifact` were not,
 * though the model reads their output just as directly. Editing `renderCheck`
 * to stop printing a check's points would change every verdict in the product
 * and hit the cache on all of them.
 *
 * **So the version is computed, not typed.** The digest is sha-256 over the
 * rendered fixture above, truncated to 16 hex characters — 64 bits against a
 * population of a few dozen protocol generations over the product's life, which
 * is not a collision anybody will see. A change to any of the three renderers
 * moves it, a change to `PROTOCOL` moves it, and a re-score follows without
 * anyone having remembered anything.
 *
 * Semver build metadata is the shape (`1.1.0+9f3c…`), so the release still
 * groups: `where protocol_version like '1.1.0%'`. 22 characters against the
 * column's 40.
 *
 * `prompt.test.ts` pins this value. That is the review gate the substring test
 * it replaced could not be: any edit to what the scorer reads turns the suite
 * red and has to be acknowledged in the diff.
 */
export const PROTOCOL_VERSION = `${PROTOCOL_RELEASE}+${createHash("sha256")
  .update(fingerprintSubject(), "utf8")
  .digest("hex")
  .slice(0, 16)}`;
