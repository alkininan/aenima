import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { classify, migrationSafety, safetyOfFiles, statementsOf } from "./migration-safety.mjs";

/**
 * T0.46 Build 3 — additive is decided in code, not by the model. One case per clause of the
 * ticket's list: CREATE, ADD COLUMN nullable or with a default, CREATE INDEX, policies,
 * functions, triggers and grants are additive; DROP, TRUNCATE, DELETE, UPDATE, RENAME, ALTER
 * TYPE, SET NOT NULL without a default, and anything the reader cannot parse are destructive.
 */

const root = join(import.meta.dirname, "..", "..");

describe("statementsOf", () => {
  it("splits on semicolons outside quotes, dollar-quotes and comments", () => {
    const sql = [
      "-- a comment; with a semicolon",
      "create table a (id int); /* block; comment */",
      "insert into a values ('x;y');",
      "create function f() returns void language sql as $$ delete from a; $$;",
      "create function g() returns void language sql as $body$ update a set id = 1; $body$;",
    ].join("\n");
    const found = statementsOf(sql);
    expect(found).toHaveLength(4);
    expect(found[0]).toBe("create table a (id int)");
    expect(found[1]).toBe("insert into a values ('x;y')");
    expect(found[2]).toContain("$$ delete from a; $$");
    expect(found[3]).toContain("$body$ update a set id = 1; $body$");
  });

  it("reads an empty file, or one of comments alone, as no statements", () => {
    expect(statementsOf("")).toEqual([]);
    expect(statementsOf("-- nothing here\n/* or here */\n")).toEqual([]);
    expect(statementsOf(null)).toEqual([]);
  });
});

describe("classify — the additive clauses of step 3", () => {
  const additive = (sql) => expect(classify(sql), sql).toMatchObject({ additive: true });

  it("CREATE — a table, a type, a schema, a sequence, a view", () => {
    additive('create table "workspace" (id uuid primary key)');
    additive("CREATE TABLE IF NOT EXISTS a (id int)");
    additive("create type stage as enum ('a', 'b')");
    additive("create schema app");
    additive("create sequence s");
    additive("create view v as select 1");
  });

  it("ADD COLUMN nullable, or with a default", () => {
    additive('alter table "item" add column "key" text');
    additive('alter table "item" add "key" text');
    additive('alter table "item" add column "n" integer not null default 0');
    additive('alter table "item" add column "n" integer default 0 not null');
  });

  it("CREATE INDEX, unique or concurrent", () => {
    additive('create index "item_key_idx" on "item" ("key")');
    additive('create unique index "item_key_uq" on "item" ("workspace_id", "key")');
    additive('create index concurrently if not exists "i" on "item" ("key")');
  });

  it("policies — created, and row level security enabled or forced", () => {
    additive('create policy "item_isolation" on "item" using (workspace_id = app.workspace())');
    additive('alter table "item" enable row level security');
    additive('alter table "item" force row level security');
  });

  it("functions and triggers, a DELETE inside the body notwithstanding", () => {
    additive(
      "create function app.delete_user(p_id uuid) returns void language sql security definer as $$ delete from auth.users where id = p_id; $$",
    );
    additive(
      "create or replace function f() returns trigger language plpgsql as $$ begin update a set b = 1; return new; end $$",
    );
    additive('create trigger "t" before insert on "item" for each row execute function f()');
  });

  it("grants — and revokes, a grant's other half (a default taken, T0.46)", () => {
    additive("grant usage on schema app to service_role");
    additive("grant execute on function app.seed_user(uuid, text) to service_role");
    additive("revoke update, delete on refinement_round from anon, authenticated");
    additive("revoke all on function app.seed_user(uuid, text) from public");
  });

  // A default taken (T0.46): the ticket's list does not name a constraint, and `db:generate`
  // writes one per foreign key of every table it creates — 0000 would read destructive on
  // those alone. A constraint adds a rule and touches no row, as CREATE UNIQUE INDEX does.
  it("ADD CONSTRAINT — a foreign key, a unique, a check, a primary key", () => {
    additive(
      'alter table "activity" add constraint "activity_workspace_id_fk" foreign key ("workspace_id") references "workspace"("id") on delete cascade',
    );
    additive('alter table "item" add constraint "item_key_uq" unique ("workspace_id", "key")');
    additive('alter table "item" add constraint "c" check (n > 0)');
    additive('alter table "item" add primary key ("id")');
  });
});

