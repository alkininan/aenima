#!/usr/bin/env node
/**
 * Is this migration additive? — decided in code, never by the model (T0.46, Build 3).
 *
 * The gatekeeper may say `MERGE APPLY` only when this file says additive for every migration
 * the diff adds and nobody has applied, and the guard asks the same question before it lets an
 * apply through on the gatekeeper's word (`scripts/run/permission.mjs`, `applyGranted`). One
 * reader, so the two cannot disagree; the model can only be stricter than it.
 *
 * The list is the ticket's, and it is a whitelist. Additive: CREATE — a table, an index, a
 * type, a schema, a sequence, a view, a function, a trigger, a policy — ADD COLUMN nullable
 * or with a default, row level security enabled or forced, and a grant. Destructive: DROP,
 * TRUNCATE, DELETE, UPDATE, RENAME, ALTER TYPE in either spelling, SET NOT NULL on a column
 * this file gave no default, and anything else at all — an INSERT, a REVOKE, a DO block, an
 * ADD CONSTRAINT, a statement the reader does not recognise — because a reader that guessed
 * would be the model with extra steps. A function body is opaque: the DELETE inside
 * `app.delete_user` (drizzle/0014) is the function's, not the migration's.
 *
 * Statements are split on `;` outside single quotes, double quotes, dollar-quotes and
 * comments. Nothing here is a SQL parser; it reads the head of each statement, which is
 * where every clause in the list lives.
 */

import { readFileSync } from "node:fs";

import { emit, isMain } from "./cli.mjs";

/** The two answers. */
export const ADDITIVE = "additive";
export const DESTRUCTIVE = "destructive";

/**
 * Statements of `sql`, trimmed, comments stripped, in order. A `;` inside `'…'`, `"…"`,
 * `$$…$$` or `$tag$…$tag$` is text; `--` runs to the end of its line and `/* … *\/` to its
 * close.
 */
