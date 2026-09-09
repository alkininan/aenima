import { describe, expect, it } from "vitest";

import { decide, parse, program, target, writeTargets } from "./guard.mjs";

/** A PreToolUse payload for a Bash call, with the branch the rule (d) check would see. */
const bash = (command, branch = "t0-7") => [
  { tool_name: "Bash", tool_input: { command }, cwd: "/repo" },
  { currentBranch: () => branch },
];

const file = (tool_name, file_path) => [{ tool_name, tool_input: { file_path } }, {}];

describe("rule (a) — drizzle-kit push", () => {
  it("refuses pnpm db:push and names the policies it would drop", () => {
    const reason = decide(...bash("pnpm db:push"));
    expect(reason).toContain("drizzle/0001_policies.sql");
  });

  it("refuses the underlying binary, not only the script alias", () => {
    expect(decide(...bash("pnpm exec drizzle-kit push --force"))).toContain("drizzle-kit push");
  });

  it("allows db:generate, which is how a migration is meant to be made", () => {
    expect(decide(...bash("pnpm db:generate"))).toBeNull();
  });
});

describe("rule (b) — db:migrate", () => {
  it("refuses it and names the ticket that will lift the refusal", () => {
    expect(decide(...bash("pnpm db:migrate"))).toContain("T0.10");
  });
});

describe("rule (c) — production deploys", () => {
  it("refuses vercel --prod", () => {
    expect(decide(...bash("vercel --prod"))).toContain("human step");
  });

  it("refuses vercel deploy", () => {
    expect(decide(...bash("vercel deploy"))).toContain("human step");
  });

  it("allows a vercel call that neither deploys nor targets production", () => {
    expect(decide(...bash("vercel env ls"))).toBeNull();
  });
});

