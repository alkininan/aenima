#!/usr/bin/env node
/**
 * Step 0a — reading a Decision thread, and the voice of every comment the run posts
 * (docs/guidelines.md §4).
 *
 * The pipeline's own comments all begin with the prefix glyph; everything else on the thread
 * is the human's. A human comment newer than the last prefixed one is the answer this run
 * must assess, and it gets *exactly one* assessment. After two clarifying rounds on the same
 * question the pipeline stops asking and only reads — the two-round cap of §6, applied to
 * the board.
 *
 * `compose` writes every comment a run can post, in plain sentences: what it hit, why it
 * could not pick alone, what it chose or would choose. No labels — where the gap lives is
 * said in words. The texts live here so they are one place and tested; the skill supplies
 * the sentences that need judgment and never the shape.
 *
 * Since T0.11 every task's thread is read, not only a Decision's, and a reply's shape is
 * partly countable: `mentions` and `permitted` say whether the human's word — `merge`,
 * `apply`, and since T0.17 `ready` — is on the thread, and the guard asks the same question
 * of the API before it lets the command or the status write through. `shapeOf` names the
 * countable shapes; the rest is `assess`.
 *
 * Since T0.20 a comment's kind is read back from its own words — the fixed part of the sentence
 * `compose` wrote (`kindOf`) — so the cap counts clarifying rounds and nothing else, and
 * `mayPost` is the one place that says whether a comment of a kind may post: the preflight
 * reads it for a clarifying round, the guard for every comment the run sends.
 *
 * Pure. Deciding whether an answer resolves a question, or whether a reply is a change to
 * the ticket or new work, is the skill's, and is the one thing here that is not countable.
 */

import { emit, isMain, readStdin } from "./cli.mjs";

/**
 * Clarifying rounds on one question before the run stops asking and waits (§4) — the
 * consecutive clarifying comments since the pipeline last said anything else on the thread.
 */
export const CLARIFYING_CAP = 2;

const at = (comment) => String(comment?.created_time ?? "");

/**
 * Comments that neither ask nor answer anything on the thread's question: a notice about the
 * board's order — a task waiting on a blocker, a loop, the Urgent count — posted by step 1
 * without reading a reply, and a prefixed comment no composer wrote, whose words the count
 * cannot place. A run of clarifying rounds reads through them (review pass 1, Must 1).
 */
const NOTICES = new Set(["waiting", "cycle", "urgent", null]);

/**
 * Split a thread and say what the run may do with it.
 *
 * Returns `{ pipeline, human, unanswered, clarifyingRounds }`:
 *   pipeline          prefixed comments, oldest first, each with the `kind` its words carry
 *   unanswered        human comments newer than the last prefixed one that answered something,
 *                     oldest first. A `refused` comment is not one: it reports an attempt that
 *                     failed, and the word that granted the attempt outlives it (T0.24).
 *   clarifyingRounds  clarifying comments since the pipeline last asked or answered anything
 *                     else on the thread. Human replies between them do not end the run of
 *                     rounds — every round answers one — and nor does a notice about the
 *                     board's order (`NOTICES`), which asks and answers nothing; any other
 *                     comment does: a question opened, a reply read as the answer, a note.
 *                     That is the reply resetting the count, once the run has answered it as
 *                     something other than unclear.
 */
export function readThread(comments = [], prefix = "⟡ ") {
  const ordered = comments.slice().sort((a, b) => at(a).localeCompare(at(b)));
  const isPipeline = (comment) => String(comment?.text ?? "").startsWith(prefix);

  const pipeline = ordered
    .filter(isPipeline)
    .map((comment) => ({ ...comment, kind: kindOf(comment.text, prefix) }));
  const human = ordered.filter((comment) => !isPipeline(comment));
  // A refusal reports an attempt that failed; it does not answer the reply that asked for it,
  // so the word the reply carries is still granted and the next run acts on it rather than
  // asking for it again (T0.24, AC5). `awaitingMigration` has read past a refusal since T0.20
  // for the same reason: the question it reported on is still the question standing.
  const answered = pipeline.findLast((comment) => comment.kind !== "refused");
  const lastPipelineAt = answered === undefined ? "" : at(answered);

  let clarifyingRounds = 0;
  for (const comment of [...pipeline].reverse()) {
    if (NOTICES.has(comment.kind)) continue;
    if (comment.kind !== "clarifying") break;
    clarifyingRounds += 1;
  }

  return {
    pipeline,
    human,
    unanswered: human.filter((comment) => at(comment) > lastPipelineAt),
    clarifyingRounds,
  };
}

