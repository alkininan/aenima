import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { client, comment, envValue, NOTION_VERSION, readToken, run, task } from "./notion.mjs";

/** A canned fetch: `routes` maps `METHOD path` (query string included) to a JSON body. */
const canned = (routes, { status = 200 } = {}) => {
  const calls = [];
  const fetch = async (url, init) => {
    const path = url.replace("https://api.notion.com/v1", "");
    calls.push({ method: init.method, path, headers: init.headers, body: init.body });
    const key = `${init.method} ${path}`;
    const found = routes[key];
    if (found === undefined) return { ok: false, status: 404, json: async () => ({}) };
    if (typeof found === "function") return found();
    return { ok: status < 400, status, json: async () => found };
  };
  return { calls, fetch };
};

// TC3 → AC3, the token's half. The guard reads the board with a token from .env.local; the
// token is never in an error, and a line that is not there is null rather than a guess.
describe("envValue and readToken", () => {
  it("reads KEY=value, quotes stripped, first match, comments ignored", () => {
    const text = '# comment\nOTHER=1\nNOTION_TOKEN="ntn_abc"\nNOTION_TOKEN=second\n';
    expect(envValue(text, "NOTION_TOKEN")).toBe("ntn_abc");
    expect(envValue("export NOTION_TOKEN='x'", "NOTION_TOKEN")).toBe("x");
    expect(envValue("NOTION_TOKEN = spaced", "NOTION_TOKEN")).toBe("spaced");
  });

  it("is null for an absent, empty or commented line", () => {
    expect(envValue("OTHER=1\n", "NOTION_TOKEN")).toBeNull();
    expect(envValue("NOTION_TOKEN=\n", "NOTION_TOKEN")).toBeNull();
    expect(envValue("# NOTION_TOKEN=x\n", "NOTION_TOKEN")).toBeNull();
    expect(envValue("NOTION_TOKENS=x\n", "NOTION_TOKEN")).toBeNull();
  });

  describe("from a directory", () => {
    let dir;
    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), "aenima-notion-"));
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it("is null with no .env.local, and the token once the file carries the line", () => {
      expect(readToken(dir)).toBeNull();
      writeFileSync(join(dir, ".env.local"), "DATABASE_URL=postgres://x\nNOTION_TOKEN=ntn_1\n");
      expect(readToken(dir)).toBe("ntn_1");
    });
  });
});

