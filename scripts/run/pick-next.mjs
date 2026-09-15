#!/usr/bin/env node
/**
 * Step 1 — which Ready task a run claims, and what it says about the ones it passes by.
 *
 * The board is ordered the way Linear orders a backlog (T0.17). Priority is Urgent · High ·
 * Medium · Low · None, an empty one read as Medium. Sequencing is the Blockers relation, never
 * a priority tier: a task is blocked while any of its blockers is not Done, and a blocked task
 * is never claimed. A Ready blocker is claimed at the highest priority of any task not Done it
 * blocks, however far down the chain, so work a human marked High is not held up by the Low
 * task in front of it. Ties go to the roadmap: the Epic's name, which carries the phase, then
 * the task's ID read as numbers, phase first, then the oldest created. A task with no Epic, or
 * no ID, sorts after those with one.
 *
 * Three things are said on the board rather than done: a Ready task waiting on a blocker at
 * Backlog — the run never moves a blocker — a loop of tasks blocking each other, and three or
 * more Ready tasks at Urgent. Each is one comment, composed by `comments.mjs`, and `unposted`
 * drops any the pipeline has already said on that thread, so a second run adds nothing.
 *
 * `pickNext` and `unposted` are pure; `readPick` reads the board over the API with the
 * integration token — every task, every epic's name, and only the threads a notice would
 * land on.
 */

import { emit, isMain } from "./cli.mjs";
import { compose, readThread } from "./comments.mjs";
import { client, readBoard, readToken, TOKEN_VAR } from "./notion.mjs";
import { idOf } from "./stale.mjs";

/** Claim order, highest first. */
export const PRIORITIES = ["Urgent", "High", "Medium", "Low", "None"];

/** What an empty Priority reads as. */
export const DEFAULT_PRIORITY = "Medium";

/** How many Ready tasks at Urgent it takes before the run says so. */
export const URGENT_NOTICE_AT = 3;

const rank = (priority) =>
  PRIORITIES.includes(priority)
    ? PRIORITIES.indexOf(priority)
    : PRIORITIES.indexOf(DEFAULT_PRIORITY);

/** A page id as a key, whichever way it was spelled: dashes and case aside. */
const key = (id) =>
  String(id ?? "")
    .replaceAll("-", "")
    .toLowerCase();

/** `T3.10 Slice` → `[3, 10]`; null when the name carries no ID. */
const idParts = (name) => {
  const id = idOf(name);
  return id === null ? null : id.slice(1).split(".").map(Number);
};

/** How a task is named in a comment: its ID, or its whole name when it has none. */
const label = (row) => idOf(row.Name) ?? row.Name;

const natural = (a, b) => a.localeCompare(b, "en", { numeric: true });

/** Order by the roadmap alone: Epic name, ID, created, name. Absent sorts last. */
function byRoadmap(epicName) {
  const last = (a, b, compare) =>
    a === null && b === null ? 0 : a === null ? 1 : b === null ? -1 : compare(a, b);
  return (a, b) =>
    last(epicName(a), epicName(b), natural) ||
    last(idParts(a.Name), idParts(b.Name), (x, y) => x[0] - y[0] || x[1] - y[1]) ||
    String(a.created ?? "").localeCompare(String(b.created ?? "")) ||
    natural(a.Name, b.Name);
}

/**
 * The blocked-by loops among tasks not Done: Tarjan's strongly connected components over
 * task → blocker, keeping the components of two or more and the task that lists itself.
 */
function loops(rows, blockersOf) {
  const index = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const found = [];
  let next = 0;

  const visit = (row) => {
    index.set(row, next);
    low.set(row, next);
    next += 1;
    stack.push(row);
    onStack.add(row);
    for (const blocker of blockersOf(row)) {
      if (!index.has(blocker)) {
        visit(blocker);
        low.set(row, Math.min(low.get(row), low.get(blocker)));
      } else if (onStack.has(blocker)) {
        low.set(row, Math.min(low.get(row), index.get(blocker)));
      }
    }
    if (low.get(row) !== index.get(row)) return;
    const component = [];
    let member;
    do {
      member = stack.pop();
      onStack.delete(member);
      component.push(member);
    } while (member !== row);
    if (component.length > 1 || blockersOf(row).includes(row)) found.push(component);
  };

  for (const row of rows) if (!index.has(row)) visit(row);
  return found;
}

/**
 * The whole decision over `rows` — Tasks rows as `notion.mjs` reads them, every status — and
 * `epics`, `{ id, Name }`. Returns:
 *
 *   pick     the task to claim, with `as`, the priority it is claimed at; null when none
 *   queue    every claimable task in claim order, each with `as`
 *   blocked  the Ready tasks passed by, `{ Name, by }`, `by` naming the blockers not Done
 *   cycles   each loop with a Ready member, its members named in roadmap order
 *   notices  `{ id, url, Name, kind, text }` — the comments the run would post, not yet
 *            checked against the threads (`unposted` does that)
 */
