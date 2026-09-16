import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  readBlocks,
  readPlan,
  readVerify,
  sentinel,
  SLACK,
  verify,
  written,
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

  // T0.23 TC4 → AC4 — a page whose header commit equals main's is skipped: no write, no chunk.
  it("skips every page whose header commit equals the file's on main — nothing refreshed, no chunk planned", async () => {
    const headers = Object.fromEntries(
      MIRRORS.map((m) => [
        m.title === "Guidelines" ? "guide-page" : `${m.title}-page`,
        heading({ path: m.path, doc: m.doc, version: null, commit: "c0ffee1" }),
      ]),
    );
    const plan = await readPlan({ deps: deps(headers) });
    expect(plan.pages).toHaveLength(MIRRORS.length);
    for (const page of plan.pages) {
      expect(page, page.title).toMatchObject({ refresh: false, reason: "current", chunks: [] });
    }
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

// T0.23 TC3 → AC3 — a chunk that arrives cut off is found by reading the page back, and the page
// is rewritten once: whole, visibly in progress, or rewritten, never quietly truncated.
describe("verify", () => {
  const block = (type, text) => ({ type, [type]: { rich_text: [{ plain_text: text }] } });
  const header = block("callout", "Mirror — refresh in progress. docs/x.md · Started earlier");
  const markdown = [
    "# Title\n\n1. **Bold** `code [a](b.md)` and a line that runs on",
    "   past its wrap.\n\n```sql\ncreate role x;\n```\n\n<!-- a note\n     over two lines -->",
    "\n\n| a | b |\n|---|---|\n| one | two |\n\n[link](https://x.y) end of the chunk, said in full.",
  ].join("");
  /** The same document as Notion hands its blocks back: plain text, markers and targets gone. */
  const blocks = [
    header,
    block("heading_1", "Title"),
    block("numbered_list_item", "Bold code [a](b.md) and a line that runs on"),
    block("paragraph", "past its wrap."),
    block("code", "create role x;"),
    { type: "table", table: {} },
    { type: "table_row", table_row: { cells: [[{ plain_text: "a" }], [{ plain_text: "b" }]] } },
    { type: "table_row", table_row: { cells: [[{ plain_text: "one" }], [{ plain_text: "two" }]] } },
    block("paragraph", "link end of the chunk, said in full."),
  ];

  it("reads markdown as the letters and digits a page keeps — a fence's language, a list's number, a link's target and a comment aside", () => {
    expect(written(markdown)).toBe(
      "TitleBoldcodeabmdandalinethatrunsonpastitswrapcreaterolexabonetwolinkendofthechunksaidinfull",
    );
    expect(written("**4. Every mutating action**")).toBe("Everymutatingaction");
  });

  it("passes a page that holds every chunk sent so far", () => {
    const at = markdown.indexOf("\n\n| a |");
    const [first, second] = [markdown.slice(0, at), markdown.slice(at + 2)];
    expect(verify({ chunks: [first, second], blocks })).toEqual({
      ok: true,
      next: "continue",
      sent: 92,
      found: 92,
      short: 0,
      ended: true,
    });
  });

  it("finds a chunk cut off mid-sentence, however few characters it lost", () => {
    const cut = [...blocks.slice(0, -1), block("paragraph", "link end of the chunk, said in")];
    expect(verify({ chunks: [markdown], blocks: cut })).toMatchObject({
      ok: false,
      short: 4,
      ended: false,
    });
  });

  it("finds a chunk that lost more than the slack from its middle, its ending intact", () => {
    const long = `${"word ".repeat(40)}\n\n${markdown}`;
    const lost = [header, ...blocks.slice(1)];
    expect(verify({ chunks: [long], blocks: lost })).toMatchObject({
      ok: false,
      short: 160,
      ended: true,
    });
    expect(SLACK).toBeLessThan(160);
  });

  it("allows the handful of characters Notion renders its own way", () => {
    const near = blocks.map((b) => (b.type === "heading_1" ? block("heading_1", "Titl") : b));
    expect(verify({ chunks: [markdown], blocks: near })).toMatchObject({ ok: true, short: 1 });
  });

  it("rewrites a short page once, and leaves it under its sentinel the second time", () => {
    const cut = blocks.slice(0, -1);
    expect(verify({ chunks: [markdown], blocks: cut }).next).toBe("rewrite");
    expect(verify({ chunks: [markdown], blocks: cut, rewritten: 1 }).next).toBe("leave");
    expect(verify({ chunks: [markdown], blocks, rewritten: 1 }).next).toBe("continue");
  });

  it("reads a page's blocks back in order with their children — continuation lines and table rows — and never a child page's", async () => {
    const tree = {
      page: [
        { id: "p1", type: "paragraph", has_children: true },
        { id: "t1", type: "table", has_children: true },
        { id: "c1", type: "child_page", has_children: true },
        { id: "p2", type: "paragraph", has_children: false },
      ],
      p1: [{ id: "p1a", type: "paragraph", has_children: false }],
      t1: [
        { id: "r1", type: "table_row", has_children: false },
        { id: "r2", type: "table_row", has_children: false },
      ],
      c1: [{ id: "inside", type: "paragraph", has_children: false }],
    };
    const api = { children: async (id) => tree[id] ?? [] };
    expect((await readBlocks(api, "page")).map((b) => b.id)).toEqual([
      "p1",
      "p1a",
      "t1",
      "r1",
      "r2",
      "c1",
      "p2",
    ]);
  });

  it("says so and reads nothing without the token", async () => {
    const result = await readVerify({ page: "x", files: [], deps: { token: () => null } });
    expect(result).toMatchObject({ token: false, ok: false });
    expect(result.why).toContain("NOTION_TOKEN");
  });

  it("reads the chunk files sent so far and the page, and answers for both", async () => {
    const at = markdown.indexOf("\n\n| a |");
    const files = { "c0.md": markdown.slice(0, at), "c1.md": markdown.slice(at + 2) };
    const api = { children: async (id) => (id === "page-1" ? blocks : []) };
    const result = await readVerify({
      page: "page-1",
      files: ["c0.md", "c1.md"],
      rewritten: 1,
      deps: { token: () => "t", client: api, read: (file) => files[file] },
    });
    expect(result).toEqual({
      token: true,
      page: "page-1",
      ok: true,
      next: "continue",
      sent: 92,
      found: 92,
      short: 0,
      ended: true,
    });
  });
});

// T0.23 TC3 → AC3 — what the skill's step 0 and guidelines §2 tell a run to do after each chunk.
describe("the read-back, in the skill and guidelines §2", () => {
  const root = join(import.meta.dirname, "..", "..");
  const skill = readFileSync(join(root, ".claude/skills/ticket/SKILL.md"), "utf8");
  const guidelines = readFileSync(join(root, "docs/guidelines.md"), "utf8");

  it("reads each chunk back, rewrites a short page once from its sentinel, and leaves it there the second time", () => {
    const step0 = skill.match(/^## 0 Preflight\n[\s\S]*?(?=^## 1 )/m)?.[0] ?? "";
    expect(step0).toContain("node scripts/run/mirror.mjs --verify");
    expect(step0).toContain("`next: rewrite`");
    expect(step0).toContain("`next: leave`");
    expect(step0).toContain("--rewritten 1");
  });

  it("says so in §2, where the mirrors are described", () => {
    const documents = guidelines.match(/^### Documents\n[\s\S]*?(?=^---)/m)?.[0] ?? "";
    expect(documents).toContain("mirror.mjs --verify");
    expect(documents).toContain("rewritten once from its sentinel");
  });
});