// TC3 → AC3 and TC4 → AC4, the board as the guard and the preflight read it.
describe("comment and task", () => {
  it("flattens rich text to the text the thread reader sees", () => {
    const raw = {
      id: "c1",
      rich_text: [{ plain_text: "⟡ " }, { plain_text: "hello" }],
      created_time: "2026-09-13T10:00:00.000Z",
      created_by: { object: "user", id: "u1" },
      discussion_id: "d1",
    };
    expect(comment(raw)).toEqual({
      id: "c1",
      text: "⟡ hello",
      created_time: "2026-09-13T10:00:00.000Z",
      created_by: { object: "user", id: "u1" },
      discussion_id: "d1",
    });
    expect(comment({}).text).toBe("");
  });

  it("reads a Tasks row's Name and Status from its properties", () => {
    const raw = {
      id: "t1",
      url: "https://www.notion.so/t1",
      properties: {
        Name: { title: [{ plain_text: "T0.11 " }, { plain_text: "Comments" }] },
        Status: { type: "select", select: { name: "Review", color: "blue" } },
      },
    };
    expect(task(raw)).toEqual({
      id: "t1",
      url: "https://www.notion.so/t1",
      Name: "T0.11 Comments",
      Status: "Review",
      Priority: null,
      Epic: [],
      Blockers: [],
      created: null,
      Commit: "",
    });
    expect(task({ id: "t2", properties: {} }).Status).toBeNull();
  });

  // T0.17 Build 1 and 3, read by TC1, TC2, TC4 and TC6 — the picker's fields: Priority as a
  // select, Epic and Blockers as the page ids of their relations, and when the row was created.
  it("reads Priority, Epic, Blockers and the created time as the picker orders by them", () => {
    const raw = {
      id: "t6",
      url: "https://www.notion.so/t6",
      created_time: "2026-09-14T17:11:24.354Z",
      properties: {
        Name: { title: [{ plain_text: "T0.17 Linear ordering" }] },
        Status: { type: "select", select: { name: "Ready" } },
        Priority: { type: "select", select: { name: "High" } },
        Epic: { type: "relation", relation: [{ id: "3cf79daf-d42e-81cf-8a80-ca880f54fdec" }] },
        Blockers: {
          type: "relation",
          relation: [{ id: "3db79daf-d42e-8153-8a9b-dcffdfc70538" }, { id: "b2" }],
          has_more: false,
        },
      },
    };
    expect(task(raw)).toMatchObject({
      Priority: "High",
      Epic: ["3cf79daf-d42e-81cf-8a80-ca880f54fdec"],
      Blockers: ["3db79daf-d42e-8153-8a9b-dcffdfc70538", "b2"],
      created: "2026-09-14T17:11:24.354Z",
    });
    expect(task({ id: "t7", properties: { Priority: { select: null } } }).Priority).toBeNull();
  });

  // T0.23 TC5 → AC5 — the Review rows read over the token carry the commit merge-detect asks of
  // them, as the connector's query did.
  it("reads a Tasks row's Commit as its text, empty when the row has none", () => {
    const raw = {
      id: "t8",
      properties: {
        Name: { title: [{ plain_text: "T1.5 Park move and row roving" }] },
        Commit: { type: "rich_text", rich_text: [{ plain_text: "33ece73" }] },
      },
    };
    expect(task(raw).Commit).toBe("33ece73");
    expect(task({ id: "t9", properties: {} }).Commit).toBe("");
  });

  // T0.16 TC1 → AC1 (carries T0.15). The Tasks data source holds Status as a select property, not a status
  // property, and the status-shaped read returned null for every row: three human merges at
  // Review went unseen by the guard. Both shapes are read; the board's is the select.
  it("reads Status from a select property, which is how the Tasks data source holds it", () => {
    const raw = {
      id: "t3",
      url: "https://www.notion.so/t3",
      properties: {
        Name: { title: [{ plain_text: "T0.14 Ignore worktrees in lint" }] },
        Status: {
          id: "xjQi",
          type: "select",
          select: { id: "18159c63", name: "Review", color: "blue" },
        },
      },
    };
    expect(task(raw).Status).toBe("Review");
    expect(
      task({ id: "t4", properties: { Status: { type: "select", select: null } } }).Status,
    ).toBeNull();
    // A status-typed property is not the board's shape and is not read (AGENTS.md: no fallbacks).
    expect(
      task({ id: "t5", properties: { Status: { type: "status", status: { name: "Review" } } } })
        .Status,
    ).toBeNull();
  });
});