/** A time the API gives to the minute, as milliseconds: `since` floored the same way. */
const minuteOf = (time) => {
  const ms = Date.parse(String(time ?? ""));
  return Number.isNaN(ms) ? null : ms - (ms % 60_000);
};

/**
 * Whether the run may post a comment of `kind` on `thread` now — `{ ok, why }`, the one place
 * that says so (§4). The preflight asks it for a clarifying round; the guard asks it for every
 * comment, with the kind read from the words and `since` the claim's start when the marker's
 * claim is this thread's task.
 *
 *   - A clarifying round past the cap waits: two on one question, and the run stops asking.
 *   - The same kind twice in one claim waits: uncapped is not unlimited. A comment's time
 *     comes from the API to the minute, so the claim's first minute counts as the claim's.
 *   - A refusal the thread already carries word for word waits, whatever claim it is from
 *     (T0.24). A word outlives a refusal now, so the run makes the attempt again every hour
 *     until the thing in the way is settled, and saying the same sentence every hour tells
 *     the human nothing: §5 step 1's rule that words already on the thread are not said
 *     again, one door along. A refusal that says something new posts as before.
 *
 * Every other comment posts, whatever the thread holds. A stop, a default taken, a merge, a
 * gated diff, a notice, a refusal: each tells the human something new, and the cap is never the
 * reason a human is not told.
 */
export function mayPost(thread, kind, { since = null, text = null } = {}) {
  if (kind === "refused" && text !== null) {
    const standing = (thread?.pipeline ?? []).findLast((comment) => comment.kind === "refused");
    if (standing !== undefined && sameWords(standing.text, text)) {
      return {
        ok: false,
        why: "this refusal is already the newest one on the thread, word for word — the attempt is made again each run until what stands in the way is settled, and saying so again says nothing new",
      };
    }
  }
  if (kind === "clarifying" && (thread?.clarifyingRounds ?? 0) >= CLARIFYING_CAP) {
    return {
      ok: false,
      why: "the open question on this thread has had two clarifying rounds, which is the cap — the run waits for an answer it can place",
    };
  }
  const from = since === null ? null : minuteOf(since);
  if (from !== null) {
    const earlier = (thread?.pipeline ?? []).find(
      (comment) => comment.kind === kind && (Date.parse(at(comment)) || 0) >= from,
    );
    if (earlier !== undefined) {
      return {
        ok: false,
        why: `this claim already posted ${kind === null ? "a comment no composer wrote" : `a ${kind} comment`} on this thread, at ${at(earlier)} — one comment of a kind per claim, so say everything of that kind in the one`,
      };
    }
  }
  return { ok: true, why: null };
}

/**
 * Two comments saying the same thing: whitespace and the markdown the API strips aside. The
 * text a thread hands back has been through Notion and back, so an exact string match on what
 * the composer wrote would never hold.
 */
const sameWords = (a, b) => words(a) === words(b);

