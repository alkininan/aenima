import type { Section } from "./scope";

/**
 * How an artifact's body divides into sections — T3.1's addendum, answer 1.
 *
 * "A section is a `##` heading block, its id the heading's slug. Stored content
 * and scoring are unchanged — sectioning is a parse over the stored body, not a
 * new storage shape. Two headings that slug the same get a numeric suffix in
 * document order, so ids stay stable while the document grows."
 *
 * **The parse is lossless.** Every character of the body belongs to exactly one
 * section, heading line included, so joining the sections gives the body back
 * byte for byte. That is what lets a revision of one section be spliced into the
 * document and the result be parsed again for the scope wall: nothing about the
 * other sections can change on the way through except what the revision itself
 * changed.
 *
 * Text before the first `##` heading — a `# Title`, an intro paragraph — is not
 * a `##` block, but it is still text a revision could change, and the wall has
 * to see it to refuse that. So it is a section under `PREAMBLE_ID`, an id no
 * heading can slug to.
 */

/**
 * The id of the text before the first `##` heading, when there is any.
 *
 * A slug is letters, marks, digits and single hyphens with none at either end,
 * so an underscore can never begin one: no heading collides with this.
 */
export const PREAMBLE_ID = "_preamble";

/** What a heading with no letters or digits in it slugs to — `## ???`, `##`. */
export const EMPTY_SLUG = "section";

/**
 * A heading's id: lower case, every run of anything that is not a letter, a
 * combining mark or a digit turned into one hyphen, hyphens trimmed.
 *
 * Letters stay letters in every script — `## Güvenlik` is `güvenlik`, not
 * `g-venlik` — because the workspace writes in EN, TR or NL. Combining marks are
 * kept with them: `İ` lower-cases to `i` plus a combining dot, and dropping the
 * mark would split the word at it. NFC first, so the same heading typed two ways
 * is one id.
 */
export function slugOf(heading: string): string {
  const slug = heading
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? EMPTY_SLUG : slug;
}

/** An opening or closing code fence: three or more backticks or tildes. */
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * A level-2 ATX heading, as CommonMark reads one: up to three spaces, exactly
 * two `#`, then a space, a tab or the end of the line. `###` is not one — the
 * third `#` is where the space would have to be.
 */
const HEADING = /^ {0,3}##(?:[ \t]+(.*?))?[ \t]*$/;

/**
 * The heading's words, or null for a line that is not a level-2 heading.
 *
 * CommonMark's optional closing `#`s are left on: a slug turns every run of
 * non-letters into one hyphen and trims the ends, so `## Risks ##` and
 * `## Risks` are one id without anything here having to know that.
 */
function headingText(line: string): string | null {
  const match = HEADING.exec(line.replace(/\r?\n$/, ""));
  return match ? (match[1] ?? "") : null;
}

/** The body's lines, each keeping its own line ending, so they join back exactly. */
function linesOf(body: string): string[] {
  return body.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

/**
 * The body's sections, in document order.
 *
 * A `##` line inside a fenced code block is code, not a heading: a PRD that
 * shows a markdown snippet must not grow a section from it. A fence closes on
 * the same character, at least as long, with nothing after it but whitespace.
 * An unclosed fence runs to the end of the body, as CommonMark has it.
 */
export function parseSections(body: string): Section[] {
  const blocks: { heading: string | null; text: string }[] = [];
  let current: { heading: string | null; text: string } = { heading: null, text: "" };
  let fence: { char: string; length: number } | null = null;

  for (const line of linesOf(body)) {
    const bare = line.replace(/\r?\n$/, "");
    const fenceMatch = FENCE.exec(bare);

    if (fence) {
      if (
        fenceMatch &&
        fenceMatch[1]![0] === fence.char &&
        fenceMatch[1]!.length >= fence.length &&
        fenceMatch[2]!.trim() === ""
      ) {
        fence = null;
      }
      current.text += line;
      continue;
    }

    // A backtick fence's info string may not contain a backtick; that line is
    // an inline code span, not a fence.
    if (fenceMatch && !(fenceMatch[1]![0] === "`" && fenceMatch[2]!.includes("`"))) {
      fence = { char: fenceMatch[1]![0]!, length: fenceMatch[1]!.length };
      current.text += line;
      continue;
    }

    const heading = headingText(line);
    if (heading !== null) {
      if (current.heading !== null || current.text !== "") blocks.push(current);
      current = { heading, text: line };
      continue;
    }

    current.text += line;
  }
  if (current.heading !== null || current.text !== "") blocks.push(current);

  const used = new Set<string>();
  return blocks.map((block) => {
    if (block.heading === null) {
      used.add(PREAMBLE_ID);
      return { id: PREAMBLE_ID, text: block.text };
    }
    // Document order decides the suffix: the first heading keeps the bare slug,
    // the next one that slugs the same takes `-2`, then `-3`. A suffix that is
    // itself taken — a heading literally called "Overview 2" earlier on — moves
    // on to the next number rather than colliding.
    const slug = slugOf(block.heading);
    let id = slug;
    for (let n = 2; used.has(id); n += 1) id = `${slug}-${n}`;
    used.add(id);
    return { id, text: block.text };
  });
}

/** The body the sections were parsed from. `joinSections(parseSections(b)) === b`. */
export function joinSections(sections: readonly Section[]): string {
  return sections.map((section) => section.text).join("");
}

/**
 * The body with one section's text replaced, and nothing else touched.
 *
 * The one tidy it makes: the section keeps the run of line breaks it ended in.
 * A model returns a section with one trailing newline, two or none whatever it
 * was given, and those are not edits. Without the break the next section's
 * heading would run on from the last line and stop being a heading — a revision
 * refused for a character nobody wrote — and with a blank line dropped or added
 * an unchanged section would read as changed and cut a version for no edit,
 * which invalidates §5's cached results for nothing. That is formatting at the
 * seam, not the author's change, and it is the only one. Everything else in
 * `text` reaches the wall as it came.
 *
 * Throws when the id names no section: the caller asked to revise a section
 * the document does not have, which is a bug and not a round.
 */
export function spliceSection(sections: readonly Section[], id: string, text: string): string {
  const index = sections.findIndex((section) => section.id === id);
  if (index === -1) throw new Error(`no section "${id}" to replace`);
  const breaks = /(?:\r?\n)*$/.exec(sections[index]!.text)![0];
  const kept = `${text.replace(/(?:\r?\n)*$/, "")}${breaks}`;
  return joinSections(
    sections.map((section, i) => (i === index ? { id: section.id, text: kept } : section)),
  );
}
