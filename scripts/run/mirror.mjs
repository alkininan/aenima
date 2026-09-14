#!/usr/bin/env node
/**
 * Step 0 — the Documents and Guidelines mirrors, planned.
 *
 * Notion never holds a document; it holds machine-written mirrors of the repo's, each headed
 * with the commit it mirrors (docs/guidelines.md §1, §2). This plans one preflight's refresh:
 * which pages are behind `origin/main`, in what order, and the exact text each write carries.
 * The writes themselves go through the connector from the skill — `replace_content`,
 * `insert_content`, `update_content`, `allow_async: false` on every one — because the
 * connector takes the document as markdown and the API would need every block spelled out.
 * What this script does is everything that is countable: read each page's first block over
 * the API for the commit it claims, compare with the file's last commit on `origin/main`,
 * split the file into chunks the connector accepts, and compose the two headers.
 *
 * Header-last, under a sentinel. A refresh first replaces the page with the *refresh in
 * progress* callout alone, then appends the chunks, then swaps the callout for the *mirrored
 * from* heading. A page is therefore either whole and headed with its commit, or visibly in
 * progress — never in between. A sentinel still standing at the next preflight is a write
 * that died partway, and that page is refreshed first, whatever its commit.
 *
 * Pure parts — `parseHeader`, `heading`, `sentinel`, `chunk`, `decide`, `order` — are
 * tested; `readPlan` gathers the observations with git and the API and is injected.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { emit, isMain } from "./cli.mjs";
import { client, plain, readBoard, readToken, TOKEN_VAR } from "./notion.mjs";
import { parseHeaderVersion } from "./version-drift.mjs";

/** The seven Documents sub-pages by title, and Guidelines, each with the file it mirrors. */
export const MIRRORS = [
  { title: "product-spec", path: "docs/product-spec.md", doc: "product-spec" },
  { title: "design-spec", path: "docs/design-spec.md", doc: "design-spec" },
  { title: "CLAUDE", path: "CLAUDE.md", doc: null },
  { title: "AGENTS", path: "AGENTS.md", doc: null },
  { title: "build-guide", path: "docs/build-guide.md", doc: "build-guide" },
  { title: "build-log", path: "docs/build-log.md", doc: null },
  { title: "schema", path: "docs/schema.md", doc: null },
  { title: "Guidelines", path: "docs/guidelines.md", doc: "guidelines" },
];

/** The most a single connector write carries. */
export const CHUNK_CHARS = 24000;

/** The branch a mirror reads from — never the run's own. */
export const BASE = "origin/main";

/** The two states a header can be in, and the words that say so. */
export const MIRRORED = "Mirrored from";
export const IN_PROGRESS = "refresh in progress";

/**
 * The finished heading, as the connector's callout markdown. `version` is the document's own
 * header version, or null for a file without one.
 *
 * The shape is chosen for an exact round trip, because the swap of sentinel for heading
 * (`update_content`) has to match the page's own rendering of what was written: Notion turns a
 * bare `x.md` into a link and splits a bold span around inline code, so the path sits in
 * inline code outside the bold, and the bold carries only words.
 */
export function heading({ path, doc, version, commit }) {
  const versioned = doc && version ? ` · ${doc} v${version}` : "";
  return (
    `<callout icon="/icons/link_gray.svg" color="gray_bg">\n` +
    `\t**Mirror — edit in the repo.** \`${path}\`${versioned} · ${MIRRORED} \`main\` @ \`${commit}\` ` +
    `by the pipeline; refreshed at the start of every run. Nobody types here.\n` +
    `</callout>`
  );
}

/** The sentinel a refresh starts with: the page says it is not whole until the heading replaces this. */
export function sentinel({ path, commit, at }) {
  return (
    `<callout icon="/icons/link_gray.svg" color="orange_bg">\n` +
    `\t**Mirror — ${IN_PROGRESS}.** \`${path}\` · Started ${at}; this page is being rewritten ` +
    `from \`main\` @ \`${commit}\` and is not whole until this line says so. Edit in the repo.\n` +
    `</callout>`
  );
}

/**
 * What a page's first block says: `{ state, commit }` with state `mirrored`, `in-progress`
 * or `unknown` — an empty page, or a first block that is not one of ours.
 */
export function parseHeader(text) {
  const body = String(text ?? "");
  const commit = body.match(/@\s*`?([0-9a-f]{7,40})`?/)?.[1] ?? null;
  if (body.includes(IN_PROGRESS)) return { state: "in-progress", commit };
  if (body.includes(MIRRORED) && commit) return { state: "mirrored", commit };
  return { state: "unknown", commit: null };
}

/**
 * Split a document into chunks at blank lines outside fenced code, so no table, list or code
 * block is cut in two, each chunk at most `max` characters — except a blank-free block longer
 * than `max`, which waits for its next blank line and goes whole as its own chunk, since
 * cutting it at a line would be cutting the table or list it is.
 */