describe("rule (d) — force-push and merging on main", () => {
  it("refuses --force", () => {
    expect(decide(...bash("git push --force origin main"))).toContain("Force-pushing");
  });

  it("refuses a bundled short -f", () => {
    expect(decide(...bash("git push -qf origin main"))).toContain("Force-pushing");
  });

  it("refuses --force-with-lease, which is still a rewrite", () => {
    expect(decide(...bash("git push --force-with-lease"))).toContain("Force-pushing");
  });

  it("allows a plain push, and a push with unrelated flags", () => {
    expect(decide(...bash("git push origin t0-7"))).toBeNull();
    expect(decide(...bash("git push -u origin t0-7 --follow-tags"))).toBeNull();
  });

  it("refuses a merge while main is checked out", () => {
    expect(decide(...bash("git merge t0-7", "main"))).toContain("main is checked out");
  });

  it("allows a merge on any other branch", () => {
    expect(decide(...bash("git merge origin/main", "t0-7"))).toBeNull();
  });

  // TC5 → AC5, second half. A ticket reaches main through a merge the human makes.
  it("refuses a push that names main, in every refspec shape", () => {
    for (const command of [
      "git push origin main",
      "git push origin +main",
      "git push origin HEAD:main",
      "git push origin main:main",
      "git push origin refs/heads/main",
      "git -C /tmp/wt push origin main",
      "GIT_TRACE=1 git push origin main",
      "pnpm build && git push origin main",
    ]) {
      expect(decide(...bash(command, "t0-8")), command).toContain("Pushing main is refused");
    }
  });

  it("refuses a bare push while main is the branch checked out", () => {
    expect(decide(...bash("git push", "main"))).toContain("Pushing main is refused");
    expect(decide(...bash("git push origin", "main"))).toContain("Pushing main is refused");
  });

  it("allows a bare push from a ticket branch", () => {
    expect(decide(...bash("git push", "t0-8"))).toBeNull();
    expect(decide(...bash("git push -u origin t0-8", "t0-8"))).toBeNull();
  });

  it("allows a branch whose name merely contains main", () => {
    expect(decide(...bash("git push origin maintenance", "t0-8"))).toBeNull();
    expect(decide(...bash("git push origin main-fix", "t0-8"))).toBeNull();
  });

  it("allows reading main, which is not writing it", () => {
    expect(decide(...bash("git fetch origin main", "t0-8"))).toBeNull();
    expect(decide(...bash("git log origin/main..HEAD", "t0-8"))).toBeNull();
  });

  it("allows git merge-base and friends on main — they read, they do not merge", () => {
    expect(decide(...bash("git merge-base main HEAD", "main"))).toBeNull();
    expect(decide(...bash("git merge-tree HEAD main", "main"))).toBeNull();
  });

  it("reads force flags off the push itself, not off whatever follows it", () => {
    expect(decide(...bash("git push origin t0-7 && rm -rf dist"))).toBeNull();
  });

  it("still sees the push when git options sit between git and push", () => {
    expect(decide(...bash("git -C /tmp/wt push --force"))).toContain("Force-pushing");
    expect(decide(...bash("git -c push.default=current push -f"))).toContain("Force-pushing");
    expect(decide(...bash("git -C /tmp/wt push origin t0-7"))).toBeNull();
  });

  // The fifth cold review: a newline is whitespace to the tokenizer, so a multi-line Bash call
  // — the everyday shape — was one simple command named after line one, and every per-command
  // rule skipped line two.
  it("reads each line of a multi-line command as its own command", () => {
    expect(decide(...bash("echo hi\ngit push --force"))).toContain("Force-pushing");
    expect(decide(...bash("cd /x\ngit merge foo", "main"))).toContain("main is checked out");
    expect(decide(...bash("ls\ncp /tmp/x .env.local"))).toContain("refused");
  });

  it("joins a backslash-continued line the way the shell does", () => {
    expect(decide(...bash("git push origin main \\\n--force"))).toContain("Force-pushing");
    expect(decide(...bash("git \\\nmerge feature", "main"))).toContain("main is checked out");
    expect(decide(...bash("cp /tmp/x \\\n.env.local"))).toContain("refused");
  });

  it("sees git behind a leading assignment or a wrapper", () => {
    expect(decide(...bash("GIT_TRACE=1 git push --force"))).toContain("Force-pushing");
    expect(decide(...bash("env GIT_TRACE=1 git push -f"))).toContain("Force-pushing");
    expect(decide(...bash("command git merge foo", "main"))).toContain("main is checked out");
    expect(decide(...bash("GIT_TRACE=1 git push origin t0-7"))).toBeNull();
  });

  it("still sees the merge when git options sit between git and merge", () => {
    expect(decide(...bash("git -C /tmp/wt merge t0-7", "main"))).toContain("main is checked out");
    expect(decide(...bash("git -c merge.ff=false merge t0-7", "main"))).toContain(
      "main is checked out",
    );
    expect(decide(...bash("git -C /tmp/wt merge t0-7", "t0-7"))).toBeNull();
  });
});

describe("rule (e) — writes to .env files", () => {
  it("refuses an Edit and a Write, naming the path", () => {
    expect(decide(...file("Edit", "/repo/.env.local"))).toContain(".env.local");
    expect(decide(...file("Write", ".env"))).toContain(".env");
  });

  it("allows an Edit anywhere else", () => {
    expect(decide(...file("Edit", "src/app/page.tsx"))).toBeNull();
  });

  // TC5 → AC5, first half. `.env.example` is tracked, public by design and holds
  // placeholders, so a ticket that adds a variable has to be able to document it.
  it("allows .env.example, and only that one", () => {
    expect(decide(...file("Edit", ".env.example"))).toBeNull();
    expect(decide(...file("Write", "/repo/.env.example"))).toBeNull();
    expect(decide(...bash("echo KEY= >> .env.example"))).toBeNull();

    expect(decide(...file("Edit", ".env.examples"))).toContain("refused");
    expect(decide(...file("Edit", ".env.example.local"))).toContain("refused");
    expect(decide(...file("Edit", ".env.local"))).toContain("refused");
  });

  it("refuses every shape of shell write", () => {
    for (const command of [
      "echo KEY=1 > .env.local",
      "echo KEY=1 >>.env.local",
      "printf x | tee .env.local",
      "cp /tmp/x .env.local",
      "mv /tmp/x config/.env.production",
      "sed -i '' s/a/b/ .env.local",
      "printf x >& .env.local",
      "printf x >| .env.local",
      "sed --in-place s/a/b/ .env.local",
    ]) {
      expect(decide(...bash(command)), command).toContain("refused");
    }
  });

  it("allows reading one, and allows a redirect whose target is not an env file", () => {
    expect(decide(...bash("cat .env.local"))).toBeNull();
    expect(decide(...bash("grep DATABASE_URL .env.local > /tmp/keys"))).toBeNull();
    expect(decide(...bash("echo hi > notes.txt"))).toBeNull();
  });

  it("collects the write target and not the operands around it", () => {
    expect(writeTargets("grep DATABASE_URL .env.local > /tmp/keys")).toEqual(["/tmp/keys"]);
    expect(writeTargets("cat a.txt b.txt | tee out.txt")).toEqual(["out.txt"]);
  });
});

