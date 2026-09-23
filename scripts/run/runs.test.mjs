import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  countFindings,
  modelLabel,
  nextNumber,
  parseTranscript,
  post,
  rowProperties,
  runKey,
  runName,
  sidechainsOf,
  startMinute,
  STOPPED,
  summarize,
} from "./runs.mjs";

// T0.12 — the Runs row, read from the transcript and nothing else. A synthetic transcript in
// the shape Claude Code writes: one line per event, assistant lines one per content block
// with the message's usage repeated on each.

const line = (event) => JSON.stringify(event);
const at = (minute, second = 0) =>
  `2026-09-13T11:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.000Z`;

/** An assistant API message written as `blocks.length` lines, usage repeated on every line. */
const assistant = (id, model, usage, blocks, stamp) =>
  blocks.map((block) =>
    line({
      type: "assistant",
      sessionId: "sess-1",
      timestamp: stamp,
      message: { id, model, role: "assistant", content: [block], usage },
    }),
  );

const user = (content, stamp) =>
  line({ type: "user", sessionId: "sess-1", timestamp: stamp, message: { role: "user", content } });

const PROMPT = user("<scheduled-task>\n…\n\n/ticket\n</scheduled-task>", at(22, 33));

function transcript({ withTask = true, statuses = ["In progress", "Review"], review = null } = {}) {
  const usage = (input, output) => ({
    input_tokens: input,
    output_tokens: output,
    cache_read_input_tokens: 40000,
    cache_creation_input_tokens: 30000,
  });
  const lines = [
    line({ type: "queue-operation", sessionId: "sess-1", timestamp: at(22, 30) }),
    PROMPT,
    ...assistant(
      "msg_1",
      "claude-fable-5-1",
      usage(2, 400),
      [
        { type: "thinking", thinking: "…" },
        { type: "text", text: "Preflight." },
        {
          type: "tool_use",
          id: "tu_claim",
          name: "Bash",
          input: {
            command: withTask
              ? "node scripts/run/claim.mjs --task T0.96 --page 3d679daf-d42e-813f-af58-f5f053219a57 --branch t0-96"
              : "node scripts/run/pick-next.mjs --file rows.json",
          },
        },
      ],
      at(22, 40),
    ),
    user([{ type: "tool_result", tool_use_id: "tu_claim", content: "{}" }], at(22, 41)),
  ];
  statuses.forEach((status, i) => {
    lines.push(
      ...assistant(
        `msg_status_${i}`,
        "claude-fable-5-1",
        usage(3, 50),
        [
          {
            type: "tool_use",
            id: `tu_status_${i}`,
            name: "mcp__abc__notion-update-page",
            input: {
              page_id: "3d679daf-d42e-813f-af58-f5f053219a57",
              command: "update_properties",
              properties: { Status: status },
            },
          },
        ],
        at(23 + i, 0),
      ),
    );
  });
  if (review) {
    lines.push(
      ...assistant(
        "msg_review",
        "claude-fable-5-1",
        usage(5, 60),
        [
          {
            type: "tool_use",
            id: "tu_review",
            name: "Agent",
            input: { subagent_type: "reviewer", prompt: "docs/tickets/T0.96.md" },
          },
        ],
        at(30, 0),
      ),
      user(
        [
          {
            type: "tool_result",
            tool_use_id: "tu_review",
            content: [{ type: "text", text: review }],
          },
        ],
        at(35, 0),
      ),
    );
  }
  lines.push(
    ...assistant(
      "msg_last",
      "claude-fable-5-1",
      usage(1, 20),
      [{ type: "text", text: "Done." }],
      at(40, 41),
    ),
    line({ type: "last-prompt", sessionId: "sess-1" }),
  );
  return lines;
}

