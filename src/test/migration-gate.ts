import { spawnSync } from "node:child_process";

/**
 * When a database test may skip because its migration is not applied — build-log open
 * question 40, ruled by T0.26.
 *
 * A migration ticket is split in two by guidelines §5 step 6: the run writes the SQL and stops
 * at Decision, and a later run applies it on the human's `apply`. Between those two runs the
 * column does not exist in any database, and a test that failed hard there would redden every
 * run in the repo until somebody applied it — a suite that says "you have not applied a
 * migration" by breaking is one nobody can read. So it skips, loudly.
 *
 * That licence ends the moment the migration file is on `origin/main`. A migration that has
 * landed is one every checkout has, so a missing column is no longer a ticket in flight; it is
 * a database behind the code, and the only honest answer is a red test. **A skip on main is a
 * failure hidden**, which is why the unreadable cases all fall the same way: a ref that does
 * not resolve, a git that cannot be run, a file that cannot be looked up — none of them proves
 * the migration is still waiting, so none of them buys a skip.
 *
 * `gateOf` is the rule and `landedOnMain` the observation, so the rule is testable with no
 * repository and the observation has one job.
 */

/** The branch a migration has landed on when every checkout has it. */
export const MAIN = "origin/main";

/** What the gate decided, and the one sentence it wants said about it. */
export type Gate = { skip: boolean; why: string | null };

/** How a git command answers: `spawnSync`'s status, and its error when it never ran. */
export type GitRun = (argv: string[]) => { status: number | null; error?: Error | undefined };

const git: GitRun = (argv) => spawnSync("git", argv, { encoding: "utf8" });

/**
 * Whether `file` is in `origin/main`'s tree. True whenever that cannot be established — the
 * ref missing, git absent, the lookup itself failing — because the false answer is the one
 * that buys a skip and nothing unproven may buy one.
 */
export function landedOnMain(file: string, run: GitRun = git): boolean {
  const ref = run(["rev-parse", "--verify", "--quiet", `${MAIN}^{commit}`]);
  if (ref.error || ref.status !== 0) return true;
  const blob = run(["cat-file", "-e", `${MAIN}:${file}`]);
  if (blob.error) return true;
  return blob.status === 0;
}

/**
 * The rule. `present` is whether the schema object this suite is about exists on the database
 * it points at; `landed` whether `file` is on `origin/main`; `subject` what goes unverified,
 * in the words the suite would use.
 */
export function gateOf({
  file,
  present,
  landed,
  subject,
}: {
  file: string;
  present: boolean;
  landed: boolean;
  subject: string;
}): Gate {
  if (present) return { skip: false, why: null };
  if (landed) {
    return {
      skip: false,
      why:
        `\n\x1b[33m${file} is on ${MAIN} and is not applied to this database.\x1b[0m\n` +
        `${subject} are about to fail rather than skip: a migration that has landed is one\n` +
        `every checkout has, so this is a database behind the code and not a ticket in\n` +
        `flight. Apply it with \`pnpm db:migrate\` from a checkout that has .env.migrate.\n\n`,
    };
  }
  return {
    skip: true,
    why:
      `\n\x1b[33m${file} is not applied to this database, and it is not on ${MAIN}\n` +
      `either — it is still waiting for your \`apply\`.\x1b[0m ${subject} are\n` +
      `unverified in this run. Apply it with \`pnpm db:migrate\` from a checkout that has\n` +
      `.env.migrate, then rerun.\n\n`,
  };
}

/**
 * The rule with the observation made and the sentence said. Straight to stderr, because vitest
 * hides `console.*` behind a reporter flag and an unverified invariant must not be something
 * you opt in to seeing.
 */
export function migrationGate(
  args: { file: string; present: boolean; subject: string },
  deps: { landed?: (file: string) => boolean; warn?: (text: string) => void } = {},
): Gate {
  const landed = (deps.landed ?? landedOnMain)(args.file);
  const gate = gateOf({ ...args, landed });
  if (gate.why !== null) (deps.warn ?? ((text: string) => process.stderr.write(text)))(gate.why);
  return gate;
}
