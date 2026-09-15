import { describe, expect, it } from "vitest";

import { compose } from "./comments.mjs";
import { pickNext, readPick, unposted } from "./pick-next.mjs";

const P = "⟡ ";

/** A Tasks row as `notion.mjs` reads it: relations are page ids. */
const row = (Name, fields = {}) => ({
  id: fields.id ?? Name,
  url: `https://www.notion.so/${fields.id ?? Name}`,
  Name,
  Status: "Ready",
  Priority: "Medium",
  Epic: ["e0"],
  Blockers: [],
  created: "2026-09-01T00:00:00.000Z",
  ...fields,
});

const EPICS = [
  { id: "e0", Name: "E0.2 Pipeline" },
  { id: "e3", Name: "E3.1 Authoring loop" },
  { id: "e10", Name: "E10.1 Edges" },
];

const names = (result) => result.queue.map((task) => task.Name);

describe("pickNext — the order", () => {
  it("orders by Priority, Urgent first and None last, an empty priority read as Medium", () => {
    const rows = [
      row("T0.1 none", { Priority: "None" }),
      row("T0.2 low", { Priority: "Low" }),
      row("T0.3 empty", { Priority: null }),
      row("T0.4 high", { Priority: "High" }),
      row("T0.5 urgent", { Priority: "Urgent" }),
      row("T0.6 medium", { Priority: "Medium" }),
    ];
    expect(names(pickNext(rows, { epics: EPICS }))).toEqual([
      "T0.5 urgent",
      "T0.4 high",
      "T0.3 empty",
      "T0.6 medium",
      "T0.2 low",
      "T0.1 none",
    ]);
  });

  // TC4 → AC4, the order half: among equal priorities the roadmap breaks the tie.
  it("breaks a priority tie by Epic name, then ID numeric and phase-major, then oldest created", () => {
    const rows = [
      row("T10.1 later phase", { Epic: ["e10"] }),
      row("T3.2 authoring", { Epic: ["e3"] }),
      row("T0.17 pipeline", { Epic: ["e0"] }),
      row("T1.3 pipeline, next phase", { Epic: ["e0"] }),
      row("T0.9 pipeline", { Epic: ["e0"], created: "2026-09-14T00:00:00.000Z" }),
      row("T3.10 authoring", { Epic: ["e3"] }),
      row("Unnumbered newer", { Epic: ["e0"], created: "2026-09-10T00:00:00.000Z" }),
      row("Unnumbered older", { Epic: ["e0"], created: "2026-09-02T00:00:00.000Z" }),
    ];
    expect(names(pickNext(rows, { epics: EPICS }))).toEqual([
      "T0.9 pipeline",
      "T0.17 pipeline",
      "T1.3 pipeline, next phase",
      "Unnumbered older",
      "Unnumbered newer",
      "T3.2 authoring",
      "T3.10 authoring",
      "T10.1 later phase",
    ]);
  });

  // TC6 → AC6.
  it("sorts a task with no Epic after those with one at equal priority, never above a higher one", () => {
    const rows = [
      row("T0.1 no epic, high", { Epic: [], Priority: "High" }),
      row("T0.2 no epic, medium", { Epic: [] }),
      row("T9.9 epic, medium", { Epic: ["e10"] }),
      row("T0.3 unknown epic, medium", { Epic: ["gone"] }),
    ];
    expect(names(pickNext(rows, { epics: EPICS }))).toEqual([
      "T0.1 no epic, high",
      "T9.9 epic, medium",
      "T0.2 no epic, medium",
      "T0.3 unknown epic, medium",
    ]);
  });

  it("claims nothing that is not Ready, and picks null on an empty queue", () => {
    const rows = [
      row("T0.1 backlog", { Status: "Backlog", Priority: "Urgent" }),
      row("T0.2 done", { Status: "Done", Priority: "Urgent" }),
      row("T0.3 ready", { Priority: "Low" }),
    ];
    expect(pickNext(rows, { epics: EPICS }).pick.Name).toBe("T0.3 ready");
    expect(pickNext([], { epics: EPICS }).pick).toBeNull();
    expect(pickNext([row("T0.4 review", { Status: "Review" })], { epics: EPICS }).pick).toBeNull();
  });

  it("leaves the caller's rows alone", () => {
    const rows = [row("T0.2 b"), row("T0.1 a")];
    pickNext(rows, { epics: EPICS });
    expect(rows.map((r) => r.Name)).toEqual(["T0.2 b", "T0.1 a"]);
  });
});