// TC1 → AC1. What one row is made of.
describe("parseTranscript", () => {
  it("counts a message's usage once, however many lines its blocks were written as", () => {
    const summary = parseTranscript(transcript());
    // msg_1 (2 + 400) is three lines; the two status messages (3 + 50 each) and msg_last (1 + 20).
    expect(summary.tokens).toEqual({ input: 9, output: 520, total: 529 });
    expect(summary.turns).toBe(4);
  });

  it("excludes cache reads and cache writes from the tokens", () => {
    expect(parseTranscript(transcript()).tokens.total).toBeLessThan(1000);
  });

  it("spans the session from the first timestamp to the last, in minutes to one decimal", () => {
    const summary = parseTranscript(transcript());
    expect(summary.started).toBe(at(22, 30));
    expect(summary.ended).toBe(at(40, 41));
    expect(summary.durationMin).toBe(18.2);
  });

  it("reads the claimed task and page off the claim command", () => {
    const summary = parseTranscript(transcript());
    expect(summary.task).toBe("T0.96");
    expect(summary.page).toBe("3d679daf-d42e-813f-af58-f5f053219a57");
  });

  it("reads the outcome from the last Status the run wrote on its task", () => {
    expect(parseTranscript(transcript()).outcome).toBe("Done");
    expect(parseTranscript(transcript({ statuses: ["In progress", "Decision"] })).outcome).toBe(
      "Decision",
    );
    expect(parseTranscript(transcript({ statuses: ["In progress"] })).outcome).toBe(STOPPED);
  });

  it("reads a run that claimed nothing as Stopped with no task", () => {
    const summary = parseTranscript(transcript({ withTask: false, statuses: [] }));
    expect(summary).toMatchObject({ run: true, task: null, page: null, outcome: STOPPED });
  });

  it("ignores a Status written on some other page", () => {
    const lines = transcript({ statuses: ["In progress"] });
    lines.push(
      ...assistant(
        "msg_other",
        "claude-fable-5-1",
        { input_tokens: 1, output_tokens: 1 },
        [
          {
            type: "tool_use",
            id: "tu_other",
            name: "mcp__abc__notion-update-page",
            input: {
              page_id: "ffffffffffffffffffffffffffffffff",
              properties: { Status: "Review" },
            },
          },
        ],
        at(39, 0),
      ),
    );
    expect(parseTranscript(lines).outcome).toBe(STOPPED);
  });

  it("sums the reviewer's findings over its replies", () => {
    const review = "## FINDINGS\n\n**1. Must — a thing.**\ntext\n\n**2. Should — another.**\n";
    expect(parseTranscript(transcript({ review })).findings).toBe(2);
  });

  it("is not a run when no user message carries /ticket", () => {
    const lines = transcript().filter((l) => l !== PROMPT);
    expect(parseTranscript(lines).run).toBe(false);
  });

  it("does not read the /ticket inside a ticket file's path as the command", () => {
    const lines = transcript().filter((l) => l !== PROMPT);
    lines.splice(
      1,
      0,
      user("please look at docs/tickets/T0.12.md and tell me what it says", at(22, 33)),
    );
    expect(parseTranscript(lines).run).toBe(false);
    lines.splice(1, 0, user("<command-name>/ticket</command-name>", at(22, 34)));
    expect(parseTranscript(lines).run).toBe(true);
  });

  it("does not read a mention of /ticket in prose as the command", () => {
    const lines = transcript().filter((l) => l !== PROMPT);
    lines.splice(1, 0, user("what does /ticket do? and where is /ticket documented", at(22, 33)));
    expect(parseTranscript(lines).run).toBe(false);
  });

  // TC1 → AC1, and TA3 → AA3 since the addendum. One run, one task: a command that happens to
  // carry `claim.mjs --task` — a `claude -p` prompt in a live observation, say — did not run the
  // script, so it is no claim and does not end the run's own claim before its Status writes.
  it("does not read a claim.mjs quoted in a later command's prompt as a claim", () => {
    const lines = transcript();
    lines.splice(
      lines.findIndex((l) => l.includes("tu_status_0")),
      0,
      ...assistant(
        "msg_later",
        "claude-fable-5-1",
        { input_tokens: 1, output_tokens: 1 },
        [
          {
            type: "tool_use",
            id: "tu_later",
            name: "Bash",
            input: {
              command:
                'claude -p "Run: node scripts/run/claim.mjs --task T9.9 --page p --branch t9-9" --model haiku',
            },
          },
        ],
        at(39, 30),
      ),
    );
    const summary = parseTranscript(lines);
    expect(summary.task).toBe("T0.96");
    expect(summary.page).toBe("3d679daf-d42e-813f-af58-f5f053219a57");
    expect(summary.outcome).toBe("Done");
  });

  // TA3 → AA3 (addendum; T0.16 and T0.17 merged in): step 0 may claim a task to merge on the
  // human's word and release it, step 0c then sets it Done, and only step 1 claims the run's own.
  const MERGED_PAGE = "3db79daf-d42e-8130-85d2-e2b73bd2bcc3";
  const tool = (id, name, input, stamp) =>
    assistant(
      `msg_${id}`,
      "claude-fable-5-1",
      { input_tokens: 1, output_tokens: 1 },
      [{ type: "tool_use", id: `tu_${id}`, name, input }],
      stamp,
    );
  const bash = (id, command, stamp) => tool(id, "Bash", { command }, stamp);
  const status = (id, page_id, value, stamp) =>
    tool(
      id,
      "mcp__abc__notion-update-page",
      { page_id, command: "update_properties", properties: { Status: value } },
      stamp,
    );
  const mergedInStepZero = [
    ...bash(
      "merge_claim",
      `node scripts/run/claim.mjs --task T0.17 --page ${MERGED_PAGE} --branch t0-17`,
      at(22, 34),
    ),
    ...bash("merge", "gh pr merge t0-17 --merge", at(22, 35)),
    ...bash("merge_release", "node scripts/run/release.mjs", at(22, 36)),
    ...status("merge_done", MERGED_PAGE, "Done", at(22, 37)),
  ];

  it("takes step 1's claim as the run's, not a task step 0 claimed to merge and released", () => {
    const lines = transcript();
    lines.splice(lines.indexOf(PROMPT) + 1, 0, ...mergedInStepZero);
    const summary = parseTranscript(lines);
    expect(summary.task).toBe("T0.96");
    expect(summary.page).toBe("3d679daf-d42e-813f-af58-f5f053219a57");
    expect(summary.statuses).toEqual(["In progress", "Review"]);
    expect(summary.outcome).toBe("Done");
  });

  it("reads a run that only merged in step 0 and claimed nothing after as Stopped, no task", () => {
    const lines = transcript({ withTask: false, statuses: [] });
    lines.splice(lines.indexOf(PROMPT) + 1, 0, ...mergedInStepZero);
    expect(parseTranscript(lines)).toMatchObject({ task: null, page: null, outcome: STOPPED });
  });

  it("keeps a claim that no Status write followed as the run's while it still stands", () => {
    const summary = parseTranscript(transcript({ statuses: [] }));
    expect(summary).toMatchObject({ task: "T0.96", outcome: STOPPED });
  });

  it("reads a run that merged its own work at close as Done", () => {
    expect(parseTranscript(transcript({ statuses: ["In progress", "Done"] })).outcome).toBe("Done");
    // Step 9: Review, the run's own gh pr merge, Done, release — the claim is still the run's.
    const lines = transcript({ statuses: ["In progress", "Review"] });
    lines.splice(
      lines.findIndex((l) => l.includes("msg_last")),
      0,
      ...bash("close_merge", "gh pr merge t0-96 --merge --delete-branch", at(39, 0)),
      ...status("close_done", "3d679daf-d42e-813f-af58-f5f053219a57", "Done", at(39, 10)),
      ...bash("close_release", "node scripts/run/release.mjs", at(39, 20)),
    );
    expect(parseTranscript(lines)).toMatchObject({ task: "T0.96", outcome: "Done" });
  });

  // Steps 4 and 6 release the marker and then set Decision, so a write after the release is still
  // the claim's — in either order the skill allows for In progress and the claim.
  it("reads a stop that released the marker before setting Decision as Decision, with its task", () => {
    const afterClaim = transcript({ statuses: ["In progress"] });
    const beforeClaim = transcript({ statuses: [] });
    beforeClaim.splice(
      beforeClaim.findIndex((l) => l.includes("msg_1")),
      0,
      ...status("pre_progress", "3d679daf-d42e-813f-af58-f5f053219a57", "In progress", at(22, 38)),
    );
    for (const lines of [afterClaim, beforeClaim]) {
      lines.splice(
        lines.findIndex((l) => l.includes("msg_last")),
        0,
        ...bash("stop_release", "node scripts/run/release.mjs", at(39, 0)),
        ...status("stop_decision", "3d679daf-d42e-813f-af58-f5f053219a57", "Decision", at(39, 10)),
      );
      expect(parseTranscript(lines)).toMatchObject({ task: "T0.96", outcome: "Decision" });
    }
  });

  // Most runs write In progress before claim.mjs, so the claim holds no Status until Review; a
  // heredoc the build writes — the skill's own step 9, say — carries `gh pr merge` as text.
  it("does not read gh pr merge inside a heredoc body as the claim's merge", () => {
    const lines = transcript({ statuses: [] });
    lines.splice(
      lines.findIndex((l) => l.includes("msg_1")),
      0,
      ...status("pre_progress", "3d679daf-d42e-813f-af58-f5f053219a57", "In progress", at(22, 38)),
    );
    lines.splice(
      lines.findIndex((l) => l.includes("msg_last")),
      0,
      ...bash(
        "heredoc",
        "cat >> .claude/skills/ticket/SKILL.md <<'EOF'\n    git checkout --detach\n    gh pr merge <branch> --merge --delete-branch\nEOF\ngit add .claude/skills/ticket/SKILL.md",
        at(38, 0),
      ),
      ...status("build_review", "3d679daf-d42e-813f-af58-f5f053219a57", "Review", at(39, 0)),
    );
    expect(parseTranscript(lines)).toMatchObject({ task: "T0.96", outcome: "Done" });
  });

  // Step 0 claims a task to apply and only looks — `permission.mjs apply`, refused, released —
  // then step 1 claims the run's own in the same command, In progress written before it (the
  // shape of session 748b808b). Neither claim merged; the run's is the later one.
  it("takes step 1's claim over a step-0 claim that did not merge, both in one command", () => {
    const APPLY_PAGE = "3da79daf-d42e-8114-8a24-d52f19d4ed8c";
    const RUN_PAGE = "3d679daf-d42e-813f-af58-f5f053219a57";
    const shaped = (after) => {
      const lines = transcript({ withTask: false, statuses: [] });
      lines.splice(
        lines.findIndex((l) => l.includes("msg_last")),
        0,
        ...status("apply_progress", RUN_PAGE, "In progress", at(30, 0)),
        ...bash(
          "apply_then_claim",
          `node scripts/run/claim.mjs --task T0.13 --page ${APPLY_PAGE} --branch t0-13 && node scripts/run/permission.mjs apply; node scripts/run/release.mjs && node scripts/run/claim.mjs --task T0.96 --page ${RUN_PAGE} --branch t0-96`,
          at(30, 10),
        ),
        ...after,
      );
      return lines;
    };
    expect(parseTranscript(shaped([]))).toMatchObject({ task: "T0.96", outcome: STOPPED });
    expect(
      parseTranscript(shaped(status("apply_decision", RUN_PAGE, "Decision", at(39, 0)))),
    ).toMatchObject({ task: "T0.96", outcome: "Decision" });
  });

  it("keeps a killed run's claim over a later command that only quotes one", () => {
    const lines = transcript({ statuses: [] });
    lines.splice(
      lines.findIndex((l) => l.includes("msg_last")),
      0,
      ...bash(
        "quoted",
        'claude -p "Run: node scripts/run/claim.mjs --task T9.9 --page 3db79daf-d42e-8130-85d2-e2b73bd2bcc3" --model haiku',
        at(39, 30),
      ),
    );
    expect(parseTranscript(lines)).toMatchObject({ task: "T0.96", outcome: STOPPED });
  });

  // A subagent's transcript is beside the session's, every line a sidechain: its usage and model
  // are the run's, its prompt (the ticket path) and its tool calls are not.
  it("counts a subagent's tokens and model towards the run, and nothing else of it", () => {
    const reviewer = [
      user("docs/tickets/T0.96.md", at(30, 1)),
      ...assistant(
        "msg_side_1",
        "claude-opus-5",
        { input_tokens: 100, output_tokens: 1000, cache_read_input_tokens: 5000 },
        [
          { type: "text", text: "Reviewing." },
          {
            type: "tool_use",
            id: "tu_side",
            name: "mcp__abc__notion-update-page",
            input: {
              page_id: "3d679daf-d42e-813f-af58-f5f053219a57",
              properties: { Status: "Decision" },
            },
          },
        ],
        at(31, 0),
      ),
    ].map((line) => line.replace('"type":"assistant"', '"isSidechain":true,"type":"assistant"'));
    const main = transcript({ statuses: ["In progress", "Review"] });
    const alone = parseTranscript(main);
    const withSide = parseTranscript(main, [reviewer]);
    expect(withSide.tokens).toEqual({
      input: alone.tokens.input + 100,
      output: alone.tokens.output + 1000,
      total: alone.tokens.total + 1100,
    });
    expect(withSide.model).toBe("Fable→Opus");
    expect(withSide.outcome).toBe("Done");
    expect(withSide.turns).toBe(alone.turns + 1);
    expect(withSide.run).toBe(true);
    // The subagent's lines alone are not a run: the ticket path is not the command.
    expect(parseTranscript(reviewer).run).toBe(false);
  });

  it("names the model family, and the fallback when the session changed model", () => {
    expect(parseTranscript(transcript()).model).toBe("Fable");
    expect(modelLabel(["Fable", "Fable", "Opus"])).toBe("Fable→Opus");
    expect(modelLabel(["Opus"])).toBe("Opus");
    expect(modelLabel([null])).toBeNull();
  });

  it("skips lines that are not JSON rather than failing the whole transcript", () => {
    const lines = ["not json", ...transcript()];
    expect(parseTranscript(lines).run).toBe(true);
  });
});