const words = (text) =>
  String(text ?? "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * True when a reply *begins* with the word — `merge`, `Merge it`, `apply, then carry on` —
 * case aside and punctuation aside. "Don't merge yet" and "after you merge" do not begin
 * with it, which is the whole of the rule: the word is the reply's point, not a mention in
 * passing (docs/guidelines.md §4). The guard and the preflight read the same test.
 */
export function mentions(text, word) {
  return new RegExp(`^\\W*${word}\\b`, "i").test(String(text ?? "").trim());
}

/**
 * The human's word, when the thread carries it: the *newest* reply, newer than the
 * pipeline's last comment, begins with `word`. Only the newest, so "merge" followed by
 * "wait, don't merge yet" grants nothing — the last word is the word (review pass 2). The
 * pipeline's own comments never count, whatever they say; a `⟡ merged` note is the pipeline
 * consuming the word, not repeating it.
 */
export function permitted(word, comments = [], prefix = "⟡ ") {
  const thread = readThread(comments, prefix);
  const newest = thread.unanswered.at(-1) ?? null;
  const found = newest !== null && mentions(newest.text, word) ? newest : null;
  return {
    ok: found !== null,
    comment: found,
    why:
      found === null
        ? `no reply beginning with "${word}" as the newest reply since the run's last comment on the thread`
        : null,
  };
}

/** The sentence every migration comment carries, which is how a thread says it waits on one. */
export const MIGRATION_PHRASE = "This change adds a migration";

/**
 * True when the pipeline's last comment on the thread is the migration question — reading past
 * a refusal, which reports an apply that failed and leaves the question standing (T0.20).
 */
export function awaitingMigration(thread) {
  const asked = (thread?.pipeline ?? []).findLast((comment) => comment.kind !== "refused");
  return String(asked?.text ?? "").includes(MIGRATION_PHRASE);
}

/**
 * The part of a reply's shape that is countable. `merge` is a Review task whose unanswered
 * reply begins with the word; `apply` is a Decision task waiting on a migration whose reply
 * begins with the word; `ready` is a Backlog task whose reply begins with the word — the
 * human's go, said on the thread rather than clicked (T0.17). Everything else is `assess`:
 * change, new work, an answer that resolves a question, a note, or a reply that needs a
 * clarifying round — the skill's call.
 */
export function shapeOf(status, thread) {
  const newest = thread?.unanswered?.at(-1) ?? null;
  const said = (word) => newest !== null && mentions(newest.text, word);
  if (status === "Review" && said("merge")) return "merge";
  if (status === "Decision" && awaitingMigration(thread) && said("apply")) return "apply";
  if (status === "Backlog" && said("ready")) return "ready";
  return "assess";
}

/** The things a run says on a thread. */
export const KINDS = [
  "decision",
  "clarifying",
  "migration",
  "stale",
  "default",
  "change",
  "newWork",
  "merged",
  "applied",
  "noted",
  "setup",
  "resolved",
  "gated",
  "reverted",
  "readied",
  "waiting",
  "cycle",
  "urgent",
  "refused",
];

/**
 * Each kind's signature: the fixed words of its sentence, which the composer always writes and
 * a field it is handed is unlikely to. Tried in this order, first match wins — `setup` before
 * `decision`, which shares its opening, and `refused`, whose opening is the caller's, last. The
 * words carry no markdown, so the text the API hands back (markers stripped) matches too.
 */
const SIGNATURES = [
  ["setup", /^I've stopped on a step only you can do: /],
  ["decision", /^I've stopped on /],
  ["clarifying", /^Thanks, I read that, but it still fits two readings: /],
  ["migration", /^This change adds a migration, /],
  ["stale", /^This run stopped partway on /],
  [
    "default",
    / A wrong guess here costs nothing to change, so I went with [\s\S]+ and kept going\. Say the word if you'd rather something else\.$/,
  ],
  ["change", /^I've read that as a change to this ticket and folded it into the body /],
  ["newWork", /^I've read that as new work rather than a change to this ticket, /],
  ["merged", /^Merged into main at .+ with a merge commit, and the task is Done\./],
  ["applied", /^Applied .+\. The ticket picks up from where it stopped\.$/],
  ["noted", /^Read that, thanks\. Nothing for me to do here, /],
  ["resolved", /^Read that as the answer, thanks\. /],
  [
    "gated",
    /^This ticket is built, reviewed and green, but the diff is one only your word merges: /,
  ],
  ["reverted", /^The deploy check after this merge failed: /],
  ["readied", /^Read that as your go, so the task is Ready\. /],
  ["waiting", /^This task is waiting on .+, so runs pass it by for now\. /],
  [
    "cycle",
    /^(This task lists itself|.+ are each waiting on the other|.+ wait on each other in a loop)[^.]* Blockers, so no run can pick (it|either|any of them)\. Take .+ picked up in (its|their) turn\.$/,
  ],
  ["urgent", /^\d+ tasks are Urgent; running them in roadmap order\.$/],
  ["refused", /^.+? was refused: /],
];

/**
 * The kind a comment's words carry, or null — for a human's comment, and for a prefixed one no
 * composer wrote. Every comment `compose` writes reads back as the kind it was composed as; the
 * comments already on the board, written before kinds were read, read the same way.
 */
export function kindOf(text, prefix = "⟡ ") {
  const whole = String(text ?? "");
  if (!whole.startsWith(prefix)) return null;
  const body = whole.slice(prefix.length);
  return SIGNATURES.find(([, signature]) => signature.test(body))?.[0] ?? null;
}

/** A sentence ends in one full stop, whatever the caller handed in. */
const sentence = (text) => {
  const trimmed = String(text ?? "").trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

/** A clause with no trailing full stop, to sit inside a sentence. */
const clause = (text) =>
  String(text ?? "")
    .trim()
    .replace(/\.$/, "");

/** Names in a sentence: `a`, `a and b`, `a, b and c`. */
const listed = (items) => {
  const names = (items ?? []).map(clause);
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
};

/**
 * One comment, prefixed, two to four plain sentences.
 *
 *   decision    { stopped, gap, fallback }  — what it stopped on, where the gap lives in
 *               words, what "default" would take
 *   clarifying  { readings: [a, b], fallback }
 *   migration   { file }
 *   stale       { date, branch }            — branch null when the run died before making one
 *   default     { gap, choice }             — a choice cheap to undo, taken and said
 *   change      {}                          — a Review reply folded in as an addendum
 *   newWork     { name, url }               — a reply drafted as its own Backlog task
 *   merged      { commit }                  — the human's "merge", done
 *   applied     { file }                    — the human's "apply", done
 *   noted       {}                          — a reply that asks for nothing
 *   setup       { step, where }             — a step only a human can do, said exactly
 *   resolved    {}                          — a Decision answer read as resolving: Ready
 *   gated       { reasons: [{ rule, ungate }] } — a diff only the word merges: a migration,
 *               or a restraint this diff weakens. Each reason names the rule it trips and
 *               what would ungate it (T0.21); `gated.mjs` measures them
 *   reverted    { failed, merge, commit, name, url } — a merge whose deploy check failed
 *   readied     {}                          — the human's "ready" on a Backlog task, done
 *   waiting     { blockers }                — a Ready task skipped for a blocker not Ready
 *   cycle       { members }                 — tasks that block each other, none pickable
 *   urgent      { count }                   — three or more Ready tasks at Urgent (T0.17's
 *               own sentence, and the one kind that is a single sentence)
 *   refused     { what, why, files, settle } — a step the guard let through that failed
 *               anyway: GitHub refusing a merge, a migration erroring, a claim that could
 *               not go on. `files` those in conflict, empty or absent when none (T0.20)
 */
export function compose(kind, fields = {}, prefix = "⟡ ") {
  switch (kind) {
    case "decision":
      return `${prefix}I've stopped on ${clause(fields.stopped)}. ${sentence(fields.gap)} If you say "default" I'll ${clause(fields.fallback)}.`;
    case "clarifying": {
      const [a, b] = fields.readings ?? [];
      return `${prefix}Thanks, I read that, but it still fits two readings: ${clause(a)}, or ${clause(b)}. If you say "default" I'll ${clause(fields.fallback)}.`;
    }
    case "migration":
      return `${prefix}This change adds a migration, ${clause(fields.file)}, and applying it to the shared database is your call. I've left it in the diff and stopped here. Say "apply" on this thread and the next run applies it and picks the ticket back up from there.`;
    case "stale":
      return fields.branch
        ? `${prefix}This run stopped partway on ${clause(fields.date)}. I've kept the branch as ${clause(fields.branch)} in case anything on it is worth salvaging, and started again from main.`
        : `${prefix}This run stopped partway on ${clause(fields.date)} before it made a branch, so there's nothing to salvage. I've started again from main.`;
    case "default":
      return `${prefix}${sentence(fields.gap)} A wrong guess here costs nothing to change, so I went with ${clause(fields.choice)} and kept going. Say the word if you'd rather something else.`;
    case "change":
      return `${prefix}I've read that as a change to this ticket and folded it into the body as an addendum. The task is back at Ready; the next run builds it on the same branch and pull request and brings it back to Review.`;
    case "newWork":
      return `${prefix}I've read that as new work rather than a change to this ticket, so I've drafted it as its own task at Backlog: ${clause(fields.name)} (${clause(fields.url)}). Set it Ready when you want it built.`;
    case "merged":
      return `${prefix}Merged into main at ${clause(fields.commit)} with a merge commit, and the task is Done. The release row follows.`;
    case "applied":
      // Two forms, like `stale`'s: an apply that found the database already current applied
      // nothing, and naming a file it did not write would be reporting what did not happen
      // (T0.24).
      return fields.file
        ? `${prefix}Applied ${clause(fields.file)} to the shared database. The ticket picks up from where it stopped.`
        : `${prefix}Applied nothing: the shared database already had every migration on this branch. The ticket picks up from where it stopped.`;
    case "noted":
      return `${prefix}Read that, thanks. Nothing for me to do here, so I've left the ticket as it is.`;
    case "resolved":
      return `${prefix}Read that as the answer, thanks. The task is back at Ready and the next run picks it up from there.`;
    case "gated": {
      const reasons = (fields.reasons ?? []).map(
        (each) => `${clause(each.rule)} — ${clause(each.ungate)}`,
      );
      return `${prefix}This ticket is built, reviewed and green, but the diff is one only your word merges: ${reasons.join("; ")}. It stays at Review; say "merge" here and the next run lands it with a merge commit.`;
    }
    case "reverted":
      return `${prefix}The deploy check after this merge failed: ${sentence(fields.failed)} I've reverted the merge commit ${clause(fields.merge)} on main as ${clause(fields.commit)} and put this task back at Backlog. The fix is filed as its own task: ${clause(fields.name)} (${clause(fields.url)}).`;
    case "readied":
      return `${prefix}Read that as your go, so the task is Ready. A run picks it up in its turn.`;
    case "waiting": {
      const several = (fields.blockers ?? []).length > 1;
      return `${prefix}This task is waiting on ${listed(fields.blockers)}, which ${several ? "aren't" : "isn't"} Ready, so runs pass it by for now. Set ${several ? "them" : "it"} Ready or take ${several ? "them" : "it"} out of Blockers, and this task is picked up in its turn.`;
    }
    case "cycle": {
      const members = fields.members ?? [];
      if (members.length <= 1) {
        return `${prefix}This task lists itself in its own Blockers, so no run can pick it. Take it out and it is picked up in its turn.`;
      }
      return members.length === 2
        ? `${prefix}${listed(members)} are each waiting on the other in Blockers, so no run can pick either. Take one out of the other's Blockers and both are picked up in their turn.`
        : `${prefix}${listed(members)} wait on each other in a loop through Blockers, so no run can pick any of them. Take one link out of the loop and they are picked up in their turn.`;
    }
    case "urgent":
      return `${prefix}${fields.count} tasks are Urgent; running them in roadmap order.`;
    case "refused": {
      const files = fields.files ?? [];
      const inTheWay =
        files.length === 0
          ? ""
          : files.length === 1
            ? ` The file in conflict is ${listed(files)}.`
            : ` The files in conflict are ${listed(files)}.`;
      return `${prefix}${clause(fields.what)} was refused: ${sentence(fields.why)}${inTheWay} ${sentence(fields.settle)}`;
    }
    case "setup":
      return `${prefix}I've stopped on a step only you can do: ${clause(fields.step)}. ${sentence(fields.where)} Say "done" on this thread once it's in place and the next run carries on.`;
    default:
      throw new Error(`unknown comment kind: ${kind}`);
  }
}

/**
 * CLI. Read: `{ "comments": [{text, created_time}], "prefix": "⟡ " }` on stdin. Compose:
 * `{ "compose": { "kind": "stale", "date": "…", "branch": "…" }, "prefix": "⟡ " }`.
 */
async function main() {
  const input = JSON.parse(await readStdin());
  const prefix = input.prefix ?? "⟡ ";
  if (input.compose) {
    const { kind, ...fields } = input.compose;
    emit({ text: compose(kind, fields, prefix) });
    return;
  }
  emit(readThread(input.comments ?? [], prefix));
}

if (isMain(import.meta.url)) await main();
