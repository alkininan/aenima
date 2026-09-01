/**
 * What a document's score does when nothing about the document changes — T2.7.
 *
 * `score:file` appends a new artifact version per run, so §5's cache never
 * answers and every run is a real provider call on identical bytes. That makes
 * the stored ledger a measurement instrument: N runs over one document, and the
 * only thing varying is the model.
 *
 * This reads those runs back and reports three things separately, because one
 * spread number would hide two of them:
 *
 * 1. **The score**, whose denominator may itself have moved.
 * 2. **The denominator**, which is §4's applicability answer and a different
 *    question — whether the model settles *which checks apply* is not the same
 *    as whether it settles *what the verdicts are*.
 * 3. **Per check**, so the variance is attributed rather than asserted: a check
 *    is `pass`, `fail`, or `not asked`, and the interesting number is how many
 *    of those three states it occupied across the set.
 *
 *   pnpm score:spread <ISO start> [ISO end] [label]
 *
 * Reads only. Prints only. Writes nothing.
 */
import { closeSharedDbClient, createDbClient } from "../src/db/client";
import { percentageOf } from "../src/packs";

type Row = {
  runId: string;
  scoredAt: string | Date;
  earned: number;
  denominator: number;
  model: string;
  protocolVersion: string;
  conditionsMet: string[];
};

/** A check's state in one run. `not asked` is §4 excluding it, not a verdict. */
type State = "pass" | "fail" | "not asked";

function pad(value: string | number, width: number): string {
  return String(value).padStart(width);
}

async function main(): Promise<void> {
  const [startArg, endArg, label] = process.argv.slice(2);
  if (!startArg) {
    console.error("usage: pnpm score:spread <ISO start> [ISO end] [label]");
    process.exitCode = 1;
    return;
  }
  const start = new Date(startArg);
  const end = endArg && endArg !== "-" ? new Date(endArg) : new Date();

  const { sql } = createDbClient();
  try {
    const runs = (await sql`
      select id as "runId", scored_at as "scoredAt", earned, denominator, model,
             protocol_version as "protocolVersion", conditions_met as "conditionsMet"
      from scoring_run
      where scored_at >= ${start.toISOString()} and scored_at <= ${end.toISOString()}
      order by scored_at asc`) as unknown as Row[];
    // postgres.js hands timestamps back as strings on a raw query; drizzle
    // would have coerced them. Normalize once here rather than at each use.
    for (const r of runs) r.scoredAt = new Date(r.scoredAt);

    if (runs.length === 0) {
      console.log("no runs in that window");
      return;
    }

    const results = (await sql`
      select run_id as "runId", check_id as "checkId", passed, points
      from scoring_check_result
      where run_id in ${sql(runs.map((r) => r.runId))}`) as unknown as Array<{
      runId: string;
      checkId: string;
      passed: boolean;
      points: number;
    }>;

    const notAsked = (await sql`
      select run_id as "runId", check_id as "checkId", condition_id as "conditionId"
      from scoring_check_not_asked
      where run_id in ${sql(runs.map((r) => r.runId))}`) as unknown as Array<{
      runId: string;
      checkId: string;
      conditionId: string;
    }>;

    const state = new Map<string, Map<string, State>>();
    const points = new Map<string, number>();
    for (const r of results) {
      if (!state.has(r.checkId)) state.set(r.checkId, new Map());
      state.get(r.checkId)!.set(r.runId, r.passed ? "pass" : "fail");
      points.set(r.checkId, r.points);
    }
    for (const n of notAsked) {
      if (!state.has(n.checkId)) state.set(n.checkId, new Map());
      state.get(n.checkId)!.set(n.runId, "not asked");
    }

    console.log(
      `\n${label ?? "set"} — ${runs.length} runs, ${start.toISOString()} → ${end.toISOString()}`,
    );

    const protocols = [...new Set(runs.map((r) => r.protocolVersion))];
    const models = [...new Set(runs.map((r) => r.model))];
    console.log(`  model ${models.join(", ")} · protocol ${protocols.join(", ")}`);
    if (protocols.length > 1)
      console.log("  ** protocol version moved across this set — runs are not comparable **");

    console.log("\n  per run");
    console.log("    #   scored_at             score   earned/denom   conditions met");
    runs.forEach((r, i) => {
      console.log(
        `    ${pad(i + 1, 2)}  ${(r.scoredAt as Date).toISOString().slice(0, 19)}  ` +
          `${pad(percentageOf(r.earned, r.denominator).toFixed(1), 5)}   ` +
          `${pad(r.earned, 3)}/${pad(r.denominator, 3)}      ${r.conditionsMet.join(", ")}`,
      );
    });

    // 1. The score.
    const scores = runs.map((r) => percentageOf(r.earned, r.denominator));
    const sorted = [...scores].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    console.log("\n  score");
    console.log(
      `    min ${sorted[0]!.toFixed(1)}  max ${sorted.at(-1)!.toFixed(1)}  ` +
        `median ${median.toFixed(1)}  spread ${(sorted.at(-1)! - sorted[0]!).toFixed(1)} points`,
    );

    // 2. The denominator, reported apart from the score on purpose.
    console.log("\n  denominator (§4 applicability — a different question from the verdicts)");
    const denoms = new Map<number, number>();
    for (const r of runs) denoms.set(r.denominator, (denoms.get(r.denominator) ?? 0) + 1);
    for (const [d, n] of [...denoms].sort((a, b) => a[0] - b[0])) {
      console.log(`    ${d} points — ${n} of ${runs.length} runs`);
    }
    const conditions = new Map<string, number>();
    for (const r of runs)
      for (const c of r.conditionsMet) conditions.set(c, (conditions.get(c) ?? 0) + 1);
    for (const [c, n] of [...conditions].sort()) {
      const verdict =
        n === runs.length ? "held every run" : `**moved — held in ${n} of ${runs.length}**`;
      console.log(`    ${c}: ${verdict}`);
    }

    // 3. Per check.
    console.log("\n  per check (states occupied across the set)");
    const checkIds = [...state.keys()].sort((a, b) => {
      const na = Number(a.replace(/\D+/g, ""));
      const nb = Number(b.replace(/\D+/g, ""));
      return Number.isNaN(na) || Number.isNaN(nb) ? a.localeCompare(b) : na - nb;
    });
    let movedCount = 0;
    for (const checkId of checkIds) {
      const perRun = state.get(checkId)!;
      const counts = new Map<State, number>();
      for (const r of runs) {
        const s = perRun.get(r.runId) ?? "not asked";
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
      const occupied = [...counts.entries()].filter(([, n]) => n > 0);
      const moved = occupied.length > 1;
      if (moved) movedCount += 1;
      const shape = occupied.map(([s, n]) => `${s} ${n}`).join(" / ");
      console.log(
        `    ${checkId.padEnd(8)} ${pad(points.get(checkId) ?? 0, 2)}pt  ` +
          `${moved ? "MOVED " : "stable"}  ${shape}`,
      );
    }
    console.log(
      `\n    ${checkIds.length - movedCount} of ${checkIds.length} checks held one state; ${movedCount} moved.`,
    );
  } finally {
    await closeSharedDbClient();
    await sql.end();
  }
}

void main();
