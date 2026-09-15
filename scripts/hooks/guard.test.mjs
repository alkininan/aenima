import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { claim } from "../run/claim.mjs";
import { release } from "../run/release.mjs";
import {
  decide,
  judge,
  parse,
  program,
  revertOfTipAt,
  target,
  wanted,
  wantedBy,
  writeTargets,
} from "./guard.mjs";

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
  it("refuses it without the human's word, and says which word and where", () => {
    expect(decide(...bash("pnpm db:migrate"))).toContain('reply beginning with "apply"');
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

// T0.16 TC2 → AC2, the verdict's half: the file the second door reads is the reviewer's to
// write, through its own Bash, and the run's Edit and Write are refused under docs/reviews/.
describe("rule (g) — Edit and Write under docs/reviews/", () => {
  it("refuses a Write and an Edit of a verdict file, relative or absolute", () => {
    expect(decide(...file("Write", "docs/reviews/T0.16.md"))).toContain("docs/reviews/");
    expect(decide(...file("Edit", "/repo/docs/reviews/T0.16.md"))).toContain("reviewer's to write");
  });

  it("allows the report and the log beside it", () => {
    expect(decide(...file("Write", "docs/reports/T0.16.md"))).toBeNull();
    expect(decide(...file("Write", "docs/log/T0.16.md"))).toBeNull();
    expect(decide(...file("Write", "docs/reviews-notes.md"))).toBeNull();
  });
});

// T0.17 TC3 → AC3. Backlog → Ready is the human's word, and the guard reads it from the board
// at the connector the run writes the board through: a status write on a Backlog page, a task
// created at Ready, and a comment the run would post in the human's own voice.
describe("T0.17 — rule (h) the board's connector", () => {
  const SERVER = "mcp__a6bc5cd2-b1e4-484a-b22d-e3708b2a94f4__";
  const call = (tool, tool_input) => ({ tool_name: `${SERVER}${tool}`, tool_input, cwd: "/repo" });
  const toReady = (page_id = "p1", Status = "Ready") =>
    call("notion-update-page", { page_id, command: "update_properties", properties: { Status } });
  const read =
    (status, ok = false) =>
    () => ({
      ok,
      why: ok
        ? null
        : `the guard read the thread of T3.1 Slice at ${status} and did not find "ready" as your newest reply since the run's last comment`,
      task: { name: "T3.1 Slice", status, branch: "t3-1" },
    });

  it("refuses Backlog → Ready without the word, and says what it read", () => {
    const reason = decide(toReady(), { permission: read("Backlog") });
    expect(reason).toContain("Setting T3.1 Slice Ready is refused");
    expect(reason).toContain('did not find "ready"');
  });

  it("allows Backlog → Ready on the word", () => {
    expect(decide(toReady(), { permission: read("Backlog", true) })).toBeNull();
  });

  it("leaves Ready from Decision, Review or In progress to the run's reading, as §3 does", () => {
    for (const status of ["Decision", "Review", "In progress", "Ready"]) {
      expect(decide(toReady(), { permission: read(status) }), status).toBeNull();
    }
  });

  it("refuses when nothing read the board — a word nobody read grants nothing", () => {
    expect(decide(toReady())).toContain("the board was not read");
    const unread = () => ({
      ok: false,
      why: "NOTION_TOKEN is not in .env.local, so the board cannot be read",
    });
    expect(decide(toReady(), { permission: unread })).toContain("NOTION_TOKEN");
  });

  // Review pass 1, Must 1: Backlog → Decision, then Decision → Ready, reached Ready with no
  // word. The one move out of Backlog is to Ready, so every other status write on a Backlog
  // task is refused, and a write the guard could not read the task for is refused too.
  it("refuses any move out of Backlog but Ready, so a task cannot reach Ready in two steps", () => {
    for (const target of ["Decision", "In progress", "Review", "Done", null]) {
      expect(
        decide(toReady("p1", target), { permission: read("Backlog") }),
        String(target),
      ).toContain("the one move out of Backlog is to Ready");
    }
    for (const status of ["Ready", "In progress", "Decision", "Review", "Done"]) {
      expect(decide(toReady("p1", "Done"), { permission: read(status) }), status).toBeNull();
    }
    expect(decide(toReady("p1", "Decision"))).toContain("the board was not read");
  });

  it("asks the board nothing for a write that sets Backlog or no Status at all", () => {
    const permission = () => {
      throw new Error("read the board for a write that needed nothing");
    };
    expect(decide(toReady("p1", "Backlog"), { permission })).toBeNull();
    const name = call("notion-update-page", {
      page_id: "p1",
      command: "update_properties",
      properties: { Commit: "abc1234" },
    });
    expect(decide(name, { permission })).toBeNull();
    const content = call("notion-update-page", {
      page_id: "p1",
      command: "update_content",
      content_updates: [],
    });
    expect(decide(content, { permission })).toBeNull();
  });

  it("refuses a task created at any Status but Backlog, and allows one at Backlog or with none", () => {
    const create = (Status) =>
      call("notion-create-pages", {
        parent: { type: "data_source_id", data_source_id: "ds" },
        pages: [
          { properties: { Name: "Fix the gate", Status: "Backlog" } },
          { properties: { Name: "Draft", Status } },
        ],
      });
    expect(decide(create("Ready"))).toContain("Creating a task at Ready is refused");
    expect(decide(create("Decision"))).toContain("Creating a task at Decision is refused");
    expect(decide(create("Backlog"))).toBeNull();
    const release = call("notion-create-pages", {
      parent: { type: "data_source_id", data_source_id: "releases" },
      pages: [{ properties: { Name: "2026-09-15 ec531f3", Commit: "ec531f3" } }],
    });
    expect(decide(release)).toBeNull();
  });

  it("refuses a comment without the prefix, in markdown or rich text, and allows the run's own", () => {
    const prefix = () => "⟡ ";
    const comment = (fields) => call("notion-create-comment", { page_id: "p1", ...fields });
    expect(decide(comment({ markdown: "ready" }), { prefix })).toContain("begins with ⟡");
    expect(
      decide(comment({ discussion_id: "discussion://p1/d1", markdown: "merge" }), { prefix }),
    ).toContain("your voice");
    expect(
      decide(comment({ rich_text: [{ type: "text", text: { content: "apply" } }] }), { prefix }),
    ).toContain("begins with ⟡");
    expect(decide(comment({ markdown: "⟡ Read that as your go." }), { prefix })).toBeNull();
    expect(
      decide(
        comment({ rich_text: [{ text: { content: "⟡ " } }, { text: { content: "Merged." } }] }),
        {
          prefix,
        },
      ),
    ).toBeNull();
  });

  it("has no opinion about the connector's reads, or a tool that only shares a word of the name", () => {
    expect(decide(call("notion-fetch", { id: "p1" }))).toBeNull();
    expect(decide(call("notion-get-comments", { page_id: "p1" }))).toBeNull();
    expect(
      decide({ tool_name: "notion-create-comment", tool_input: { markdown: "ready" } }),
    ).toBeNull();
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
  const pr = (command) => [
    { tool_name: "Bash", tool_input: { command }, cwd: "/repo" },
    { currentBranch: () => "t0-9" },
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

  it("refuses gh pr merge on the model's word alone, and lets create and view through", () => {
    expect(decide(...pr("gh pr merge 3 --merge"))).toContain('reply beginning with "merge"');
    expect(decide(...pr("gh pr merge 3 --squash"))).toContain('reply beginning with "merge"');
    expect(decide(...pr("gh pr create --fill --base main"))).toBeNull();
    expect(decide(...pr("gh pr view 3"))).toBeNull();
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
  const pr = (command) => [
    { tool_name: "Bash", tool_input: { command }, cwd: "/repo" },
    { currentBranch: () => "t0-9" },
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
    expect(decide(...bash("pnpm --filter aenima db:migrate"))).toContain(
      'reply beginning with "apply"',
    );
  });

  it("refuses drizzle-kit push behind --config, and allows a generate whose name says push", () => {
    expect(decide(...bash("drizzle-kit --config drizzle.config.ts push"))).toContain("refused");
    expect(decide(...bash("pnpm exec drizzle-kit --config x migrate"))).toContain(
      'reply beginning with "apply"',
    );
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
    const word = 'reply beginning with "merge"';
    expect(decide(...pr("gh pr -R alkininan/aenima merge 3 --merge"))).toContain(word);
    expect(decide(...pr("gh pr --repo alkininan/aenima merge 3 --squash"))).toContain(word);
    expect(decide(...pr("gh pr --repo=alkininan/aenima merge 3"))).toContain(word);
  });
});

// Pass 2 of the same review: three more places where a word sat where the rule expected its
// operand — a shell reserved word, an unquoted heredoc body the shell expands, and a quoted
// argument to a runner's script.
describe("the review's bypasses, pass 2", () => {
  it("steps over a shell reserved word to the command it introduces", () => {
    expect(decide(...bash("if true; then pnpm db:push; fi"))).toContain(
      "drizzle-kit push is refused",
    );
    expect(decide(...bash("for x in a; do pnpm db:migrate; done"))).toContain(
      'reply beginning with "apply"',
    );
    expect(decide(...bash("while true; do git push --force; done"))).toContain("Force-pushing");
    expect(decide(...bash("if true; then git push origin t0-9; fi"))).toBeNull();
  });

  it("reads $(…) and backticks inside an unquoted heredoc body, which the shell expands", () => {
    expect(decide(...bash("cat <<EOF > x.md\n$(pnpm db:push)\nEOF"))).toContain("refused");
    expect(decide(...bash("cat <<EOF > x.md\n`pnpm db:push`\nEOF"))).toContain("refused");
    expect(decide(...bash("cat <<EOF > x.md\n$(git push --force)\nEOF"))).toContain(
      "Force-pushing",
    );
    // A quoted delimiter makes the body literal: still data, still not a command.
    expect(decide(...bash("cat <<'EOF' > x.md\n$(pnpm db:push)\nEOF"))).toBeNull();
    expect(decide(...bash('cat <<"EOF" > x.md\n$(pnpm db:push)\nEOF'))).toBeNull();
  });

  it("does not read a quoted argument to a runner's script as the script", () => {
    expect(decide(...bash('pnpm vitest run -t "db:push"'))).toBeNull();
    expect(decide(...bash("pnpm vitest run scripts/hooks/guard.test.mjs -t 'db:push'"))).toBeNull();
    expect(decide(...bash('pnpm exec grep -n "db:push" scripts/hooks/guard.mjs'))).toBeNull();
    expect(decide(...bash("pnpm --filter aenima db:push"))).toContain(
      "drizzle-kit push is refused",
    );
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

// TC3 → AC3. Since T0.11 a merge is the human's word on the board, verified by the guard in
// code: `deps.permission` is what `permission.mjs` answers, and the pull request must be the
// claimed task's branch, merged with a merge commit. Without a grant nothing merges — the
// model's own word, with a marker or without one, is refused the same way.
describe("TC3 — rule (f) merges only on the human's word", () => {
  const granted = {
    ok: true,
    why: null,
    marker: { task: "T0.11", branch: "t0-11" },
    task: { name: "T0.11 Comments", branch: "t0-11" },
  };
  const missing = {
    ok: false,
    why: 'the guard read the thread of T0.11 Comments at Review and did not find "merge" as your newest reply since the run\'s last comment',
  };
  const merge = (command, permission, prBranch = () => "t0-11") => [
    { tool_name: "Bash", tool_input: { command }, cwd: "/repo" },
    { currentBranch: () => "t0-11", permission: () => permission, prBranch },
  ];

  it("refuses a merge the board did not grant, and repeats what was missing", () => {
    const reason = decide(...merge("gh pr merge t0-11 --merge --delete-branch", missing));
    expect(reason).toContain('reply beginning with "merge"');
    expect(reason).toContain(missing.why);
  });

  it("refuses the model's word alone — a decide with nothing having read the board", () => {
    expect(decide(...bash("gh pr merge 3 --merge"))).toContain("the board was not read");
  });

  it("allows a merge commit on the claimed task's branch once the word is on the thread", () => {
    expect(decide(...merge("gh pr merge t0-11 --merge --delete-branch", granted))).toBeNull();
    expect(decide(...merge("gh pr merge --merge", granted))).toBeNull();
    expect(decide(...merge("gh pr merge 7 -m", granted))).toBeNull();
  });

  // A flagless merge takes the repository's setting, which the guard cannot see (review pass
  // 1, Should 5); a squash or a rebase rewrites the hash the board carries.
  it("refuses a merge that does not say --merge, even with the word", () => {
    expect(decide(...merge("gh pr merge 7", granted))).toContain("unless it says --merge");
    expect(decide(...merge("gh pr merge t0-11 --squash", granted))).toContain("squash");
    expect(decide(...merge("gh pr merge t0-11 -r", granted))).toContain("rebase");
    expect(decide(...merge("gh pr merge t0-11 --merge --squash", granted))).toContain("squash");
  });

  it("refuses a pull request that is not the claimed task's branch", () => {
    const reason = decide(...merge("gh pr merge 9 --merge", granted, () => "t0-12"));
    expect(reason).toContain("the pull request is for t0-12");
    expect(reason).toContain("t0-11");
  });

  // The branch to match is the board's, from the task's name; a marker that names another
  // branch changes nothing (review pass 2, Should 5).
  it("matches the pull request to the branch the board's name gives, not the marker's", () => {
    const lying = { ...granted, marker: { task: "T0.11", branch: "t0-12" } };
    expect(decide(...merge("gh pr merge 9 --merge", lying, () => "t0-12"))).toContain(
      "the pull request is for t0-12",
    );
    expect(decide(...merge("gh pr merge 9 --merge", lying, () => "t0-11"))).toBeNull();
  });

  it("refuses when the task's name on the board carries no ID to derive a branch from", () => {
    const nameless = { ...granted, task: { name: "Restrict Vercel's role", branch: null } };
    expect(decide(...merge("gh pr merge 9 --merge", nameless))).toContain("carries no T<n>.<n> ID");
  });

  it("refuses when gh cannot say which branch the pull request carries", () => {
    expect(decide(...merge("gh pr merge 9 --merge", granted, () => null))).toContain(
      "could not say which branch",
    );
  });

  it("asks gh about the selector it was given, or about the checked-out branch with none", () => {
    const asked = [];
    const prBranch = (selector) => {
      asked.push(selector);
      return "t0-11";
    };
    decide(...merge("gh pr merge 42 --merge", granted, prBranch));
    decide(...merge("gh pr merge --merge", granted, prBranch));
    decide(...merge("gh pr -R alkininan/aenima merge t0-11 --merge", granted, prBranch));
    expect(asked).toEqual(["42", null, "t0-11"]);
  });
});

// T0.16 TC2 → AC2 and TC3 → AC3. The second door: the reviewer's PASS on file over a diff
// with nothing gated merges without the word — and only from the commit the guard can see.
describe("T0.16 — rule (f)'s second door, the reviewer's PASS", () => {
  const unread = { ok: false, why: "the board was not read" };
  const passed = {
    ok: true,
    why: null,
    marker: { task: "T0.16", branch: "t0-16" },
    task: { name: "T0.16", branch: "t0-16" },
    gated: [],
  };
  const shut = (why) => ({ ok: false, why });
  const merge = (command, verdict, extra = {}) => [
    { tool_name: "Bash", tool_input: { command }, cwd: "/repo" },
    {
      currentBranch: () => "t0-16",
      permission: () => unread,
      verdict: () => verdict,
      prBranch: () => "t0-16",
      prHead: () => "abc123def",
      localHead: () => "abc123def",
      ...extra,
    },
  ];

  it("allows a merge commit on the PASS when the word is not there", () => {
    expect(decide(...merge("gh pr merge t0-16 --merge --delete-branch", passed))).toBeNull();
  });

  it("refuses when both doors are shut, and says why each is", () => {
    const reason = decide(
      ...merge("gh pr merge t0-16 --merge", shut("no reviewer verdict at docs/reviews/T0.16.md")),
    );
    expect(reason).toContain("the board was not read");
    expect(reason).toContain("no reviewer verdict at docs/reviews/T0.16.md");
  });

  it("refuses on the PASS when the diff touches a gated path — the verdict says so", () => {
    const why = "the diff touches scripts/hooks/guard.mjs, which only your word merges";
    expect(decide(...merge("gh pr merge t0-16 --merge", shut(why)))).toContain(why);
  });

  it("still wants a merge commit and the task's own branch on the second door", () => {
    expect(decide(...merge("gh pr merge t0-16 --squash", passed))).toContain("squash");
    expect(
      decide(...merge("gh pr merge 9 --merge", passed, { prBranch: () => "t0-12" })),
    ).toContain("the pull request is for t0-12");
  });

  it("refuses on the PASS when the pull request's head is not this checkout's HEAD", () => {
    const stale = decide(
      ...merge("gh pr merge t0-16 --merge", passed, { localHead: () => "fff000abc" }),
    );
    expect(stale).toContain("not the diff that would merge");
    expect(stale).toContain("abc123d");
    expect(stale).toContain("fff000a");
    expect(decide(...merge("gh pr merge t0-16 --merge", passed, { prHead: () => null }))).toContain(
      "unknown",
    );
  });

  it("does not ask for the head binding when the human's word granted the merge", () => {
    const granted = { ...passed, task: { name: "T0.16 Self-merge", branch: "t0-16" } };
    const reason = decide(
      ...merge("gh pr merge t0-16 --merge", shut("x"), {
        permission: () => granted,
        localHead: () => "different",
      }),
    );
    expect(reason).toBeNull();
  });
});

// T0.16 TC5 → AC5, the push half. A revert of the merge at the tip is the one push to main.
describe("T0.16 — rule (d) lets the revert's push through, and nothing else that names main", () => {
  const push = (command, revertOfTip, branch = "HEAD") => [
    { tool_name: "Bash", tool_input: { command }, cwd: "/repo" },
    { currentBranch: () => branch, revertOfTip: () => revertOfTip },
  ];

  it("allows git push origin HEAD:main when HEAD is exactly the revert of the tip", () => {
    expect(decide(...push("git push origin HEAD:main", true))).toBeNull();
    expect(decide(...push("git push origin HEAD:refs/heads/main", true))).toBeNull();
  });

  it("refuses the same push when HEAD is not that revert", () => {
    expect(decide(...push("git push origin HEAD:main", false))).toContain(
      "Pushing main is refused",
    );
  });

  it("refuses every other shape that names main even when HEAD is the revert", () => {
    expect(decide(...push("git push origin main", true, "main"))).toContain(
      "Pushing main is refused",
    );
    expect(decide(...push("git push origin t0-16:main", true))).toContain(
      "Pushing main is refused",
    );
    expect(decide(...push("git push origin HEAD:main t0-16", true))).toContain(
      "Pushing main is refused",
    );
    expect(decide(...push("git push -f origin HEAD:main", true))).toContain("Force-pushing");
  });
});

// T0.16 TC5 → AC5, the guard's own reading of the revert, over a real repository.
describe("revertOfTipAt over a temporary repository", () => {
  let root;
  const sh = (cwd, ...args) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout.trim();
  };
  const commit = (cwd, name, message) => {
    writeFileSync(join(cwd, name), `${message}\n`);
    sh(cwd, "add", name);
    sh(cwd, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", message);
  };

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "aenima-revert-guard-"));
    const src = join(root, "src");
    sh(root, "init", "-q", "-b", "main", src);
    commit(src, "a.txt", "base");
    sh(src, "checkout", "-q", "-b", "t9-1");
    commit(src, "b.txt", "broken");
    sh(src, "checkout", "-q", "main");
    sh(
      src,
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "merge",
      "--no-ff",
      "-q",
      "-m",
      "Merge pull request #1 from x/t9-1",
      "t9-1",
    );
    sh(root, "clone", "-q", "--bare", src, join(root, "origin.git"));
    sh(root, "clone", "-q", join(root, "origin.git"), join(root, "work"));
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("is true for the revert of the merge at the tip, and false for the tip itself, a plain commit on it, or anything past it", () => {
    const work = join(root, "work");
    expect(revertOfTipAt(work)).toBe(false);
    // One commit past the tip that is not the revert: the parent matches, the tree does not.
    sh(work, "checkout", "-q", "--detach", "origin/main");
    commit(work, "c.txt", "not a revert");
    expect(revertOfTipAt(work)).toBe(false);
    sh(work, "checkout", "-q", "--detach", "origin/main");
    sh(work, "-c", "user.name=t", "-c", "user.email=t@t", "revert", "--no-edit", "-m", "1", "HEAD");
    expect(revertOfTipAt(work)).toBe(true);
    commit(work, "d.txt", "one more");
    expect(revertOfTipAt(work)).toBe(false);
  });
});

// TC4 → AC4. A migration applies on the word "apply", read from the board the same way.
describe("TC4 — rule (b) applies only on the human's word", () => {
  const apply = (command, permission) => [
    { tool_name: "Bash", tool_input: { command }, cwd: "/repo" },
    { currentBranch: () => "t0-11", permission: () => permission },
  ];
  const granted = {
    ok: true,
    why: null,
    marker: { task: "T0.11", branch: "t0-11" },
    task: { name: "T0.11 Comments", branch: "t0-11" },
  };

  it("allows pnpm db:migrate once the word is on the thread, in every runner shape", () => {
    for (const command of [
      "pnpm db:migrate",
      "pnpm --filter aenima db:migrate",
      "pnpm exec drizzle-kit --config x migrate",
    ]) {
      expect(decide(...apply(command, granted)), command).toBeNull();
    }
  });

  it("refuses it with the reason the board gave when the word is not there", () => {
    const why = "NOTION_TOKEN is not in .env.local, so the board cannot be read";
    const reason = decide(...apply("pnpm db:migrate", { ok: false, why }));
    expect(reason).toContain('reply beginning with "apply"');
    expect(reason).toContain(why);
  });

  it("grants apply and merge separately — one word does not stand for the other", () => {
    const only = (word) => (asked) => (asked === word ? granted : { ok: false, why: "no" });
    const input = (command) => ({ tool_name: "Bash", tool_input: { command }, cwd: "/repo" });
    const deps = (word) => ({
      currentBranch: () => "t0-11",
      permission: only(word),
      prBranch: () => "t0-11",
    });
    expect(decide(input("pnpm db:migrate"), deps("merge"))).toContain("apply");
    expect(decide(input("gh pr merge --merge"), deps("apply"))).toContain("merge");
    expect(decide(input("pnpm db:migrate"), deps("apply"))).toBeNull();
    expect(decide(input("gh pr merge --merge"), deps("merge"))).toBeNull();
  });
});

// T0.17 TC3 → AC3, the hook's entry: which reads a hook call needs before the rules run.
describe("wantedBy — the words a hook call would need", () => {
  it("is the command's words for Bash, and a read of the task for any status write but Backlog", () => {
    const bashCall = { tool_name: "Bash", tool_input: { command: "gh pr merge t0-1 --merge" } };
    expect(wantedBy(bashCall)).toEqual(["merge"]);
    const write = (Status) => ({
      tool_name: "mcp__notion__notion-update-page",
      tool_input: { page_id: "p", properties: { Status } },
    });
    expect(wantedBy(write("Ready"))).toEqual(["ready"]);
    expect(wantedBy(write("Done"))).toEqual(["ready"]);
    expect(wantedBy(write("Backlog"))).toEqual([]);
    expect(wantedBy({ tool_name: "Write", tool_input: { file_path: "a" } })).toEqual([]);
  });
});

// TC3 → AC3 and TC4 → AC4, the hook's entry: which words a command line needs before the
// board is read.

describe("wanted — the words a command line would need", () => {
  it("lists apply for a migrate, merge for a pr merge, nothing otherwise", () => {
    expect(wanted("pnpm db:migrate")).toEqual(["apply"]);
    expect(wanted("gh pr merge 3 --merge")).toEqual(["merge"]);
    expect(wanted("pnpm db:migrate && gh pr merge 3")).toEqual(["apply", "merge"]);
    expect(wanted("git push origin t0-11")).toEqual([]);
    expect(wanted('echo "pnpm db:migrate"')).toEqual([]);
    expect(wanted("")).toEqual([]);
  });
});

// TC3 → AC3, the whole path from the hook's input to the board: `judge` reads the real marker in the
// repository's shared `.git` directory and the real `.env.local`, and asks the (stubbed) API
// for the claimed page's thread. From a worktree as from the primary.
describe("judge — reads the marker and the token file, then the thread", () => {
  let primary;
  let worktree;
  const git = (cwd, ...args) => spawnSync("git", args, { cwd, encoding: "utf8" });
  const merge = (cwd) => ({
    tool_name: "Bash",
    tool_input: { command: "gh pr merge t0-96 --merge" },
    cwd,
  });

  beforeAll(() => {
    primary = mkdtempSync(join(tmpdir(), "aenima-guard-"));
    git(primary, "init", "-q", "-b", "main");
    // `resolveDir` walks up to the nearest package root, so each checkout needs one.
    writeFileSync(join(primary, "package.json"), "{}\n");
    git(primary, "add", "-A");
    git(primary, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "base");
    worktree = mkdtempSync(join(tmpdir(), "aenima-guard-wt-"));
    rmSync(worktree, { recursive: true });
    git(primary, "worktree", "add", "-q", worktree, "-b", "wt");
    writeFileSync(join(worktree, ".env.local"), "NOTION_TOKEN=ntn_t\n");
  });
  afterAll(() => {
    rmSync(worktree, { recursive: true, force: true });
    rmSync(primary, { recursive: true, force: true });
  });

  it("refuses with no marker, then with no token, then allows from the worktree on the word", async () => {
    const board = () => ({ prefix: "⟡ " });
    const thread = async () => [{ text: "merge", created_time: "2026-09-13T11:00:00Z" }];
    const page = async () => ({ Name: "T0.96 Smoke D", Status: "Review" });
    const deps = { board, comments: thread, page, prBranch: () => "t0-96" };

    expect(await judge(merge(worktree), { deps })).toContain("no run marker");

    claim(
      { task: "T0.96", page: "p", branch: "t0-96" },
      { cwd: primary, env: { CLAUDE_CODE_SESSION_ID: "s" } },
    );
    // The primary has no .env.local in this fixture: the marker is found, the token is not.
    expect(await judge(merge(primary), { deps })).toContain("NOTION_TOKEN is not in .env.local");
    expect(await judge(merge(worktree), { deps })).toBeNull();
  });

  // T0.16 TC2 → AC2: from the hook's entry, the word not there, the reviewer's door read
  // through the same `deps` — the verdict and the diff injected, the pull request's head
  // equal to the checkout's.
  it("opens the reviewer's door from judge when the word is not there", async () => {
    const deps = {
      board: () => ({ prefix: "⟡ " }),
      comments: async () => [],
      page: async () => ({ Name: "T0.96 Smoke D", Status: "Review" }),
      verdict: () => "# T0.96 — review\n\nPASS\n",
      diff: () => ({ files: ["src/a.ts"], gated: [], ok: true }),
      gate: () => ({ green: "h", tree: "h" }),
      prBranch: () => "t0-96",
      prHead: () => "abc",
      localHead: () => "abc",
    };
    expect(await judge(merge(worktree), { deps })).toBeNull();
    const gated = {
      ...deps,
      diff: () => ({ files: ["scripts/run/x.mjs"], gated: ["scripts/run/x.mjs"], ok: false }),
    };
    expect(await judge(merge(worktree), { deps: gated })).toContain("scripts/run/x.mjs");
    const moved = { ...deps, localHead: () => "def" };
    expect(await judge(merge(worktree), { deps: moved })).toContain(
      "not the diff that would merge",
    );
  });

  it("refuses again once the word is consumed by the pipeline's own reply", async () => {
    const thread = async () => [
      { text: "merge", created_time: "2026-09-13T11:00:00Z" },
      { text: "⟡ Merged into main at x.", created_time: "2026-09-13T12:00:00Z" },
    ];
    const deps = {
      board: () => ({ prefix: "⟡ " }),
      comments: thread,
      page: async () => ({ Name: "T0.96 Smoke D", Status: "Review" }),
      prBranch: () => "t0-96",
    };
    expect(await judge(merge(worktree), { deps })).toContain('did not find "merge"');
    expect(release({ session: "s" }, { cwd: worktree }).released).toBe(true);
  });

  // T0.17 TC3 → AC3, from the hook's entry: the page the write names, no marker, the token from
  // the checkout's .env.local, and the thread over the (stubbed) API.
  it("reads the thread of the page a Ready write names, with no marker, and grants only the human's ready", async () => {
    const write = (cwd) => ({
      tool_name: "mcp__notion__notion-update-page",
      tool_input: {
        page_id: "page-7",
        command: "update_properties",
        properties: { Status: "Ready" },
      },
      cwd,
    });
    const pages = [];
    const page = async (id) => {
      pages.push(id);
      return { Name: "T3.1 Slice", Status: "Backlog" };
    };
    const board = () => ({ prefix: "⟡ " });
    const human = {
      board,
      page,
      comments: async () => [{ text: "ready", created_time: "2026-09-15T11:00:00Z" }],
    };
    expect(await judge(write(worktree), { deps: human })).toBeNull();
    expect(pages).toEqual(["page-7"]);
    const own = {
      ...human,
      comments: async () => [{ text: "⟡ ready", created_time: "2026-09-15T11:00:00Z" }],
    };
    expect(await judge(write(worktree), { deps: own })).toContain(
      "Setting T3.1 Slice Ready is refused",
    );
    expect(await judge(write(primary), { deps: human })).toContain(
      "NOTION_TOKEN is not in .env.local",
    );
  });
});