describe("classify — the destructive clauses of step 3", () => {
  const destructive = (sql, why) => {
    const read = classify(sql);
    expect(read.additive, sql).toBe(false);
    if (why) expect(read.why, sql).toContain(why);
  };

  it("DROP — a table, a column, a policy, a constraint", () => {
    destructive('drop table "item"', "DROP");
    destructive('alter table "item" drop column "key"', "DROP");
    destructive('drop policy "p" on "item"', "DROP");
    destructive('alter table "item" drop constraint "c"', "DROP");
  });

  it("TRUNCATE, DELETE, UPDATE — a CTE-led UPDATE or DELETE included", () => {
    destructive('truncate "item"', "TRUNCATE");
    destructive('delete from "item" where id = 1', "DELETE");
    destructive('update "item" set key = 1', "UPDATE");
    destructive(
      "with numbered as (select id, row_number() over (order by created_at, id) as n from item) update item set key = numbered.n from numbered where item.id = numbered.id",
      "UPDATE",
    );
    destructive(
      "with old as (select id from item where n < 0) delete from item using old where item.id = old.id",
      "DELETE",
    );
  });

  it("RENAME — a table or a column", () => {
    destructive('alter table "item" rename to "items"', "RENAME");
    destructive('alter table "item" rename column "key" to "slug"', "RENAME");
  });

  it("ALTER TYPE — the enum, and a column's type", () => {
    destructive("alter type stage add value 'c'", "ALTER TYPE");
    destructive('alter table "item" alter column "n" type bigint', "TYPE");
    destructive('alter table "item" alter column "n" set data type bigint', "TYPE");
  });

  it("SET NOT NULL without a default", () => {
    destructive('alter table "item" alter column "key" set not null', "SET NOT NULL");
  });

  it("anything it cannot parse", () => {
    destructive("do $$ begin perform 1; end $$", "cannot parse");
    destructive("frobnicate the table", "cannot parse");
    destructive('insert into "item" values (1)', "cannot parse");
    destructive("comment on table item is 'x'", "cannot parse");
    destructive("with x as (select 1) select * from x", "cannot parse");
    destructive("", "cannot parse");
  });
});

describe("migrationSafety — a whole file", () => {
  it("is additive when every statement is, and says so", () => {
    const read = migrationSafety(
      [
        "-- T9.9 — a column and its index",
        'alter table "item" add column "key" text;',
        'create index "item_key_idx" on "item" ("key");',
      ].join("\n"),
    );
    expect(read.safety).toBe("additive");
    expect(read.why).toBeNull();
    expect(read.statements).toHaveLength(2);
  });

  it("is destructive on one destructive statement among additive ones, naming it", () => {
    const read = migrationSafety(
      [
        'alter table "item" add column "key" text;',
        'update "item" set key = id::text;',
        'create index "item_key_idx" on "item" ("key");',
      ].join("\n"),
    );
    expect(read.safety).toBe("destructive");
    expect(read.why).toContain("UPDATE");
    expect(read.destructive).toHaveLength(1);
  });

  it("reads SET NOT NULL as additive once the same file gave the column a default", () => {
    const withDefault = migrationSafety(
      [
        'alter table "item" add column "n" integer default 0;',
        'alter table "item" alter column "n" set not null;',
      ].join("\n"),
    );
    expect(withDefault.safety).toBe("additive");
    const setDefault = migrationSafety(
      'alter table "item" alter column "n" set default 0, alter column "n" set not null;',
    );
    expect(setDefault.safety).toBe("additive");
    const without = migrationSafety(
      [
        'alter table "item" add column "n" integer;',
        'alter table "item" alter column "n" set not null;',
      ].join("\n"),
    );
    expect(without.safety).toBe("destructive");
    expect(without.why).toContain("SET NOT NULL");
  });

  it("is destructive with nothing to read — an empty migration is not one it can vouch for", () => {
    expect(migrationSafety("").safety).toBe("destructive");
    expect(migrationSafety("-- only a comment\n").safety).toBe("destructive");
  });

  // Every migration this repository carries is read without throwing, and the shapes the rule
  // was written against come out as the ticket says: 0016's backfill is an UPDATE and a SET
  // NOT NULL, so it is destructive; 0006's one index is additive; 0015 — a table, its policies,
  // its revoke and grants, a unique — is additive too, which is the shape MERGE APPLY is for.
  it("reads every migration in drizzle/, and classifies the known shapes", () => {
    const dir = join(root, "drizzle");
    const files = readdirSync(dir).filter((name) => name.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(10);
    for (const name of files) {
      const read = migrationSafety(readFileSync(join(dir, name), "utf8"));
      expect(["additive", "destructive"], name).toContain(read.safety);
    }
    expect(
      migrationSafety(readFileSync(join(dir, "0016_opportunity_keys.sql"), "utf8")),
    ).toMatchObject({ safety: "destructive" });
    expect(
      migrationSafety(readFileSync(join(dir, "0006_activity_subject_index.sql"), "utf8")),
    ).toMatchObject({ safety: "additive" });
    expect(
      migrationSafety(readFileSync(join(dir, "0015_refinement_round.sql"), "utf8")),
    ).toMatchObject({ safety: "additive" });
  });
});

describe("safetyOfFiles", () => {
  it("reads each path through the reader handed in, and calls an unreadable one destructive", () => {
    const texts = { "drizzle/0022_a.sql": 'create table "a" (id int);' };
    const read = safetyOfFiles(
      ["drizzle/0022_a.sql", "drizzle/0023_b.sql"],
      (path) => texts[path] ?? null,
    );
    expect(read["drizzle/0022_a.sql"]).toMatchObject({ safety: "additive", why: null });
    expect(read["drizzle/0023_b.sql"]).toMatchObject({ safety: "destructive" });
    expect(read["drizzle/0023_b.sql"].why).toContain("could not be read");
  });
});