describe("pickNext — Blockers", () => {
  // TC1 → AC1.
  it("picks a Ready blocker first, at the priority of the task it blocks", () => {
    const rows = [
      row("T0.1 A", { Priority: "High", Blockers: ["T0.2 B"] }),
      row("T0.2 B", { Priority: "Low" }),
      row("T0.3 C", { Priority: "Medium" }),
    ];
    const result = pickNext(rows, { epics: EPICS });
    expect(result.pick.Name).toBe("T0.2 B");
    expect(result.pick.as).toBe("High");
    expect(names(result)).toEqual(["T0.2 B", "T0.3 C"]);
    expect(result.blocked).toEqual([{ Name: "T0.1 A", by: ["T0.2"] }]);
  });

  it("carries the priority through a chain, and matches relation ids with or without dashes", () => {
    const rows = [
      row("T0.1 A", { id: "aaaa-0001", Priority: "Urgent", Blockers: ["aaaa0002"] }),
      row("T0.2 B", {
        id: "aaaa-0002",
        Status: "Backlog",
        Priority: "Low",
        Blockers: ["AAAA-0003"],
      }),
      row("T0.3 C", { id: "aaaa-0003", Priority: "None" }),
      row("T0.4 D", { id: "aaaa-0004", Priority: "High" }),
    ];
    const result = pickNext(rows, { epics: EPICS });
    expect(result.pick.Name).toBe("T0.3 C");
    expect(result.pick.as).toBe("Urgent");
  });

  it("lifts a blocker only for a task that is not Done", () => {
    const rows = [
      row("T0.1 done", { Status: "Done", Priority: "Urgent", Blockers: ["T0.2 B"] }),
      row("T0.2 B", { Priority: "Low" }),
      row("T0.3 C", { Priority: "Medium" }),
    ];
    const result = pickNext(rows, { epics: EPICS });
    expect(result.pick.Name).toBe("T0.3 C");
    expect(result.queue.find((task) => task.Name === "T0.2 B").as).toBe("Low");
  });

  it("is blocked while any blocker is not Done; a Done blocker, or one the board no longer lists, does not block", () => {
    const rows = [
      row("T0.1 two blockers", { Priority: "Urgent", Blockers: ["T0.2 done", "T0.3 review"] }),
      row("T0.2 done", { Status: "Done" }),
      row("T0.3 review", { Status: "Review" }),
      row("T0.4 done blocker", { Priority: "High", Blockers: ["T0.2 done"] }),
      row("T0.5 missing blocker", { Priority: "High", Blockers: ["trashed-page"] }),
    ];
    const result = pickNext(rows, { epics: EPICS });
    expect(names(result)).toEqual(["T0.4 done blocker", "T0.5 missing blocker"]);
    expect(result.blocked).toEqual([{ Name: "T0.1 two blockers", by: ["T0.3"] }]);
  });

  // TC2 → AC2, the pure half.
  it("posts one waiting notice on a Ready task whose blocker is at Backlog, naming the blocker", () => {
    const rows = [
      row("T3.4 A", { id: "a", Blockers: ["b", "c"] }),
      row("T3.1 Slice PRD into items", { id: "b", Status: "Backlog" }),
      row("T3.2 In flight", { id: "c", Status: "In progress" }),
    ];
    const result = pickNext(rows, { epics: EPICS, prefix: P });
    expect(result.pick).toBeNull();
    expect(result.notices).toEqual([
      {
        id: "a",
        url: "https://www.notion.so/a",
        Name: "T3.4 A",
        kind: "waiting",
        text: compose("waiting", { blockers: ["T3.1"] }, P),
      },
    ]);
    expect(result.notices[0].text).toContain("T3.1, which isn't Ready");
  });

  it("posts no waiting notice when the blocker is Ready, In progress, or the blocked task is not Ready", () => {
    const rows = [
      row("T0.1 A", { Blockers: ["T0.2 B"] }),
      row("T0.2 B", { Status: "In progress" }),
      row("T0.3 C", { Status: "Backlog", Blockers: ["T0.4 D"] }),
      row("T0.4 D", { Status: "Backlog" }),
      row("T0.5 E", { Blockers: ["T0.6 F"] }),
      row("T0.6 F"),
    ];
    expect(pickNext(rows, { epics: EPICS, prefix: P }).notices).toEqual([]);
  });

  // TC5 → AC5.
  it("skips a two-task cycle and names it once, on one member", () => {
    const rows = [
      row("T0.2 B", { Priority: "High", Blockers: ["T0.1 A"] }),
      row("T0.1 A", { Priority: "High", Blockers: ["T0.2 B"] }),
      row("T0.3 C", { Priority: "Low" }),
    ];
    const result = pickNext(rows, { epics: EPICS, prefix: P });
    expect(result.pick.Name).toBe("T0.3 C");
    expect(result.cycles).toEqual([["T0.1", "T0.2"]]);
    expect(result.notices).toEqual([
      {
        id: "T0.1 A",
        url: "https://www.notion.so/T0.1 A",
        Name: "T0.1 A",
        kind: "cycle",
        text: compose("cycle", { members: ["T0.1", "T0.2"] }, P),
      },
    ]);
  });

  it("names a cycle through a Backlog member once, with no waiting notice besides, and a task that lists itself", () => {
    const rows = [
      row("T0.1 A", { Blockers: ["T0.2 B"] }),
      row("T0.2 B", { Status: "Backlog", Blockers: ["T0.1 A"] }),
      row("T0.3 self", { Blockers: ["T0.3 self"] }),
      row("T0.4 backlog loop", { Status: "Backlog", Blockers: ["T0.5 backlog loop"] }),
      row("T0.5 backlog loop", { Status: "Backlog", Blockers: ["T0.4 backlog loop"] }),
    ];
    const result = pickNext(rows, { epics: EPICS, prefix: P });
    expect(result.pick).toBeNull();
    expect(result.notices.map((n) => [n.Name, n.kind])).toEqual([
      ["T0.1 A", "cycle"],
      ["T0.3 self", "cycle"],
    ]);
    expect(result.notices[1].text).toBe(compose("cycle", { members: ["T0.3"] }, P));
  });
});