describe("calls the guard has no opinion about", () => {
  it("lets a Read of an env file through — rule (e) is about writes", () => {
    expect(decide(...file("Read", ".env.local"))).toBeNull();
  });

  it("lets a malformed or empty payload through rather than refusing everything", () => {
    expect(decide({})).toBeNull();
    expect(decide({ tool_name: "Bash", tool_input: {} })).toBeNull();
  });
});

// TC1 → AC1. Rules match on commands, never on text: the executable and its arguments,
// after the line is parsed the way the shell would run it. T0.98 and T0.8's close were
// both refused for *mentioning* a command in a file they were writing.
describe("TC1 — the guard reads commands, not text", () => {
  const marker = (command, active) => [
    { tool_name: "Bash", tool_input: { command }, cwd: "/repo" },
    { currentBranch: () => "t0-9", runActive: () => active },
  ];

  it("allows a heredoc that mentions db:migrate — a body is data, not a command", () => {
    const readme =
      "cat <<'EOF' > docs/x.md\nRun pnpm db:migrate after review.\ndrizzle-kit push is refused.\nEOF";
    expect(decide(...bash(readme))).toBeNull();
    expect(decide(...bash("cat <<-EOF\n\tpnpm db:push\n\tEOF"))).toBeNull();
    expect(decide(...bash('cat <<"EOF" | tee notes.md\npnpm db:migrate\nEOF'))).toBeNull();
    // Announced and never closed: still a body, still not a command.
    expect(decide(...bash("cat <<EOF\npnpm db:push"))).toBeNull();
  });

  it('allows a quoted mention — echo "pnpm db:push" prints, it does not push', () => {
    expect(decide(...bash('echo "pnpm db:push"'))).toBeNull();
    expect(decide(...bash("git commit -m 'guard: pnpm db:push refused'"))).toBeNull();
    expect(decide(...bash('grep -n "db:migrate" scripts/hooks/guard.mjs'))).toBeNull();
    expect(decide(...bash("echo pnpm db:push"))).toBeNull();
  });

  it("refuses pnpm db:push itself, in every runner shape", () => {
    for (const command of [
      "pnpm db:push",
      "npm run db:push",
      "yarn db:push",
      "pnpm -r db:push",
      "npx drizzle-kit push",
      "pnpm exec drizzle-kit push",
      "./node_modules/.bin/drizzle-kit push",
    ]) {
      expect(decide(...bash(command)), command).toContain("drizzle-kit push is refused");
    }
  });

  it("sees the git push behind an assignment and a -C path", () => {
    expect(decide(...bash("FOO=1 git -C x push -f"))).toContain("Force-pushing");
    expect(decide(...bash("sudo -u deploy git push --force"))).toContain("Force-pushing");
    expect(decide(...bash("FOO=1 git -C x push origin t0-9"))).toBeNull();
  });

  it("refuses gh pr merge while the run marker exists, and allows it without", () => {
    expect(decide(...marker("gh pr merge 3", true))).toContain("run is active");
    expect(decide(...marker("gh pr merge 3 --squash", true))).toContain("run is active");
    expect(decide(...marker("gh pr merge 3", false))).toBeNull();
    expect(decide(...marker("gh pr create --fill --base main", true))).toBeNull();
    expect(decide(...marker("gh pr view 3", true))).toBeNull();
  });

  it("reads the commands inside $(…), backticks and sh -c, because they run", () => {
    expect(decide(...bash("echo $(pnpm db:push)"))).toContain("refused");
    expect(decide(...bash('echo "`pnpm db:push`"'))).toContain("refused");
    expect(decide(...bash('sh -c "pnpm db:push"'))).toContain("refused");
    expect(decide(...bash("bash -c 'git push --force'"))).toContain("Force-pushing");
  });

  it("still finds a write target beside a heredoc", () => {
    expect(writeTargets("cat <<EOF > out.txt\nhello\nEOF")).toEqual(["out.txt"]);
    expect(decide(...bash("cat <<EOF > .env.local\nKEY=1\nEOF"))).toContain("refused");
  });
});

