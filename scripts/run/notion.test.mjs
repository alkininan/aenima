import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { client, comment, envValue, NOTION_VERSION, readToken, task } from "./notion.mjs";

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
        Status: { status: { name: "Review" } },
      },
    };
    expect(task(raw)).toEqual({
      id: "t1",
      url: "https://www.notion.so/t1",
      Name: "T0.11 Comments",
      Status: "Review",
    });
    expect(task({ id: "t2", properties: {} }).Status).toBeNull();
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

  it("reads one page as a Tasks row", async () => {
    const { calls, fetch } = canned({
      "GET /pages/abc": {
        id: "abc",
        url: "https://www.notion.so/abc",
        properties: {
          Name: { title: [{ plain_text: "T0.11 Comments" }] },
          Status: { status: { name: "Review" } },
        },
      },
    });
    const row = await client("ntn_x", { fetch }).page("a-b-c");
    expect(row).toEqual({
      id: "abc",
      url: "https://www.notion.so/abc",
      Name: "T0.11 Comments",
      Status: "Review",
    });
    expect(calls[0].method).toBe("GET");
  });
});