// TC4 → AC4, the notice half.
describe("pickNext — the Urgent notice", () => {
  const urgent = (Name, created, fields = {}) =>
    row(Name, { Priority: "Urgent", created, ...fields });

  it("posts one notice on the newest when three or more Ready tasks are Urgent, and runs them Epic → ID", () => {
    const rows = [
      urgent("T3.1 authoring", "2026-09-01T00:00:00.000Z", { Epic: ["e3"] }),
      urgent("T0.9 pipeline", "2026-09-03T00:00:00.000Z"),
      urgent("T0.5 pipeline", "2026-09-02T00:00:00.000Z"),
      urgent("T0.1 backlog", "2026-09-09T00:00:00.000Z", { Status: "Backlog" }),
    ];
    const result = pickNext(rows, { epics: EPICS, prefix: P });
    expect(names(result)).toEqual(["T0.5 pipeline", "T0.9 pipeline", "T3.1 authoring"]);
    expect(result.notices).toEqual([
      {
        id: "T0.9 pipeline",
        url: "https://www.notion.so/T0.9 pipeline",
        Name: "T0.9 pipeline",
        kind: "urgent",
        text: `${P}3 tasks are Urgent; running them in roadmap order.`,
      },
    ]);
  });

  it("posts nothing at two Urgent tasks, and counts a task lifted to Urgent as not the human's Urgent", () => {
    const rows = [
      urgent("T0.1 a", "2026-09-01T00:00:00.000Z", { Blockers: ["T0.3 c"] }),
      urgent("T0.2 b", "2026-09-02T00:00:00.000Z"),
      row("T0.3 c", { Priority: "Low" }),
    ];
    expect(pickNext(rows, { epics: EPICS, prefix: P }).notices).toEqual([]);
  });
});

// TC2 → AC2, the "once" half: the thread is the record of what was already said.
describe("unposted", () => {
  const notice = {
    id: "a",
    url: "u",
    Name: "T3.4 A",
    kind: "waiting",
    text: compose("waiting", { blockers: ["T3.1"] }, P),
  };
  const at = (text, created_time) => ({ text, created_time });

  it("keeps a notice the thread has not seen, and drops one the pipeline already posted there", async () => {
    expect(await unposted([notice], async () => [], P)).toEqual([notice]);
    const said = async () => [
      at("sure", "2026-09-01T00:00:00Z"),
      at(notice.text, "2026-09-02T00:00:00Z"),
    ];
    expect(await unposted([notice], said, P)).toEqual([]);
  });

  it("posts again when the words changed, and never over a human reply still waiting for an answer", async () => {
    const other = async () => [
      at(compose("waiting", { blockers: ["T3.2"] }, P), "2026-09-01T00:00:00Z"),
    ];
    expect(await unposted([notice], other, P)).toEqual([notice]);
    const waiting = async () => [
      at(`${P}earlier`, "2026-09-01T00:00:00Z"),
      at("hold on", "2026-09-02T00:00:00Z"),
    ];
    expect(await unposted([notice], waiting, P)).toEqual([]);
  });
});

describe("readPick", () => {
  const board = () => ({ prefix: P, tasks_ds: "tasks", epics_ds: "epics" });

  it("reads the tasks, the epic names, and only the threads a notice would land on", async () => {
    const read = [];
    const api = {
      tasks: async (ds) => {
        read.push(ds);
        return ds === "epics"
          ? EPICS
          : [
              row("T3.4 A", { id: "a", Blockers: ["b"] }),
              row("T3.1 B", { id: "b", Status: "Backlog" }),
              row("T0.2 C", { id: "c", Priority: "Low" }),
            ];
      },
      comments: async (id) => {
        read.push(`comments:${id}`);
        return [];
      },
    };
    const result = await readPick({ deps: { token: () => "t", board, client: api } });
    expect(read).toEqual(["tasks", "epics", "comments:a"]);
    expect(result.token).toBe(true);
    expect(result.pick.Name).toBe("T0.2 C");
    expect(result.notices.map((n) => n.Name)).toEqual(["T3.4 A"]);
  });

  it("says so, and picks nothing, when the token is not in .env.local", async () => {
    const result = await readPick({ deps: { token: () => null, board } });
    expect(result).toMatchObject({ token: false, pick: null, notices: [] });
    expect(result.why).toContain("NOTION_TOKEN");
  });
});