// The cold review of T0.9 probed the parser and found three holes of one shape: a flag that
// takes a value, sitting between the runner and its script, between `gh pr` and `merge`, or
// between `drizzle-kit` and its verb, read as the operand the rule looked for. Each was
// refused by the v1.3 text rule; item 1 says the rules carry over in effect.
describe("the review's bypasses — a value-taking flag before the operand", () => {
  const marker = (command, active) => [
    { tool_name: "Bash", tool_input: { command }, cwd: "/repo" },
    { currentBranch: () => "t0-9", runActive: () => active },
  ];

  it("refuses db:push behind a runner flag that takes a value", () => {
    for (const command of [
      "pnpm -C . db:push",
      "pnpm --dir . db:push",
      "pnpm --filter aenima db:push",
      "pnpm --filter aenima exec drizzle-kit push",
    ]) {
      expect(decide(...bash(command)), command).toContain("drizzle-kit push is refused");
    }
    expect(decide(...bash("pnpm --filter aenima db:migrate"))).toContain("T0.10");
  });

  it("refuses drizzle-kit push behind --config, and allows a generate whose name says push", () => {
    expect(decide(...bash("drizzle-kit --config drizzle.config.ts push"))).toContain("refused");
    expect(decide(...bash("pnpm exec drizzle-kit --config x migrate"))).toContain("T0.10");
    expect(decide(...bash("drizzle-kit generate --name push"))).toBeNull();
  });

  it("refuses a production deploy that goes through a runner", () => {
    for (const command of [
      "npx vercel --prod",
      "pnpm exec vercel deploy --prod",
      "pnpm dlx vercel --prod",
      "vercel --prod",
    ]) {
      expect(decide(...bash(command)), command).toContain("human step");
    }
    expect(decide(...bash("npx vercel env ls"))).toBeNull();
  });

  it("refuses gh pr merge with a repo flag between pr and merge", () => {
    expect(decide(...marker("gh pr -R alkininan/aenima merge 3", true))).toContain("run is active");
    expect(decide(...marker("gh pr --repo alkininan/aenima merge 3 --squash", true))).toContain(
      "run is active",
    );
    expect(decide(...marker("gh pr --repo=alkininan/aenima merge 3", true))).toContain(
      "run is active",
    );
    expect(decide(...marker("gh pr -R alkininan/aenima merge 3", false))).toBeNull();
  });
});

describe("parse", () => {
  it("splits on every separator and keeps quoted runs whole", () => {
    expect(parse("a 'b c' && d | e; f || g & h\ni\n(j)").map((c) => c.argv)).toEqual([
      ["a", "b c"],
      ["d"],
      ["e"],
      ["f"],
      ["g"],
      ["h"],
      ["i"],
      ["j"],
    ]);
  });

  it("attaches a heredoc body to the command that reads it, unparsed", () => {
    const [cmd] = parse("cat <<EOF\npnpm db:push && rm -rf /\nEOF\n");
    expect(cmd.argv).toEqual(["cat"]);
    expect(cmd.heredocs).toEqual(["pnpm db:push && rm -rf /"]);
    expect(parse("cat <<EOF\npnpm db:push\nEOF")).toHaveLength(1);
  });

  it("reads the executable's basename past assignments and wrappers", () => {
    expect(program(["GIT_TRACE=1", "env", "X=1", "/usr/bin/git", "push"])).toEqual({
      exe: "git",
      args: ["push"],
    });
    expect(target(["pnpm", "exec", "drizzle-kit", "push"])).toEqual({
      name: "drizzle-kit",
      rest: ["push"],
    });
    expect(target(["npm", "run", "db:generate"])).toEqual({ name: "db:generate", rest: [] });
  });
});