export function pickNext(rows = [], { epics = [], prefix = "⟡ " } = {}) {
  const byKey = new Map(rows.map((row) => [key(row.id), row]));
  const epicNames = new Map(epics.map((epic) => [key(epic.id), epic.Name]));
  const epicName = (row) => epicNames.get(key(row.Epic?.[0])) ?? null;
  const roadmap = byRoadmap(epicName);

  const open = (row) => row.Status !== "Done";
  // A blocker the board no longer lists — a page moved to the trash — is not a row, and blocks
  // nothing.
  const blockersOf = (row) =>
    (row.Blockers ?? []).map((id) => byKey.get(key(id))).filter((b) => b !== undefined && open(b));

  const pending = rows.filter(open);
  const dependents = new Map(pending.map((row) => [row, []]));
  for (const row of pending)
    for (const blocker of blockersOf(row)) dependents.get(blocker).push(row);

  // The highest priority of the task itself and of every task not Done it blocks, transitively.
  const lifted = (row) => {
    let best = rank(row.Priority);
    const seen = new Set([row]);
    const walk = [...dependents.get(row)];
    while (walk.length > 0) {
      const dependent = walk.pop();
      if (seen.has(dependent)) continue;
      seen.add(dependent);
      best = Math.min(best, rank(dependent.Priority));
      walk.push(...dependents.get(dependent));
    }
    return PRIORITIES[best];
  };

  const ready = rows.filter((row) => row.Status === "Ready");
  const queue = ready
    .filter((row) => blockersOf(row).length === 0)
    .map((row) => ({ ...row, as: lifted(row) }))
    .sort((a, b) => rank(a.as) - rank(b.as) || roadmap(a, b));

  const blocked = ready
    .filter((row) => blockersOf(row).length > 0)
    .sort(roadmap)
    .map((row) => ({ Name: row.Name, by: blockersOf(row).sort(roadmap).map(label) }));

  const components = loops(pending, blockersOf)
    .map((component) => component.slice().sort(roadmap))
    .filter((component) => component.some((row) => row.Status === "Ready"))
    .sort((a, b) => roadmap(a[0], b[0]));
  const loopOf = new Map(
    components.flatMap((component) => component.map((row) => [row, component])),
  );

  const notice = (row, kind, fields) => ({
    id: row.id,
    url: row.url,
    Name: row.Name,
    kind,
    text: compose(kind, fields, prefix),
  });

  // A loop is named once, on its first Ready member in roadmap order.
  const cycleNotices = components.map((component) =>
    notice(
      component.find((row) => row.Status === "Ready"),
      "cycle",
      { members: component.map(label) },
    ),
  );

  // A blocker inside the task's own loop is said by the loop's notice, not again here.
  const waitingNotices = ready
    .slice()
    .sort(roadmap)
    .map((row) => ({
      row,
      backlog: blockersOf(row)
        .filter((b) => b.Status === "Backlog" && !(loopOf.get(row)?.includes(b) ?? false))
        .sort(roadmap),
    }))
    .filter(({ backlog }) => backlog.length > 0)
    .map(({ row, backlog }) => notice(row, "waiting", { blockers: backlog.map(label) }));

  const urgent = ready.filter((row) => row.Priority === "Urgent");
  const newest = urgent
    .slice()
    .sort(
      (a, b) =>
        String(b.created ?? "").localeCompare(String(a.created ?? "")) || natural(a.Name, b.Name),
    )
    .at(0);
  const urgentNotices =
    urgent.length >= URGENT_NOTICE_AT ? [notice(newest, "urgent", { count: urgent.length })] : [];

  return {
    pick: queue[0] ?? null,
    queue,
    blocked,
    cycles: components.map((component) => component.map(label)),
    notices: [...cycleNotices, ...waitingNotices, ...urgentNotices],
  };
}

/**
 * The notices the threads have not seen. A notice is dropped when the pipeline has already
 * posted those exact words on that task's thread — the "once" of T0.17 — and when the thread
 * holds a human reply still waiting for an answer: a prefixed comment there would read as the
 * reply having been answered.
 */
export async function unposted(notices, commentsOf, prefix = "⟡ ") {
  const kept = [];
  for (const notice of notices) {
    const thread = readThread(await commentsOf(notice.id), prefix);
    const said = thread.pipeline.some((comment) => comment.text.trim() === notice.text.trim());
    if (!said && thread.unanswered.length === 0) kept.push(notice);
  }
  return kept;
}

/** The whole step-1 read for `dir`: token, board, every task, the epic names, the threads. */
export async function readPick({ dir = process.cwd(), deps = {} } = {}) {
  const token = deps.token ? deps.token() : readToken(dir);
  if (token === null) {
    return {
      token: false,
      why: `${TOKEN_VAR} is not in .env.local, so the board's Blockers and threads cannot be read`,
      pick: null,
      queue: [],
      blocked: [],
      cycles: [],
      notices: [],
    };
  }
  const board = deps.board ? deps.board() : readBoard(dir);
  const api = deps.client ?? client(token, { fetch: deps.fetch });
  const prefix = board.prefix ?? "⟡ ";
  const rows = await api.tasks(board.tasks_ds);
  // An Epics row reads through the same shape: its id and its Name are all the order needs.
  const epics = await api.tasks(board.epics_ds);
  const result = pickNext(rows, { epics, prefix });
  const notices = await unposted(result.notices, (id) => api.comments(id), prefix);
  return { token: true, ...result, notices };
}

/** CLI: `node pick-next.mjs`, run from the checkout. */
async function main() {
  emit(await readPick());
}

if (isMain(import.meta.url)) await main();
