import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * What `eslint .` walks into (T0.14). Claude Code puts every session's worktree under
 * `.claude/worktrees/` (.gitignore:57), and a worktree that has built holds its own
 * `.next/types` output; the gate's lint from the primary checkout must not read it as the
 * repository's code. The root config is loaded as the gate loads it, from the repo root.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const eslint = new ESLint({ cwd: root });

const violation = "var probe = 1;\nexport { probe };\n";

describe("eslint ignores", () => {
  it("TC1 → AC1 ignores another session's worktree, build output included", async () => {
    const generated = join(root, ".claude/worktrees/other-session/.next/types/routes.d.ts");
    const source = join(root, ".claude/worktrees/other-session/src/app/page.tsx");

    expect(await eslint.isPathIgnored(generated)).toBe(true);
    expect(await eslint.isPathIgnored(source)).toBe(true);
  });

  it("TC2 → AC2 still reports a violation in the repository's own code", async () => {
    const own = join(root, "scripts/run/probe.ts");

    expect(await eslint.isPathIgnored(own)).toBe(false);
    const [result] = await eslint.lintText(violation, { filePath: own });
    expect(result.messages.map((message) => message.ruleId)).toContain("no-var");
  });
});