export function chunk(text, max = CHUNK_CHARS) {
  const lines = String(text ?? "").split("\n");
  const chunks = [];
  let current = [];
  let size = 0;
  let fenced = false;
  let boundary = -1; // index in `current` of the last blank line outside a fence, -1 for none
  const isFence = (line) => /^\s*(```|~~~)/.test(line);

  const flush = (upTo) => {
    const head = current.slice(0, upTo).join("\n");
    if (head.trim() !== "") chunks.push(head);
    current = current.slice(upTo);
    size = current.reduce((n, l) => n + l.length + 1, 0);
    // What stays begins outside a fence — a flush lands only on such a line — so the last
    // blank outside a fence in it is found by walking it once. A blank at index 0 heads
    // nothing and is no boundary.
    boundary = -1;
    let inside = false;
    current.forEach((l, i) => {
      if (isFence(l)) inside = !inside;
      else if (!inside && l.trim() === "" && i > 0) boundary = i;
    });
  };

  for (const line of lines) {
    // Over the limit with a blank line to cut at: cut there. With none — one blank-free block,
    // or a fence still open — keep going; the block goes whole at its next blank line.
    if (size + line.length + 1 > max && boundary > 0) flush(boundary);
    if (isFence(line)) fenced = !fenced;
    else if (!fenced && line.trim() === "" && current.length > 0) boundary = current.length;
    current.push(line);
    size += line.length + 1;
  }
  if (current.join("\n").trim() !== "") chunks.push(current.join("\n"));
  return chunks.map((c) => c.replace(/^\n+/, "").replace(/\n+$/, ""));
}

/** Whether one page needs a refresh, and why. */
export function decide({ header, commit }) {
  if (header.state === "in-progress") return { refresh: true, reason: "a refresh stopped partway" };
  if (header.state !== "mirrored") return { refresh: true, reason: "no mirror heading" };
  if (header.commit !== commit) {
    return { refresh: true, reason: `behind main: mirrors ${header.commit}, main is at ${commit}` };
  }
  return { refresh: false, reason: "current" };
}

/** The refresh order: a stopped refresh first, then the rest as listed. */
export function order(pages) {
  const rank = (page) => (page.header?.state === "in-progress" ? 0 : 1);
  return pages
    .map((page, i) => ({ page, i }))
    .sort((a, b) => rank(a.page) - rank(b.page) || a.i - b.i)
    .map(({ page }) => page);
}

const git = (args, cwd) => spawnSync("git", args, { cwd, encoding: "utf8" });

/** The short hash of the last commit on `base` that touched `path`, or null. */
export function lastCommit(path, { cwd = process.cwd(), base = BASE, run } = {}) {
  const g = run ?? ((args) => git(args, cwd));
  const log = g(["log", "-1", "--format=%h", base, "--", path]);
  const hash = log.status === 0 ? log.stdout.trim() : "";
  return hash === "" ? null : hash;
}

/** The file as `base` holds it, or null when it is not there. */
export function fileAt(path, { cwd = process.cwd(), base = BASE, run } = {}) {
  const g = run ?? ((args) => git(args, cwd));
  const show = g(["show", `${base}:${path}`]);
  return show.status === 0 ? show.stdout : null;
}

/**
 * The plan for `dir`: `{ token, pages }`, pages in refresh order, each `{ title, path, page,
 * commit, version, header, refresh, reason, sentinel, heading, chunks }` — `chunks` the files
 * holding each write's markdown, under the OS temp dir so the checkout stays clean. Effects
 * injected: `token`, `board`, `client`, `run`, `now`, `out`.
 */
export async function readPlan({ dir = process.cwd(), deps = {} } = {}) {
  const token = deps.token ? deps.token() : readToken(dir);
  if (token === null) {
    return { token: false, why: `${TOKEN_VAR} is not in .env.local`, pages: [] };
  }
  const board = deps.board ? deps.board() : readBoard(dir);
  const api = deps.client ?? client(token, { fetch: deps.fetch });
  const run = deps.run ?? ((args) => git(args, dir));
  const now = deps.now ?? (() => new Date());
  const out = deps.out ?? join(tmpdir(), "aenima-mirror");

  if (!deps.skipFetch) run(["fetch", "--quiet", "origin"]);

  // The seven sub-pages by title, from the Documents page's own children.
  const children = await api.children(board.documents);
  const byTitle = new Map();
  for (const block of children) {
    if (block?.type === "child_page") byTitle.set(block.child_page?.title, block.id);
  }

  const pages = [];
  for (const mirror of MIRRORS) {
    const page =
      mirror.title === "Guidelines" ? board.guidelines : (byTitle.get(mirror.title) ?? null);
    const content = fileAt(mirror.path, { run });
    const commit = lastCommit(mirror.path, { run });
    if (page === null || content === null || commit === null) {
      pages.push({ ...mirror, page, commit, missing: true });
      continue;
    }
    const first = (await api.children(page, 1))[0];
    const header = parseHeader(plain(first?.[first?.type]?.rich_text));
    const version = parseHeaderVersion(content);
    const { refresh, reason } = decide({ header, commit });
    pages.push({
      ...mirror,
      page,
      commit,
      version,
      header,
      refresh,
      reason,
      sentinel: sentinel({ path: mirror.path, commit, at: now().toISOString() }),
      heading: heading({ path: mirror.path, doc: mirror.doc, version, commit }),
      chunks: refresh ? chunk(content).map((text) => ({ text })) : [],
    });
  }

  const ordered = order(pages);
  if (deps.out !== null) {
    mkdirSync(out, { recursive: true });
    for (const page of ordered) {
      page.chunks = (page.chunks ?? []).map(({ text }, i) => {
        const file = join(out, `${page.title}-${page.commit}-${i}.md`);
        writeFileSync(file, text);
        return { file, chars: text.length };
      });
    }
  }
  return { token: true, pages: ordered };
}

/** CLI: `node mirror.mjs`, run from the checkout. */
async function main() {
  emit(await readPlan());
}

if (isMain(import.meta.url)) await main();
