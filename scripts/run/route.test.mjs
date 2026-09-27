import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { agentFor, route, ticketPaths, ticketType } from "./route.mjs";

const root = join(import.meta.dirname, "..", "..");
const TABLE = JSON.parse(readFileSync(join(root, ".claude", "board.json"), "utf8"));

// T0.44 TC5 → AC5: the route is read off the board's table, never off the session's say-so.
describe("the route", () => {
  it("runs a Fix that touches no migration and no harness at medium", () => {
    expect(route({ type: "Fix", paths: ["src/app/app/page.tsx"] }, TABLE)).toEqual({
      route: "medium",
      effort: { builder: "medium", reviewer: "medium", gatekeeper: "medium" },
      agents: { builder: "builder-medium", reviewer: "reviewer-medium" },
    });
    expect(route({ type: "Content", paths: [] }, TABLE).route).toBe("medium");
  });

  it("runs a Fix at xhigh the moment it names a migration, scripts/ or .claude/", () => {
    for (const path of [
      "drizzle/0020_x.sql",
      "scripts/run/runs.mjs",
      ".claude/agents/builder.md",
    ]) {
      expect(route({ type: "Fix", paths: [path] }, TABLE)).toMatchObject({
        route: "xhigh",
        agents: { builder: "builder", reviewer: "reviewer" },
      });
    }
  });

  it("runs a Feature at xhigh", () => {
    expect(route({ type: "Feature", paths: [] }, TABLE)).toMatchObject({
      route: "xhigh",
      effort: { builder: "xhigh", reviewer: "xhigh", gatekeeper: "medium" },
    });
  });

  it("records fallback, at xhigh, for a shape the table does not cover", () => {
    for (const type of [null, "Chore"]) {
      expect(route({ type, paths: [] }, TABLE)).toMatchObject({
        route: "fallback",
        effort: { builder: "xhigh", reviewer: "xhigh" },
        agents: { builder: "builder", reviewer: "reviewer" },
      });
    }
  });

  it("keeps the gatekeeper at medium whatever the ticket", () => {
    expect(route({ type: "Feature" }, TABLE).effort.gatekeeper).toBe("medium");
    expect(route({ type: null }, TABLE).effort.gatekeeper).toBe("medium");
  });

  it("names the agent file an effort runs as", () => {
    expect(agentFor("builder", "xhigh")).toBe("builder");
    expect(agentFor("reviewer", "medium")).toBe("reviewer-medium");
  });

  it("reads a ticket file's Type and the paths its own sections name, Cited left out", () => {
    const text = [
      "# T9.9 — x",
      "",
      "_Task: [T9.9 x](u) · Epic E9 · Type Fix · Priority Medium_",
      "",
      "## Build",
      "",
      "Edit `src/lib/a.ts` and call `thing`.",
      "",
      "## Cited",
      "",
      "Quoted: `scripts/run/runs.mjs`.",
    ].join("\n");
    expect(ticketType(text)).toBe("Fix");
    expect(ticketPaths(text)).toEqual(["src/lib/a.ts"]);
    expect(ticketType("no header")).toBeNull();
  });
});