// The layout on disk: `<dir>/<session>.jsonl` and `<dir>/<session>/subagents/agent-*.jsonl`.
describe("summarize", () => {
  it("reads the subagent transcripts beside the session's, and none where there are none", () => {
    const dir = mkdtempSync(join(tmpdir(), "aenima-runs-"));
    try {
      const main = join(dir, "sess-1.jsonl");
      writeFileSync(main, transcript().join("\n"));
      expect(sidechainsOf(main)).toEqual([]);
      expect(summarize(main).tokens.total).toBe(529);
      mkdirSync(join(dir, "sess-1", "subagents"), { recursive: true });
      const side = assistant(
        "msg_side",
        "claude-fable-5-1",
        { input_tokens: 7, output_tokens: 70 },
        [{ type: "text", text: "x" }],
        at(31, 0),
      );
      writeFileSync(join(dir, "sess-1", "subagents", "agent-a1.jsonl"), side.join("\n"));
      writeFileSync(join(dir, "sess-1", "subagents", "agent-a1.meta.json"), "{}");
      expect(sidechainsOf(main)).toEqual([join(dir, "sess-1", "subagents", "agent-a1.jsonl")]);
      expect(summarize(main).tokens.total).toBe(529 + 77);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("countFindings", () => {
  it("counts tagged finding lines in the shapes the reviewer writes", () => {
    expect(countFindings("**1. Must (uncertain) — x**\n\n**2. Must — y**\n")).toBe(2);
    expect(countFindings("1. **Must** — x\n2. **Should** — y\n3. **Should** — z\n")).toBe(3);
  });

  it("reads the summary sentence when findings sit under a heading untagged", () => {
    expect(countFindings("Two Must, six Should.\n\n### Must\n\n**1. AC6 …**\n")).toBe(8);
    expect(countFindings("No Must. Seven Should, ranked.\n")).toBe(7);
  });

  it("is zero for a pass", () => {
    expect(countFindings("**PASS**\n\nReviewed cold.")).toBe(0);
  });
});

describe("the row", () => {
  it("names the run R-nnnn and the task, or the run alone", () => {
    expect(runName(42, "T3.1")).toBe("R-0042 T3.1");
    expect(runName(7, null)).toBe("R-0007");
  });

  it("numbers after the highest existing row", () => {
    expect(nextNumber(["R-0003 T0.9", "R-0012", "junk", "R-0007 T0.10"])).toBe(13);
    expect(nextNumber([])).toBe(1);
  });

  it("shapes the properties the Runs schema holds, and leaves out what the run lacks", () => {
    const props = rowProperties(parseTranscript(transcript()), 5);
    expect(props.Name.title[0].text.content).toBe("R-0005 T0.96");
    expect(props.Task.relation[0].id).toBe("3d679daf-d42e-813f-af58-f5f053219a57");
    expect(props.Outcome.select.name).toBe("Done");
    expect(props.Model.select.name).toBe("Fable");
    expect(props.Tokens.number).toBe(529);
    expect(props.Duration.number).toBe(18.2);
    expect(props.Started.date.start).toBe(at(22, 30));
    const idle = rowProperties(parseTranscript(transcript({ withTask: false, statuses: [] })), 6);
    expect(idle.Task).toBeUndefined();
    expect(idle.Name.title[0].text.content).toBe("R-0006");
  });
});

// TC1 → AC1. Posting goes through the client and never the model; effects injected.
describe("post", () => {
  const board = () => ({ runs_ds: "runs-ds", tasks_ds: "tasks-ds", prefix: "⟡ " });

  it("says why when the token is missing, and posts nothing", async () => {
    const result = await post(parseTranscript(transcript()), {
      deps: { token: () => null, board },
    });
    expect(result.posted).toBe(false);
    expect(result.why).toContain("NOTION_TOKEN");
  });

  it("numbers the row after the rows the board holds and creates it in the Runs data source", async () => {
    const created = [];
    const api = {
      runs: async (ds) =>
        ds === "runs-ds"
          ? [{ Name: "R-0041 T0.11", Task: ["other-page"], Started: "2026-09-12T09:00:00.000Z" }]
          : [],
      createPage: async (ds, properties) => (created.push({ ds, properties }), { url: "u" }),
    };
    const result = await post(parseTranscript(transcript()), {
      deps: { token: () => "t", board, client: api },
    });
    expect(result).toEqual({ posted: true, name: "R-0042 T0.96", url: "u" });
    expect(created[0].ds).toBe("runs-ds");
    expect(created[0].properties.Name.title[0].text.content).toBe("R-0042 T0.96");
  });

  it("reports a refused request rather than throwing at session end", async () => {
    const api = {
      runs: async () => {
        throw new Error("Notion API POST /data_sources/x/query answered 401");
      },
    };
    const result = await post(parseTranscript(transcript()), {
      deps: { token: () => "t", board, client: api },
    });
    expect(result.posted).toBe(false);
    expect(result.why).toContain("401");
  });

  // T0.30 TC1 → AC1. A board that keeps what it is given, and reads a row's Started back to the
  // minute as Notion does — the row is written with seconds and comes back without them.
  const boardOf = (rows = []) => {
    const held = [...rows];
    return {
      held,
      runs: async () => held.map((row) => ({ ...row })),
      createPage: async (ds, properties) => {
        held.push({
          Name: properties.Name.title[0].text.content,
          Task: (properties.Task?.relation ?? []).map((page) => page.id),
          Started: properties.Started.date.start.replace(/:\d\d\.\d+Z$/, ":00.000Z"),
        });
        return { url: `u${held.length}` };
      },
    };
  };

  // The SessionEnd hook fires again when a session is cleared, resumed or exited, and reads the
  // same transcript from the same first timestamp. The second post is the duplicate R-0055,
  // R-0057, R-0058 and R-0061 are; it writes nothing and says the run is already recorded.
  it("writes one row for a run posted twice, and names the row that already holds it", async () => {
    const api = boardOf();
    const summary = parseTranscript(transcript());
    const first = await post(summary, { deps: { token: () => "t", board, client: api } });
    const second = await post(summary, { deps: { token: () => "t", board, client: api } });
    expect(first).toEqual({ posted: true, name: "R-0001 T0.96", url: "u1" });
    expect(second).toEqual({
      posted: false,
      name: "R-0001 T0.96",
      why: "this run is already recorded",
    });
    expect(api.held).toHaveLength(1);
  });

  // A later firing reads a longer transcript — more turns, more tokens, a further status — but
  // the same task and the same first timestamp. That is the copy, not a second run.
  it("writes nothing for a longer read of the same session", async () => {
    const api = boardOf();
    await post(parseTranscript(transcript({ statuses: ["In progress"] })), {
      deps: { token: () => "t", board, client: api },
    });
    const later = await post(
      parseTranscript(transcript({ statuses: ["In progress", "Review"], review: "1. Must — x" })),
      { deps: { token: () => "t", board, client: api } },
    );
    expect(later.posted).toBe(false);
    expect(api.held).toHaveLength(1);
  });

  // The key is the task and the minute together. Two runs that start in one minute on different
  // tasks are two runs, and a run that claimed nothing is keyed on its minute alone.
  it("writes a second row for another task started in the same minute", async () => {
    const api = boardOf([
      { Name: "R-0001 T0.11", Task: ["other-page"], Started: "2026-09-13T11:22:00.000Z" },
    ]);
    const result = await post(parseTranscript(transcript()), {
      deps: { token: () => "t", board, client: api },
    });
    expect(result.posted).toBe(true);
    expect(api.held).toHaveLength(2);
  });

  it("writes nothing for a second read of an idle run, which claimed no task at all", async () => {
    const api = boardOf();
    const summary = parseTranscript(transcript({ withTask: false, statuses: [] }));
    expect((await post(summary, { deps: { token: () => "t", board, client: api } })).posted).toBe(
      true,
    );
    expect((await post(summary, { deps: { token: () => "t", board, client: api } })).posted).toBe(
      false,
    );
    expect(api.held).toHaveLength(1);
  });
});

// T0.30 TC1 → AC1. The key itself: a task and a minute, both sides cut to the minute Notion keeps.
describe("startMinute and runKey", () => {
  it("cuts a timestamp to its minute, in UTC", () => {
    expect(startMinute("2026-09-13T11:22:30.874Z")).toBe("2026-09-13T11:22:00.000Z");
    expect(startMinute("2026-09-13T11:22:00.000Z")).toBe("2026-09-13T11:22:00.000Z");
    expect(startMinute("2026-09-13T13:22:30+02:00")).toBe("2026-09-13T11:22:00.000Z");
    expect(startMinute(null)).toBeNull();
    expect(startMinute("not a time")).toBeNull();
  });

  it("keys the row written with seconds and the row read back without them alike", () => {
    expect(runKey("3d679daf-d42e-813f-af58-f5f053219a57", "2026-09-13T11:22:30.874Z")).toBe(
      runKey("3d679daf-d42e-813faf58f5f053219a57", "2026-09-13T11:22:00.000Z"),
    );
  });

  it("separates two tasks in one minute, and joins an idle run to its own copy", () => {
    expect(runKey("a", "2026-09-13T11:22:30.000Z")).not.toBe(
      runKey("b", "2026-09-13T11:22:30.000Z"),
    );
    expect(runKey(null, "2026-09-13T11:22:30.000Z")).toBe(runKey(null, "2026-09-13T11:22:41.000Z"));
  });

  // A transcript with no timestamps cannot be told from any other; losing a run is the worse
  // failure, so it has no key and is written.
  it("has no key for a run with no start", () => {
    expect(runKey("a", null)).toBeNull();
  });
});

// TC1 → AC1. The three T0.10 sessions, read from their transcripts where this machine holds
// them. Skipped elsewhere: the transcripts live under ~/.claude, not in the repo.
const PROJECTS = join(homedir(), ".claude", "projects");
const session = (worktree, id) => {
  const file = join(
    PROJECTS,
    `-Users-alkininan-dev-aenima--claude-worktrees-${worktree}`,
    `${id}.jsonl`,
  );
  return existsSync(file) ? readFileSync(file, "utf8").split("\n") : null;
};
const T010 = [
  {
    worktree: "frosty-jemison-8d64a1",
    id: "269400de-eff8-4586-9f7d-bcbf54e53f47",
    started: "2026-09-13T11:22:33.303Z",
    input: 358,
    output: 7076,
  },
  {
    worktree: "infallible-cannon-d4c2cb",
    id: "f36c88f7-d73b-4bbd-8511-d9793558d14f",
    started: "2026-09-13T12:33:05.265Z",
    input: 322,
    output: 6862,
  },
  {
    worktree: "relaxed-panini-b637f4",
    id: "487e6066-f3db-484d-b036-80f228fa99df",
    started: "2026-09-13T14:08:42.827Z",
    input: 326,
    output: 9819,
  },
];
describe.skipIf(T010.some(({ worktree, id }) => session(worktree, id) === null))(
  "the three T0.10 sessions",
  () => {
    it.each(T010)("$worktree reads as an idle Fable run with its tokens counted once", (row) => {
      const summary = parseTranscript(session(row.worktree, row.id));
      expect(summary).toMatchObject({
        run: true,
        started: row.started,
        model: "Fable",
        task: null,
        outcome: STOPPED,
        findings: 0,
      });
      expect(summary.tokens).toEqual({
        input: row.input,
        output: row.output,
        total: row.input + row.output,
      });
    });
  },
);
