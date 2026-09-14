import { describe, expect, it } from "vitest";

import { gatedDiff, gatedPaths, isGatedPath, scriptsChanged } from "./gated.mjs";

// T0.16 TC2 → AC2 and TC3 → AC3. A run merges its own diff only where a human still adds
// nothing: a path that changes what a run is allowed to do, or what the product is, waits for
// the word. The list is the ticket's (Build 2), and it is read in code by the guard and the
// skill both.
describe("isGatedPath", () => {
  it("gates the harness, the migrations, the product spec and the two dotfiles", () => {
    for (const path of [
      "drizzle/0015_x.sql",
      "drizzle/meta/_journal.json",
      "docs/product-spec.md",
      ".claude/settings.json",
      ".claude/skills/ticket/SKILL.md",
      "scripts/hooks/guard.mjs",
      "scripts/run/notion.mjs",
      ".worktreeinclude",
      ".gitignore",
    ]) {
      expect(isGatedPath(path), path).toBe(true);
    }
  });

  it("lets the product code, the other docs and the tests through", () => {
    for (const path of [
      "src/app/page.tsx",
      "src/db/queries/items.ts",
      "docs/design-spec.md",
      "docs/guidelines.md",
      "docs/reports/T0.16.md",
      "scripts/seed.ts",
      "e2e/auth.spec.ts",
      "package.json",
      "README.md",
    ]) {
      expect(isGatedPath(path), path).toBe(false);
    }
  });

  it("does not read a name that merely contains a gated word as gated", () => {
    expect(isGatedPath("src/drizzle/thing.ts")).toBe(false);
    expect(isGatedPath("docs/product-spec-notes.md")).toBe(false);
    expect(isGatedPath("scripts/hooks-notes.md")).toBe(false);
  });
});

describe("scriptsChanged", () => {
  const pkg = (scripts) => JSON.stringify({ name: "aenima", scripts });

  it("is true only when the scripts object differs, key order aside", () => {
    expect(scriptsChanged(pkg({ a: "1", b: "2" }), pkg({ b: "2", a: "1" }))).toBe(false);
    expect(scriptsChanged(pkg({ a: "1" }), pkg({ a: "2" }))).toBe(true);
    expect(scriptsChanged(pkg({ a: "1" }), pkg({ a: "1", c: "3" }))).toBe(true);
  });

  it("is false when the rest of the file changes and the scripts do not", () => {
    const main = JSON.stringify({ name: "aenima", version: "1", scripts: { a: "1" } });
    const head = JSON.stringify({ name: "aenima", version: "2", scripts: { a: "1" } });
    expect(scriptsChanged(main, head)).toBe(false);
  });

  it("reads an unparseable side as changed — a broken package.json is not a known one", () => {
    expect(scriptsChanged("{", pkg({ a: "1" }))).toBe(true);
    expect(scriptsChanged(null, pkg({ a: "1" }))).toBe(true);
  });
});

describe("gatedPaths and gatedDiff", () => {
  it("lists the gated paths of a diff, package.json only when its scripts moved", () => {
    const files = ["src/a.ts", "scripts/hooks/guard.mjs", "package.json", "drizzle/0015.sql"];
    expect(gatedPaths(files, { packageScriptsChanged: false })).toEqual([
      "scripts/hooks/guard.mjs",
      "drizzle/0015.sql",
    ]);
    expect(gatedPaths(files, { packageScriptsChanged: true })).toEqual([
      "scripts/hooks/guard.mjs",
      "package.json",
      "drizzle/0015.sql",
    ]);
  });

  it("is ok when nothing gated is in the diff", () => {
    const result = gatedDiff({
      files: ["src/a.ts", "docs/reports/T0.16.md"],
      mainPackage: '{"scripts":{"a":"1"}}',
      headPackage: '{"scripts":{"a":"1"}}',
    });
    expect(result).toEqual({ files: ["src/a.ts", "docs/reports/T0.16.md"], gated: [], ok: true });
  });

  it("is not ok when the scripts of package.json changed, and names the file", () => {
    const result = gatedDiff({
      files: ["package.json"],
      mainPackage: '{"scripts":{"a":"1"}}',
      headPackage: '{"scripts":{"a":"1","b":"2"}}',
    });
    expect(result.ok).toBe(false);
    expect(result.gated).toEqual(["package.json"]);
  });

  it("does not consult package.json when the diff does not touch it", () => {
    const result = gatedDiff({ files: ["src/a.ts"], mainPackage: "{", headPackage: "{" });
    expect(result.ok).toBe(true);
  });
});
