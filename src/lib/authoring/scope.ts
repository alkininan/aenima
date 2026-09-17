/**
 * The scope wall — product-spec.md §6: "A returned section is corrected, not
 * improved."
 *
 * An objection names the one section the author may change. A revision that
 * changes any other section is refused, and the round it was made in counts as
 * spent. It is a wall rather than a request because a wandering fix
 * invalidates the check results cached against sections nobody asked to re-run
 * (§5: "only checks whose artifact changed re-run").
 *
 * This works over a list of sections and says nothing about where the list
 * came from. How an artifact's content divides into sections is not written
 * down anywhere yet (T3.1's Decision), and whichever way that is answered the
 * wall reads the same thing: ids, their text, and their order.
 */

export type Section = {
  /** Unique within one artifact version. */
  id: string;
  text: string;
};

function byId(sections: readonly Section[], side: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const section of sections) {
    // Two sections sharing an id would make "which one changed" unanswerable,
    // and a wall that guessed would let a change through under the other's
    // name. A caller that builds such a list has a bug; it is not data.
    if (map.has(section.id)) throw new Error(`duplicate section id "${section.id}" ${side}`);
    map.set(section.id, section.text);
  }
  return map;
}

/**
 * Every section a revision touched: its text changed, it appeared, it
 * disappeared, or it moved among the sections around it.
 *
 * Text is compared exactly. A whitespace change to another section is a change
 * to another section — it cuts a new version of text a check was cached
 * against, and the wall is not the place to decide that it did not matter.
 *
 * Order is reported as the sections are read: before's order first, then
 * anything that only exists after.
 */
export function sectionsTouched(before: readonly Section[], after: readonly Section[]): string[] {
  const was = byId(before, "before the revision");
  const is = byId(after, "after the revision");
  const touched = new Set<string>();

  for (const [id, text] of was) if (is.get(id) !== text) touched.add(id);
  for (const id of is.keys()) if (!was.has(id)) touched.add(id);

  // A move is a touch. Compare the order of the sections both sides share, so
  // one section added or removed does not read as every later section moving.
  const keptBefore = before.map((s) => s.id).filter((id) => is.has(id));
  const keptAfter = after.map((s) => s.id).filter((id) => was.has(id));
  keptBefore.forEach((id, i) => {
    if (keptAfter[i] !== id) touched.add(id);
  });

  return [...touched];
}

export type ScopeVerdict = { ok: true } | { ok: false; outside: string[] };

/**
 * Whether a revision stayed inside the one section its objection scoped.
 *
 * `outside` names every other section the revision touched, for the ledger:
 * "why was this round spent" is answerable later, the same way "why does this
 * section have an open question" is.
 */
export function checkRevisionScope(
  before: readonly Section[],
  after: readonly Section[],
  scope: string,
): ScopeVerdict {
  byId(before, "before the revision");
  byId(after, "after the revision");
  // The scoped section is the author's to change, and that includes where it
  // sits. Taking it out of both sides first means moving it is not read as a
  // move of the sections it passed — theirs is the order that is compared.
  const others = (sections: readonly Section[]) => sections.filter((s) => s.id !== scope);
  const outside = sectionsTouched(others(before), others(after));
  return outside.length === 0 ? { ok: true } : { ok: false, outside };
}