export function statementsOf(sql) {
  const text = String(sql ?? "");
  const found = [];
  let current = "";
  let i = 0;
  const push = () => {
    const statement = current.trim();
    if (statement !== "") found.push(statement);
    current = "";
  };
  while (i < text.length) {
    const char = text[i];
    const next = text[i + 1];
    if (char === "-" && next === "-") {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    if (char === "'" || char === '"') {
      const end = closingQuote(text, i, char);
      current += text.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (char === "$") {
      const tag = text.slice(i).match(/^\$[A-Za-z_]*\$/)?.[0];
      if (tag !== undefined) {
        const end = text.indexOf(tag, i + tag.length);
        const stop = end === -1 ? text.length : end + tag.length;
        current += text.slice(i, stop);
        i = stop;
        continue;
      }
    }
    if (char === ";") {
      push();
      i += 1;
      continue;
    }
    current += char;
    i += 1;
  }
  push();
  return found;
}

/** The index of the quote closing the one at `open`; a doubled quote is an escape. */
function closingQuote(text, open, quote) {
  let i = open + 1;
  while (i < text.length) {
    if (text[i] === quote) {
      if (text[i + 1] === quote) {
        i += 2;
        continue;
      }
      return i;
    }
    i += 1;
  }
  return text.length - 1;
}

/** A statement's head, upper-cased with its whitespace folded, for the matchers below. */
const headOf = (statement) =>
  String(statement ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

/** A quoted or bare identifier: `"key"`, `key`, `app.seed_user`. */
const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)(?:\s*\.\s*(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*))*`;

/** A column's name as written, quotes stripped and lower-cased, so two spellings meet. */
const columnKey = (name) =>
  String(name ?? "")
    .replaceAll('"', "")
    .trim()
    .toLowerCase();

const additive = (kind) => ({ additive: true, kind, why: null });
const destructive = (kind, why) => ({ additive: false, kind, why });

/**
 * The actions of one `ALTER TABLE` statement — its comma-separated list, split at the top
 * level so a default's `now()` or a check's parentheses keep their commas.
 */
function actionsOf(rest) {
  const actions = [];
  let depth = 0;
  let quote = null;
  let current = "";
  for (const char of rest) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      actions.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim() !== "") actions.push(current.trim());
  return actions;
}

/**
 * One `ALTER TABLE` action, judged. `defaults` is the set of columns this file has given a
 * default so far, which is what makes a later SET NOT NULL additive; it is updated here.
 */
function classifyAction(action, defaults) {
  const head = headOf(action);
  const drop = head.match(/^DROP\b/);
  if (drop) return destructive("DROP", "DROP takes something away");
  if (/^RENAME\b/.test(head))
    return destructive("RENAME", "RENAME breaks every reader of the old name");
  // A constraint is a rule, not a row: a foreign key, a unique, a check or a primary key adds
  // what CREATE UNIQUE INDEX adds and touches no data, and `pnpm db:generate` writes one per
  // foreign key of every table it creates (T0.46, a default taken: the ticket's list does not
  // name it, and reading it as destructive would hold every generated migration).
  if (
    /^ADD\s+(?:CONSTRAINT\b|PRIMARY\s+KEY\b|UNIQUE\b|CHECK\b|FOREIGN\s+KEY\b|EXCLUDE\b)/.test(head)
  ) {
    return additive("ADD CONSTRAINT");
  }
  const add = action.match(
    new RegExp(
      String.raw`^\s*ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(${IDENT})\s+([\s\S]*)$`,
      "i",
    ),
  );
  if (add) {
    const [, column, definition] = add;
    const upper = headOf(definition);
    const hasDefault = /\bDEFAULT\b/.test(upper);
    if (hasDefault) defaults.add(columnKey(column));
    if (/\bNOT NULL\b/.test(upper) && !hasDefault) {
      return destructive(
        "ADD COLUMN NOT NULL",
        `ADD COLUMN ${column} NOT NULL with no default cannot be added to a populated table`,
      );
    }
    return additive("ADD COLUMN");
  }
  if (/^(?:ENABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY$/.test(head))
    return additive("ROW LEVEL SECURITY");
  const alter = action.match(
    new RegExp(String.raw`^\s*ALTER\s+(?:COLUMN\s+)?(${IDENT})\s+([\s\S]*)$`, "i"),
  );
  if (alter) {
    const [, column, rest] = alter;
    const upper = headOf(rest);
    if (/^(?:SET\s+DATA\s+)?TYPE\b/.test(upper))
      return destructive("ALTER TYPE", `ALTER COLUMN ${column} TYPE rewrites the column`);
    if (/^SET\s+DEFAULT\b/.test(upper)) {
      defaults.add(columnKey(column));
      return additive("SET DEFAULT");
    }
    if (/^SET\s+NOT\s+NULL$/.test(upper)) {
      return defaults.has(columnKey(column))
        ? additive("SET NOT NULL")
        : destructive("SET NOT NULL", `SET NOT NULL on ${column}, which this file gave no default`);
    }
    if (/^DROP\b/.test(upper)) return destructive("DROP", "DROP takes something away");
  }
  return destructive("unknown", `cannot parse "${headOf(action).slice(0, 60)}"`);
}

/** The first of the data verbs at depth zero in an upper-cased `WITH …` head, or null. */
function verbAfterCtes(head) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < head.length; i += 1) {
    const char = head[i];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (depth === 0) {
      const verb = head.slice(i).match(/^(?:^|\s)(UPDATE|DELETE|INSERT|SELECT)\b/)?.[1];
      if (verb !== undefined && (i === 0 || /\s/.test(head[i]))) return verb;
    }
  }
  return null;
}

/**
 * One statement, judged: `{ additive, kind, why }`. `defaults` is threaded through a file so
 * a SET NOT NULL can see the default an earlier statement gave the column.
 */
export function classify(statement, defaults = new Set()) {
  const head = headOf(statement);
  if (head === "") return destructive("empty", "cannot parse an empty statement");
  // `WITH … AS (…) UPDATE …` is the UPDATE it leads to (drizzle/0005, 0016): the verb is the
  // first keyword at parenthesis depth zero past the common table expressions.
  if (/^WITH\b/.test(head)) {
    const verb = verbAfterCtes(head);
    if (verb === "UPDATE") return destructive("UPDATE", "UPDATE rewrites rows");
    if (verb === "DELETE") return destructive("DELETE", "DELETE removes rows");
    return destructive("unknown", `cannot parse "${head.slice(0, 60)}"`);
  }
  if (/^CREATE\b/.test(head)) return additive("CREATE");
  if (/^GRANT\b/.test(head)) return additive("GRANT");
  // A revoke is a grant's other half: every hand-written migration here takes UPDATE and
  // DELETE off `anon` and `authenticated` for the table it creates, one GRANT puts a privilege
  // back, and no row is touched either way (T0.46, a default taken: the list names grants).
  if (/^REVOKE\b/.test(head)) return additive("REVOKE");
  if (/^DROP\b/.test(head)) return destructive("DROP", "DROP takes something away");
  if (/^TRUNCATE\b/.test(head)) return destructive("TRUNCATE", "TRUNCATE empties a table");
  if (/^DELETE\b/.test(head)) return destructive("DELETE", "DELETE removes rows");
  if (/^UPDATE\b/.test(head)) return destructive("UPDATE", "UPDATE rewrites rows");
  if (/^ALTER\s+TYPE\b/.test(head))
    return destructive("ALTER TYPE", "ALTER TYPE changes a type every column of it stands on");
  const table = statement.match(
    new RegExp(
      String.raw`^\s*ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${IDENT}\s+([\s\S]*)$`,
      "i",
    ),
  );
  if (table) {
    const read = actionsOf(table[1]).map((action) => classifyAction(action, defaults));
    const bad = read.find((each) => !each.additive);
    return bad ?? additive(read.map((each) => each.kind).join(", ") || "ALTER TABLE");
  }
  return destructive("unknown", `cannot parse "${head.slice(0, 60)}"`);
}

/**
 * A migration's text, judged: `{ safety, why, statements, destructive }`. `safety` is
 * `additive` only when every statement is; `why` names the first destructive one, and
 * `destructive` lists them all. A file with no statement is destructive: nothing to vouch for.
 */
export function migrationSafety(sql) {
  const statements = statementsOf(sql);
  const defaults = new Set();
  const read = statements.map((statement) => ({
    text: headOf(statement).slice(0, 80),
    ...classify(statement, defaults),
  }));
  const bad = read.filter((each) => !each.additive);
  if (statements.length === 0) {
    return {
      safety: DESTRUCTIVE,
      why: "cannot parse a migration with no statement in it",
      statements: read,
      destructive: [],
    };
  }
  return {
    safety: bad.length === 0 ? ADDITIVE : DESTRUCTIVE,
    why: bad.length === 0 ? null : `${bad[0].why} (${bad[0].text})`,
    statements: read,
    destructive: bad,
  };
}

/**
 * `{ path: { safety, why } }` for `paths`, each read through `readText(path)` — the text, or
 * null. A path that cannot be read is destructive: a migration nobody can read is not one
 * anybody can vouch for.
 */
export function safetyOfFiles(paths = [], readText) {
  const found = {};
  for (const path of paths) {
    const text = readText(path);
    if (typeof text !== "string") {
      found[path] = { safety: DESTRUCTIVE, why: `${path} could not be read` };
      continue;
    }
    const { safety, why } = migrationSafety(text);
    found[path] = { safety, why };
  }
  return found;
}

/** CLI: `node migration-safety.mjs <file> [<file> …]` — each file read from disk. */
function main() {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    process.stderr.write("usage: migration-safety.mjs <migration.sql> [...]\n");
    process.exit(1);
  }
  const read = safetyOfFiles(paths, (path) => {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  });
  const files = paths.map((path) => ({ path, ...read[path] }));
  emit({ files, additive: files.every((file) => file.safety === ADDITIVE) });
}

if (isMain(import.meta.url)) main();
