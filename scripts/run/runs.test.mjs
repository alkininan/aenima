import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  countFindings,
  modelLabel,
  nextNumber,
  parseTranscript,
  post,
  rowProperties,
  runName,
  STOPPED,
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
      tasks: async (ds) => (ds === "runs-ds" ? [{ Name: "R-0041 T0.11" }] : []),
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
      tasks: async () => {
        throw new Error("Notion API POST /data_sources/x/query answered 401");
      },
    };
    const result = await post(parseTranscript(transcript()), {
      deps: { token: () => "t", board, client: api },
    });
    expect(result.posted).toBe(false);
    expect(result.why).toContain("401");
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