// TC3 → AC3 and TC4 → AC4, the API client both readers go through.
describe("client", () => {
  it("refuses to exist without a token", () => {
    expect(() => client(null)).toThrow("NOTION_TOKEN");
  });

  it("sends the token as a bearer with the pinned API version, and pages through comments", async () => {
    const { calls, fetch } = canned({
      "GET /comments?block_id=abc&page_size=100": {
        results: [{ id: "1", rich_text: [{ plain_text: "a" }], created_time: "t1" }],
        has_more: true,
        next_cursor: "c2",
      },
      "GET /comments?block_id=abc&page_size=100&start_cursor=c2": {
        results: [{ id: "2", rich_text: [{ plain_text: "b" }], created_time: "t2" }],
        has_more: false,
      },
    });
    const comments = await client("ntn_x", { fetch }).comments("a-b-c");
    expect(comments.map((c) => c.text)).toEqual(["a", "b"]);
    expect(calls).toHaveLength(2);
    expect(calls[0].headers.Authorization).toBe("Bearer ntn_x");
    expect(calls[0].headers["Notion-Version"]).toBe(NOTION_VERSION);
  });

  it("queries the Tasks data source with a cursor on the second page", async () => {
    const { calls, fetch } = canned({
      "POST /data_sources/ds1/query": () => {
        const first = calls.length === 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              {
                id: first ? "t1" : "t2",
                properties: { Name: { title: [{ plain_text: first ? "one" : "two" }] } },
              },
            ],
            has_more: first,
            next_cursor: first ? "n" : null,
          }),
        };
      },
    });
    const tasks = await client("ntn_x", { fetch }).tasks("ds1");
    expect(tasks.map((t) => t.Name)).toEqual(["one", "two"]);
    expect(JSON.parse(calls[0].body)).toEqual({ page_size: 100 });
    expect(JSON.parse(calls[1].body)).toEqual({ page_size: 100, start_cursor: "n" });
  });

  it("names the endpoint and the status in an error, never the token", async () => {
    const { fetch } = canned({ "GET /comments?block_id=p&page_size=100": {} }, { status: 401 });
    const error = await client("ntn_secret", { fetch })
      .comments("p")
      .catch((e) => e);
    expect(error.message).toBe("Notion API GET /comments answered 401");
    expect(error.message).not.toContain("ntn_secret");
  });

  it("retries once after a 429, for the seconds the API asks, capped", async () => {
    let n = 0;
    const slept = [];
    const fetch = async () => {
      n += 1;
      if (n === 1) {
        return { ok: false, status: 429, headers: { get: () => "10" }, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({ results: [], has_more: false }) };
    };
    const comments = await client("ntn_x", { fetch, sleep: (ms) => slept.push(ms) }).comments("p");
    expect(comments).toEqual([]);
    expect(slept).toEqual([2000]);
    expect(n).toBe(2);
  });

  // The guard runs under a hook timeout; a request that hangs past it would let the command
  // through with nothing having read the thread. Every request carries an abort signal.
  it("sends every request with an abort signal, so a hung board fails closed", async () => {
    const { calls, fetch } = canned({
      "GET /comments?block_id=p&page_size=100": { results: [], has_more: false },
    });
    const seen = [];
    const spy = (url, init) => {
      seen.push(init.signal);
      return fetch(url, init);
    };
    await client("ntn_x", { fetch: spy }).comments("p");
    expect(calls).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(AbortSignal);
    expect(seen[0].aborted).toBe(false);
  });

  // T0.30 TC1 → AC1. The Runs rows `post` keys against, paged as any data source is.
  it("reads every Runs row as the key needs it", async () => {
    const { calls, fetch } = canned({
      "POST /data_sources/runs-ds/query": {
        results: [
          {
            id: "r1",
            properties: {
              Name: { title: [{ plain_text: "R-0060 T0.27" }] },
              Task: { relation: [{ id: "3e379daf-d42e-81dc-9081-e9592cf1fc0d" }] },
              Started: { date: { start: "2026-09-22T11:36:00.000Z" } },
            },
          },
        ],
        has_more: false,
      },
    });
    const rows = await client("ntn_x", { fetch }).runs("runs-ds");
    expect(rows).toEqual([
      {
        id: "r1",
        Name: "R-0060 T0.27",
        Task: ["3e379daf-d42e-81dc-9081-e9592cf1fc0d"],
        Started: "2026-09-22T11:36:00.000Z",
      },
    ]);
    expect(calls[0].method).toBe("POST");
    expect(JSON.parse(calls[0].body).page_size).toBe(100);
  });

  // The page the guard reads is a Tasks row, and the board holds its Status as a select
  // (T0.15): this is the read behind `permission.mjs`'s "at no status".
  it("reads one page as a Tasks row", async () => {
    const { calls, fetch } = canned({
      "GET /pages/abc": {
        id: "abc",
        url: "https://www.notion.so/abc",
        properties: {
          Name: { title: [{ plain_text: "T0.11 Comments" }] },
          Status: { type: "select", select: { name: "Review", color: "blue" } },
        },
      },
    });
    const row = await client("ntn_x", { fetch }).page("a-b-c");
    expect(row).toEqual({
      id: "abc",
      url: "https://www.notion.so/abc",
      Name: "T0.11 Comments",
      Status: "Review",
      Priority: null,
      Epic: [],
      Blockers: [],
      created: null,
      Commit: "",
    });
    expect(calls[0].method).toBe("GET");
  });
});

// T0.30 TC1 → AC1. The Runs row read for the key it is recorded under: the task it relates to
// and the minute it started. Name comes too, since the next number is read from the same rows.
describe("run", () => {
  it("reads a Runs row's task, start and name", () => {
    expect(
      run({
        id: "r1",
        properties: {
          Name: { title: [{ plain_text: "R-0060 T0.27" }] },
          Task: { relation: [{ id: "3e379daf-d42e-81dc-9081-e9592cf1fc0d" }] },
          Started: { date: { start: "2026-09-22T11:36:00.000Z", end: null } },
        },
      }),
    ).toEqual({
      id: "r1",
      Name: "R-0060 T0.27",
      Task: ["3e379daf-d42e-81dc-9081-e9592cf1fc0d"],
      Started: "2026-09-22T11:36:00.000Z",
    });
  });

  // An idle run claims nothing and a transcript without timestamps starts nowhere. Neither is
  // an error here; the key decides what to do with them.
  it("reads an unrelated, undated row as an empty relation and a null start", () => {
    expect(run({ id: "r2", properties: { Name: { title: [{ plain_text: "R-0064" }] } } })).toEqual({
      id: "r2",
      Name: "R-0064",
      Task: [],
      Started: null,
    });
    expect(run(null)).toEqual({ id: null, Name: "", Task: [], Started: null });
  });
});
