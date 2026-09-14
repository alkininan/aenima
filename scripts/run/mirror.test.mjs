import { describe, expect, it } from "vitest";

import {
  ABBREV,
  CHUNK_CHARS,
  chunk,
  decide,
  heading,
  IN_PROGRESS,
  lastCommit,
  MIRRORED,
  MIRRORS,
  order,
  parseHeader,
  readPlan,
  sentinel,
} from "./mirror.mjs";

// T0.12 — TC2 → AC2. A mirror page is whole and headed with its commit, or visibly in
// progress; a sentinel left standing is refreshed first at the next preflight.

describe("the two headers", () => {
  it("heads a finished mirror with its file, version and commit", () => {
    const text = heading({
      path: "docs/guidelines.md",
      doc: "guidelines",
      version: "1.7",
      commit: "abc1234",
    });
    expect(text).toContain("**Mirror — edit in the repo.** `docs/guidelines.md` · guidelines v1.7");
    expect(text).toContain(`${MIRRORED} \`main\` @ \`abc1234\``);
    expect(text).toContain("Nobody types here.");
  });

  // Notion links a bare `x.md` and splits bold around inline code; either breaks the exact
  // match the sentinel-for-heading swap needs. So: no code and no `.md` inside any bold span.
  it("keeps every bold span free of inline code and file names, in both headers", () => {
    for (const text of [
      heading({ path: "docs/schema.md", doc: null, version: null, commit: "abc1234" }),
      sentinel({ path: "docs/schema.md", commit: "abc1234", at: "2026-09-14T10:00:00.000Z" }),
    ]) {
      for (const bold of text.match(/\*\*[^*]+\*\*/g) ?? []) {
        expect(bold).not.toMatch(/`|\.md/);
      }
    }
  });

  it("leaves the version out of a file that has none", () => {
    const text = heading({ path: "CLAUDE.md", doc: null, version: null, commit: "abc1234" });
    expect(text).not.toMatch(/\bv\d/);
    expect(text).toContain("`CLAUDE.md` · Mirrored from");
    expect(text).toContain("@ `abc1234`");
  });

  it("marks a refresh in progress with the commit it is writing", () => {
    const text = sentinel({ path: "CLAUDE.md", commit: "abc1234", at: "2026-09-14T10:00:00.000Z" });
    expect(text).toContain(IN_PROGRESS);
    expect(text).toContain("@ `abc1234`");
    expect(text).toContain("2026-09-14T10:00:00.000Z");
    expect(text).not.toContain(MIRRORED);
  });

  it("reads each of its own headers back, and anything else as unknown", () => {
    const done = heading({ path: "CLAUDE.md", doc: null, version: null, commit: "abc1234" });
    expect(parseHeader(done)).toEqual({ state: "mirrored", commit: "abc1234" });
    const half = sentinel({ path: "CLAUDE.md", commit: "def5678", at: "now" });
    expect(parseHeader(half)).toEqual({ state: "in-progress", commit: "def5678" });
    expect(parseHeader("# aenima — agent constitution")).toEqual({
      state: "unknown",
      commit: null,
    });
    expect(parseHeader("")).toEqual({ state: "unknown", commit: null });
  });

  // What `readPlan` meets is the API's `plain_text`, where annotations are separate and a code
  // span has no backticks: the seed's heading arrives as bare words with a bare hash.
  it("reads the seed's heading as the API hands it over — plain text, no markers", () => {
    const seeded =
      "Mirror of CLAUDE.md — edit in the repo. Mirrored from main @ 2fbe69b by the pipeline; refreshed at the start of every run. Nobody types here.";
    expect(parseHeader(seeded)).toEqual({ state: "mirrored", commit: "2fbe69b" });
    const ours =
      "Mirror — refresh in progress. docs/schema.md · Started 2026-09-14T10:40:00.000Z; this page is being rewritten from main @ abc1234 and is not whole until this line says so. Edit in the repo.";
    expect(parseHeader(ours)).toEqual({ state: "in-progress", commit: "abc1234" });
  });

  it("asks git for a seven-character hash outright, whatever core.abbrev says", () => {
    const calls = [];
    const run = (args) => (calls.push(args), { status: 0, stdout: "c0ffee1\n" });
    expect(lastCommit("docs/schema.md", { run })).toBe("c0ffee1");
    expect(calls[0]).toContain(`--abbrev=${ABBREV}`);
    expect(ABBREV).toBe(7);
  });
});

describe("decide and order", () => {
  it("refreshes a page behind main, and leaves a current one alone", () => {
    expect(
      decide({ header: { state: "mirrored", commit: "old0000" }, commit: "new0000" }),
    ).toMatchObject({ refresh: true });
    expect(decide({ header: { state: "mirrored", commit: "new0000" }, commit: "new0000" })).toEqual(
      { refresh: false, reason: "current" },
    );
  });

  it("refreshes a stopped refresh whatever its commit, and a page with no heading", () => {
    expect(
      decide({ header: { state: "in-progress", commit: "new0000" }, commit: "new0000" }),
    ).toMatchObject({ refresh: true, reason: "a refresh stopped partway" });
    expect(decide({ header: { state: "unknown", commit: null }, commit: "new0000" })).toMatchObject(
      { refresh: true, reason: "no mirror heading" },
    );
  });

  it("puts a stopped refresh first and keeps the rest in list order", () => {
    const pages = [
      { title: "a", header: { state: "mirrored" } },
      { title: "b", header: { state: "unknown" } },
      { title: "c", header: { state: "in-progress" } },
      { title: "d", header: { state: "mirrored" } },
    ];
    expect(order(pages).map((p) => p.title)).toEqual(["c", "a", "b", "d"]);
  });
});

describe("chunk", () => {
  const para = (n, ch = "x") => `${ch.repeat(n)}`;

  it("keeps a document under the limit whole", () => {
    expect(chunk("# a\n\nb\n\nc\n", 100)).toEqual(["# a\n\nb\n\nc"]);
  });

  it("splits at a blank line so no chunk passes the limit", () => {
    const text = [para(40), "", para(40), "", para(40)].join("\n");
    const parts = chunk(text, 90);
    expect(parts).toEqual([`${para(40)}\n\n${para(40)}`, para(40)]);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(90);
  });

  it("never splits inside a fenced code block", () => {
    const text = [
      "intro",
      "",
      "```",
      para(30),
      "",
      para(30),
      "",
      para(30),
      "```",
      "",
      "after",
    ].join("\n");
    const parts = chunk(text, 80);
    for (const part of parts) {
      const fences = (part.match(/^```/gm) ?? []).length;
      expect(fences % 2).toBe(0);
    }
    expect(parts.join("\n\n")).toContain("after");
  });

  it("gives a blank-free block longer than the limit its own chunk rather than cutting it at a line", () => {
    const block = `${para(120)}\n${para(120)}`; // two lines, no blank between: a table, a list
    const text = [para(10), "", block, "", para(10)].join("\n");
    expect(chunk(text, 50)).toEqual([para(10), block, para(10)]);
  });

  it("reassembles to the document, blank-line boundaries aside", () => {
    const text = Array.from(
      { length: 30 },
      (_, i) => `## ${i}\n\n${para(500, String.fromCharCode(97 + (i % 26)))}`,
    ).join("\n\n");
    const parts = chunk(text, 3000);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join("\n\n")).toBe(text);
    expect(CHUNK_CHARS).toBeGreaterThan(3000);
  });
});

// The plan over a board and a repository that are both stubbed: the API answers with a
// header block per page, git with the file and its commit.
describe("readPlan", () => {
  const board = () => ({ documents: "docs-page", guidelines: "guide-page", prefix: "⟡ " });
  const callout = (text) => ({ type: "callout", callout: { rich_text: [{ plain_text: text }] } });
  const files = {
    "docs/product-spec.md": "# aenima — Product Specification v1.6\n\nbody\n",
    "docs/design-spec.md": "# aenima — Design Specification v2.17 (web)\n\nbody\n",
    "CLAUDE.md": "# constitution\n\nbody\n",
    "AGENTS.md": "agents\n",
    "docs/build-guide.md": "<!-- build-guide.md · v2.5 -->\n\nbody\n",
    "docs/build-log.md": "# log\n",
    "docs/schema.md": "# schema\n",
    "docs/guidelines.md": "<!-- guidelines.md · v1.7 · in the repo -->\n\n# guidelines\n",
  };
  const run = (args) => {
    if (args[0] === "show") {
      const path = args[1].split(":")[1];
      return path in files ? { status: 0, stdout: files[path] } : { status: 128, stdout: "" };
    }
    if (args[0] === "log") return { status: 0, stdout: "c0ffee1\n" };
    return { status: 0, stdout: "" };
  };
  const api = (headers) => ({
    children: async (id, size) => {
      if (id === "docs-page") {
        return MIRRORS.filter((m) => m.title !== "Guidelines").map((m) => ({
          id: `${m.title}-page`,
          type: "child_page",
          child_page: { title: m.title },
        }));
      }
      expect(size).toBe(1);
      const header = headers[id];
      return header === undefined ? [] : [callout(header)];
    },
  });
  const deps = (headers) => ({
    token: () => "t",
    board,
    client: api(headers),
    run,
    now: () => new Date("2026-09-14T10:00:00Z"),
    out: null,
    skipFetch: true,
  });

  it("says so and plans nothing without the token", async () => {
    const plan = await readPlan({ deps: { token: () => null } });
    expect(plan).toMatchObject({ token: false, pages: [] });
    expect(plan.why).toContain("NOTION_TOKEN");
  });

  it("refreshes the pages behind main, current ones untouched, the file's commit in both headers", async () => {
    const current = heading({ path: "CLAUDE.md", doc: null, version: null, commit: "c0ffee1" });
    const plan = await readPlan({
      deps: deps({ "CLAUDE-page": current, "AGENTS-page": "Mirrored from `main` @ `2fbe69b`" }),
    });
    expect(plan.token).toBe(true);
    const byTitle = Object.fromEntries(plan.pages.map((p) => [p.title, p]));
    expect(byTitle.CLAUDE.refresh).toBe(false);
    expect(byTitle.AGENTS).toMatchObject({ refresh: true, commit: "c0ffee1", page: "AGENTS-page" });
    expect(byTitle.AGENTS.heading).toContain("@ `c0ffee1`");
    expect(byTitle.AGENTS.sentinel).toContain("@ `c0ffee1`");
    expect(byTitle.AGENTS.chunks.map((c) => c.text)).toEqual(["agents"]);
    expect(byTitle.Guidelines).toMatchObject({ page: "guide-page", refresh: true, version: "1.7" });
    expect(byTitle.Guidelines.heading).toContain("· guidelines v1.7 ·");
  });

  // AC2: a write interrupted after chunk 0 left the sentinel; the next preflight puts that page first.
  it("puts a page whose sentinel is still standing first, even at the current commit", async () => {
    const half = sentinel({ path: "docs/schema.md", commit: "c0ffee1", at: "earlier" });
    const done = (path) => heading({ path, doc: null, version: null, commit: "c0ffee1" });
    const headers = Object.fromEntries(
      MIRRORS.map((m) => [
        m.title === "Guidelines" ? "guide-page" : `${m.title}-page`,
        done(m.path),
      ]),
    );
    headers["schema-page"] = half;
    const plan = await readPlan({ deps: deps(headers) });
    expect(plan.pages[0]).toMatchObject({
      title: "schema",
      refresh: true,
      reason: "a refresh stopped partway",
    });
    expect(plan.pages.filter((p) => p.refresh).map((p) => p.title)).toEqual(["schema"]);
  });

  it("reports a sub-page the Documents page does not list as missing rather than planning a write to nowhere", async () => {
    const client = api({});
    const children = client.children;
    client.children = async (id, size) =>
      id === "docs-page"
        ? (await children(id, size)).filter((b) => b.child_page.title !== "schema")
        : children(id, size);
    const plan = await readPlan({ deps: { ...deps({}), client } });
    expect(plan.pages.find((p) => p.title === "schema")).toMatchObject({
      page: null,
      missing: true,
    });
  });
});
