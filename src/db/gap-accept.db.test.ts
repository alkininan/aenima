import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { composeRunView, type StoredRunInput } from "@/lib/scoring/run-view";
import { featurePrdPack } from "@/packs/feature-prd";

/**
 * §5's third negotiation move against a real Postgres — `accept_gap` and
 * `reopen_gap` from `drizzle/0012`.
 *
 * **These are the tests only a database can run.** The functions are SECURITY
 * INVOKER, so what they may write is decided by `gap_update` and
 * `activity_insert` evaluating as the caller; the Decider is read from `product`
 * mid-statement; the guard on the prior disposition is inside an UPDATE's WHERE;
 * and the whole thing is one transaction because PostgREST wraps an RPC in one.
 * Not one of those five properties survives a mock — a stubbed client would
 * agree with any implementation, including one that wrote the stamp from a
 * parameter and skipped the ledger.
 *
 * Every test runs inside a transaction that is rolled back, impersonating a user
 * the way PostgREST does (`actAs`), which is the harness `rls.db.test.ts` and
 * `gap-decision.db.test.ts` already use.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const OFFLINE = !DATABASE_URL;

if (OFFLINE) {
  process.stderr.write(
    "\ngap-accept.db.test.ts skipped: no DATABASE_URL. §5's third move, the §14 role\n" +
      "matrix and the atomicity of the ledger row are all unverified in this run.\n\n",
  );
}

const sql = OFFLINE ? null : postgres(DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

afterAll(async () => {
  await sql?.end();
});

type Tx = postgres.TransactionSql;

const INSTANCE = "00000000-0000-0000-0000-000000000000";
const USERS = {
  owner: "aaaa0000-1111-4000-8000-0000000000a1",
  decider: "bbbb0000-1111-4000-8000-0000000000b2",
  product: "cccc0000-1111-4000-8000-0000000000c3",
  developer: "dddd0000-1111-4000-8000-0000000000d4",
  viewer: "eeee0000-1111-4000-8000-0000000000e5",
} as const;

type Who = keyof typeof USERS;

const ROLE: Record<Who, string> = {
  owner: "owner",
  decider: "product",
  product: "product",
  developer: "developer",
  viewer: "viewer",
};

async function rolledBack<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!sql) throw new Error("no database");
  const sentinel = Symbol("rollback");
  let captured: T;
  try {
    await sql.begin(async (tx) => {
      captured = await fn(tx);
      throw sentinel;
    });
  } catch (error) {
    if (error !== sentinel) throw error;
  }
  return captured!;
}

/** Becomes `user` for the rest of the transaction, exactly as PostgREST does. */
async function actAs(tx: Tx, user: string): Promise<void> {
  await tx`select set_config('role', 'authenticated', true)`;
  await tx`select set_config('request.jwt.claims',
                             ${JSON.stringify({ sub: user, role: "authenticated" })}, true)`;
}

/** Back to the owning role, so the test can seed and assert past RLS. */
async function asOwner(tx: Tx): Promise<void> {
  await tx`select set_config('role', 'postgres', true)`;
  await tx`select set_config('request.jwt.claims', '', true)`;
}

type World = { workspaceId: string; productId: string; itemId: string };

/** A workspace with one member per §14 role, and a product whose Decider is named. */
async function seedWorld(tx: Tx): Promise<World> {
  for (const [who, id] of Object.entries(USERS)) {
    await tx`
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                              email_confirmed_at, created_at, updated_at)
      values (${id}, ${INSTANCE}, 'authenticated', 'authenticated',
              ${`${who}@accept.test`}, '', now(), now(), now())`;
  }

  const [ws] = await tx<{ id: string }[]>`
    insert into workspace (name) values ('Accept') returning id`;

  for (const [who, id] of Object.entries(USERS)) {
    await tx`insert into membership (workspace_id, user_id, role, all_products)
             values (${ws!.id}, ${id}, ${ROLE[who as Who]}::member_role, true)`;
  }

  const [product] = await tx<{ id: string }[]>`
    insert into product (workspace_id, name, slug, key_prefix, decider_user_id)
    values (${ws!.id}, 'Accept', 'accept', 'acc', ${USERS.decider}) returning id`;

  const [item] = await tx<{ id: string }[]>`
    insert into item (workspace_id, product_id, type, title, flow_intent)
    values (${ws!.id}, ${product!.id}, 'feature', 'Ghost mode', 'value') returning id`;

  return { workspaceId: ws!.id, productId: product!.id, itemId: item!.id };
}

async function makeGap(tx: Tx, world: World, tag: "must" | "should"): Promise<string> {
  const [gap] = await tx<{ id: string }[]>`
    insert into gap (workspace_id, item_id, check_id, tag, evidence)
    values (${world.workspaceId}, ${world.itemId}, 'prd-10', ${tag}::gap_tag,
            'GM-4 is prose rather than Given/When/Then.')
    returning id`;
  return gap!.id;
}

const accept = async (tx: Tx, gapId: string, reason: string): Promise<string> =>
  (await tx<{ v: string }[]>`select public.accept_gap(${gapId}, ${reason}) as v`)[0]!.v;

const reopen = async (tx: Tx, gapId: string): Promise<string> =>
  (await tx<{ v: string }[]>`select public.reopen_gap(${gapId}) as v`)[0]!.v;

/** Asserts one statement is rejected, inside a savepoint so the tx stays usable. */
async function rejectsWith(tx: Tx, statement: (sp: Tx) => Promise<unknown>, pattern: RegExp) {
  await expect(tx.savepoint((sp) => statement(sp as Tx))).rejects.toThrow(pattern);
}

const ledger = async (tx: Tx, gapId: string) =>
  await tx<{ action: string; shape: string; reason: string | null; undid: string | null }[]>`
    select action, jsonb_typeof(metadata) as shape,
           metadata->>'reason' as reason, metadata->>'undid' as undid
      from activity where subject_table = 'gap' and subject_id = ${gapId}
     order by action`;

describe.skipIf(OFFLINE)("accept_gap — §5's third move", () => {
  /**
   * §5: "converts it to an accepted gap stamped with the accepter's name."
   *
   * The stamp is `auth.uid()` read inside the function — there is no parameter
   * through which to claim someone else's name — and `gap_resolution_shape`
   * refuses the row unless all three stamp columns arrive together.
   */
  it("stamps the gap with the accepter, the time and the reason, and logs it once", async () => {
    await rolledBack(async (tx) => {
      const world = await seedWorld(tx);
      const gapId = await makeGap(tx, world, "must");
      await actAs(tx, USERS.owner);

      expect(await accept(tx, gapId, "  Accepted for V1; revisit at scale.  ")).toBe("accepted");

      await asOwner(tx);
      const [row] = await tx<
        { d: string; by: string; at: Date | null; note: string; updated: Date }[]
      >`select disposition::text as d, resolved_by_user_id as by, resolved_at as at,
               resolution_note as note, updated_at as updated
          from gap where id = ${gapId}`;

      expect(row!.d).toBe("accepted");
      expect(row!.by).toBe(USERS.owner);
      expect(row!.at).not.toBeNull();
      // Trimmed once, in the function: the constraint tests `btrim`, so an
      // untrimmed insert would store whitespace the constraint approved.
      expect(row!.note).toBe("Accepted for V1; revisit at scale.");

      const rows = await ledger(tx, gapId);
      expect(rows.map((r) => r.action)).toEqual(["gap.accepted"]);
      // An object, not a string that looks like one — `writeRun`'s lesson.
      expect(rows[0]!.shape).toBe("object");
      // §1 law 7: the reason has to outlive the column, because reopening nulls
      // it. Without this the only record of *why* would be erased by the undo.
      expect(rows[0]!.reason).toBe("Accepted for V1; revisit at scale.");
    });
  });

  /**
   * §14, and the correction this ticket made to its own brief: the Decider
   * "accepts flags", and the Owner can do everything and is the Fallback
   * Decider. `product.decider_user_id` has existed since 0000.
   */
  it("lets the Decider and the Owner settle a Must, and nobody else", async () => {
    await rolledBack(async (tx) => {
      const world = await seedWorld(tx);
      const matrix: Record<string, { must: string; should: string }> = {};

      for (const who of Object.keys(USERS) as Who[]) {
        const must = await makeGap(tx, world, "must");
        const should = await makeGap(tx, world, "should");
        await actAs(tx, USERS[who]);
        matrix[who] = { must: await accept(tx, must, "r"), should: await accept(tx, should, "r") };
        await asOwner(tx);
      }

      expect(matrix).toEqual({
        owner: { must: "accepted", should: "accepted" },
        // A Product-role member who *is* the named Decider. This row is the
        // whole reason the ticket's "Owner only" premise was corrected.
        decider: { must: "accepted", should: "accepted" },
        // Product, not the Decider: §5 routes a blocking gap through them.
        product: { must: "not-decider", should: "accepted" },
        // §14: "Viewer appears in no write policy anywhere", and a Developer
        // authors artifacts. Neither settles a gap of either tag *unless the
        // product names them Decider* — see the two tests below — and the
        // answer says that, rather than implying the Decider role would help.
        developer: { must: "not-permitted", should: "not-permitted" },
        viewer: { must: "not-permitted", should: "not-permitted" },
      });
    });
  });

  /**
   * **§14's appointment is not shadowed by the role table.**
   *
   * "Each product names a **Decider** (config field) who approves spec patches,
   * accepts flags, and can waive walkthroughs." It names a person, not a role,
   * and the Owner is the fallback for a Decider's *absence* rather than an
   * override of a present one. T2.5 asked the role first, so a Developer who
   * was the named Decider was told their role does not settle gaps — which was
   * the review's finding, and drizzle/0013 is the answer: the appointment is
   * asked first, and `gap_update` and `activity_insert` were widened by exactly
   * that disjunct so the policies say what §14 says.
   */
  it("lets a Developer who is the named Decider settle both tags", async () => {
    await rolledBack(async (tx) => {
      const world = await seedWorld(tx);
      await tx`update product set decider_user_id = ${USERS.developer} where id = ${world.productId}`;
      const must = await makeGap(tx, world, "must");
      const should = await makeGap(tx, world, "should");

      await actAs(tx, USERS.developer);
      expect(await accept(tx, must, "The API contract is the record.")).toBe("accepted");
      expect(await accept(tx, should, "Same.")).toBe("accepted");
      // And it is a real write, with the ledger row §2 requires — not a token
      // returned by a function whose UPDATE the policy then refused.
      expect(await reopen(tx, must)).toBe("reopened");

      await asOwner(tx);
      const rows = await ledger(tx, must);
      expect(rows.map((r) => r.action)).toEqual(["gap.accepted", "gap.reopened"]);

      const [row] = await tx<
        { by: string | null }[]
      >`select resolved_by_user_id as by from gap where id = ${should}`;
      // §5's stamp is `auth.uid()`, so the Decider's own name is on the debt.
      expect(row!.by).toBe(USERS.developer);
    });
  });

  /**
   * The other half, and the reason the reorder is not a loosening: the
   * appointment is what grants this, so a Developer who does not hold it is
   * refused exactly as before — including on the same product, once the
   * appointment moves to somebody else.
   */
  it("still refuses a Developer the product does not name", async () => {
    await rolledBack(async (tx) => {
      const world = await seedWorld(tx);
      const must = await makeGap(tx, world, "must");
      const should = await makeGap(tx, world, "should");

      // The product names `decider`, not `developer`.
      await actAs(tx, USERS.developer);
      expect(await accept(tx, must, "r")).toBe("not-permitted");
      expect(await accept(tx, should, "r")).toBe("not-permitted");

      await asOwner(tx);
      const rows = await tx<{ d: string }[]>`
        select disposition::text as d from gap where id in (${must}, ${should})`;
      expect(rows.map((r) => r.d)).toEqual(["open", "open"]);
      expect(await ledger(tx, must)).toEqual([]);
    });
  });

  /**
   * The appointment is scoped to the product *and* to membership:
   * `app.is_product_decider` requires the caller to still be in the workspace,
   * so a Decider whose membership is gone loses it rather than keeping a
   * standing write on a workspace they left.
   *
   * **Asserted on the predicate, not only through the move.** `gap_select`
   * already refuses a non-member, so both moves would answer `not-found`
   * whether the clause were there or not — a test that only pressed the button
   * would go green with the clause deleted. The predicate is where the rule
   * lives, so it is where the rule is measured; the move is asserted after it
   * to prove nothing else lets the appointment back in.
   */
  it("takes the appointment away from a Decider who left the workspace", async () => {
    await rolledBack(async (tx) => {
      const world = await seedWorld(tx);
      const must = await makeGap(tx, world, "must");

      const decides = async () =>
        (await tx<{ v: boolean }[]>`select app.is_product_decider(${world.productId}) as v`)[0]!.v;

      await actAs(tx, USERS.decider);
      expect(await decides()).toBe(true);
      await asOwner(tx);

      await tx`delete from membership
                where workspace_id = ${world.workspaceId} and user_id = ${USERS.decider}`;

      await actAs(tx, USERS.decider);
      expect(await decides()).toBe(false);
      // And the move answers as it does for any stranger — deliberately the
      // same 404 `/i/[key]` gives, since `gap_select` needs the membership too.
      expect(await accept(tx, must, "r")).toBe("not-found");

      await asOwner(tx);
      expect(await ledger(tx, must)).toEqual([]);
    });
  });

  /**
   * **§14's Viewer row beats the appointment — the ruling on open question 20.**
   *
   * "Viewer | Read-only | Everything else", and 0001 read that as "Viewer
   * appears in no write policy anywhere". A product that names a Viewer as its
   * Decider puts that against §14's Decider sentence, and the row wins: the
   * sentence says what a Decider *does*, the table says what a role *may do*,
   * and a per-product config field must not silently grant a workspace-level
   * write. So 0013's `= 'developer'` scope is the law, this test pins a rule
   * rather than a holding position, and a Viewer-Decider stays exactly where
   * 0004 and 0001 left them. Making the configuration uncreatable in the first
   * place is Phase 6's roles ticket; this is the floor under it.
   *
   * **Asserted on all three routes, because the answer has to hold on the one
   * the surface does not use.** The move returns `not-permitted`; the table
   * refuses the UPDATE behind it; and `activity_insert` refuses the ledger row
   * — which is the finding the first draft of 0013 created and this one closes
   * by not touching that policy at all. A test that only pressed the button
   * would go green against a policy that let a Viewer write the ledger.
   */
  it("gives a Viewer the product names as Decider no write on any route", async () => {
    await rolledBack(async (tx) => {
      const world = await seedWorld(tx);
      await tx`update product set decider_user_id = ${USERS.viewer} where id = ${world.productId}`;
      const must = await makeGap(tx, world, "must");
      const should = await makeGap(tx, world, "should");
      const accepted = await makeGap(tx, world, "must");

      // One already settled, so the reversal has something to reach for.
      await actAs(tx, USERS.owner);
      expect(await accept(tx, accepted, "Owner took this on.")).toBe("accepted");
      await asOwner(tx);

      await actAs(tx, USERS.viewer);

      // The appointment is real — this is not a test of a Viewer who is nobody.
      expect(
        (await tx<{ v: boolean }[]>`select app.is_product_decider(${world.productId}) as v`)[0]!.v,
      ).toBe(true);

      expect(await accept(tx, must, "r")).toBe("not-permitted");
      expect(await accept(tx, should, "r")).toBe("not-permitted");
      expect(await reopen(tx, accepted)).toBe("not-permitted");

      // The table behind the move. `gap_update` refuses, so the UPDATE matches
      // nothing — silently, which is why the count is what gets asserted.
      const direct = await tx`
        update gap set disposition = 'accepted', resolved_by_user_id = ${USERS.viewer},
                       resolved_at = now(), resolution_note = 'By hand.'
         where id = ${must}`;
      expect(direct.count).toBe(0);

      // And the ledger. 0001's `activity_insert` names three roles and Viewer is
      // not one of them; 0013 adds no disjunct here, so it still raises.
      await rejectsWith(
        tx,
        (sp) => sp`
          insert into activity (workspace_id, product_id, actor_kind, actor_user_id,
                                action, trigger_source, subject_table, subject_id)
          values (${world.workspaceId}, ${world.productId}, 'human', ${USERS.owner},
                  'gap.accepted', 'user', 'gap', ${must})`,
        /row-level security/i,
      );

      await asOwner(tx);
      const rows = await tx<{ id: string; d: string }[]>`
        select id, disposition::text as d from gap
         where id in (${must}, ${should}, ${accepted}) order by disposition::text`;
      expect(rows.map((r) => r.d)).toEqual(["accepted", "open", "open"]);
      expect(await ledger(tx, must)).toEqual([]);
      expect(await ledger(tx, should)).toEqual([]);
      // The Owner's acceptance, and nothing the Viewer added on top of it.
      expect((await ledger(tx, accepted)).map((r) => r.action)).toEqual(["gap.accepted"]);
    });
  });

  /**
   * **What §14 gives a Decider is a settle, and RLS cannot say that.**
   *
   * `gap_update` is a whole-row policy: "may write this row" and "may settle
   * this gap" are the same yes to it, so the first draft of 0013 handed a
   * Decider `tag`, `evidence`, `check_id`, `item_id`, `excluded` and somebody
   * else's uuid in `resolved_by_user_id` along with the acceptance. The column
   * half of the grant lives in `app.gap_settle_shape`, a BEFORE UPDATE trigger,
   * because a row predicate has nowhere to put it.
   *
   * **Pressed against the table rather than through the functions.** Going
   * through `accept_gap` would prove nothing: it only ever issues the two
   * statements below that succeed, so every refusal here would pass against a
   * database with no trigger at all.
   */
  it("bounds a Developer-Decider's own writes to the settle transition", async () => {
    await rolledBack(async (tx) => {
      const world = await seedWorld(tx);
      await tx`update product set decider_user_id = ${USERS.developer} where id = ${world.productId}`;
      const gapId = await makeGap(tx, world, "must");
      const [other] = await tx<{ id: string }[]>`
        insert into item (workspace_id, product_id, type, title)
        values (${world.workspaceId}, ${world.productId}, 'feature', 'Other') returning id`;

      await actAs(tx, USERS.developer);

      const rewrite = /settles a gap and does not rewrite one/;
      const notASettle = /is not a settle the Decider may make/;

      // The identity of the gap. `tag` is the one that matters most: flipping a
      // Must to a Should retires a handover-blocking gap with no acceptance,
      // no name and no ledger row.
      await rejectsWith(tx, (sp) => sp`update gap set tag = 'should' where id = ${gapId}`, rewrite);
      await rejectsWith(
        tx,
        (sp) => sp`update gap set evidence = 'Nothing wrong here.' where id = ${gapId}`,
        rewrite,
      );
      await rejectsWith(
        tx,
        (sp) => sp`update gap set check_id = 'prd-1' where id = ${gapId}`,
        rewrite,
      );
      await rejectsWith(
        tx,
        (sp) => sp`update gap set item_id = ${other!.id} where id = ${gapId}`,
        rewrite,
      );

      // §5's first move, which §14 gives to Product ("confirm exclusions"), and
      // the machine's disposition. Neither is an acceptance.
      await rejectsWith(
        tx,
        (sp) => sp`
          update gap set disposition = 'excluded', resolved_by_user_id = ${USERS.developer},
                         resolved_at = now(), resolution_note = 'Not applicable.'
           where id = ${gapId}`,
        notASettle,
      );
      await rejectsWith(
        tx,
        (sp) => sp`
          update gap set disposition = 'closed', resolved_at = now() where id = ${gapId}`,
        notASettle,
      );

      // 0012's "the stamp is `auth.uid()`, never an argument" — made true of the
      // table and not only of the function.
      await rejectsWith(
        tx,
        (sp) => sp`
          update gap set disposition = 'accepted', resolved_by_user_id = ${USERS.owner},
                         resolved_at = now(), resolution_note = 'In your name.'
           where id = ${gapId}`,
        notASettle,
      );
      // The same property for the clock: `now()` is the transaction timestamp,
      // so a backdated acceptance is not one `accept_gap` could have written.
      await rejectsWith(
        tx,
        (sp) => sp`
          update gap set disposition = 'accepted', resolved_by_user_id = ${USERS.developer},
                         resolved_at = timestamptz '2001-01-01', resolution_note = 'Long ago.'
           where id = ${gapId}`,
        notASettle,
      );

      // Nothing above landed.
      await asOwner(tx);
      const [before] = await tx<{ d: string; tag: string; ev: string; item: string }[]>`
        select disposition::text as d, tag::text as tag, evidence as ev, item_id as item
          from gap where id = ${gapId}`;
      expect(before).toEqual({
        d: "open",
        tag: "must",
        ev: "GM-4 is prose rather than Given/When/Then.",
        item: world.itemId,
      });
      await actAs(tx, USERS.developer);

      // And the two that are the grant: exactly the statements the functions
      // issue, and they land.
      const acceptedRow = await tx`
        update gap set disposition = 'accepted', resolved_by_user_id = ${USERS.developer},
                       resolved_at = now(), resolution_note = 'The contract is the record.'
         where id = ${gapId}`;
      expect(acceptedRow.count).toBe(1);

      // Editing a settled note in place is not one of the two moves either.
      await rejectsWith(
        tx,
        (sp) => sp`update gap set resolution_note = 'Reworded.' where id = ${gapId}`,
        notASettle,
      );

      const reopened = await tx`
        update gap set disposition = 'open', resolved_by_user_id = null,
                       resolved_at = null, resolution_note = null
         where id = ${gapId}`;
      expect(reopened.count).toBe(1);

      // **Open question 21, pinned rather than described.** A settle written
      // straight at the table carries no ledger row, because §2's ledger lives
      // in the two functions and not in the table. That is 0004's shape for
      // Owner and Product and 0013 does not widen it — but it is now true of a
      // Developer-Decider too, and the fix is structural rather than this
      // ticket's. This assertion is what turns red when it is made.
      await asOwner(tx);
      expect(await ledger(tx, gapId)).toEqual([]);
    });
  });

  // §5's reason is the record of why a debt was taken on, so a blank one is not
  // a decision anyone can read later. Refused before the write, so the person
  // gets a field to fill in rather than a constraint violation.
  it("refuses a blank reason without touching the gap or the ledger", async () => {
    await rolledBack(async (tx) => {
      const world = await seedWorld(tx);
      const gapId = await makeGap(tx, world, "should");
      await actAs(tx, USERS.owner);

      expect(await accept(tx, gapId, "   ")).toBe("reason-required");
      expect(await accept(tx, gapId, "x".repeat(2001))).toBe("reason-too-long");

      await asOwner(tx);
      const [row] = await tx<
        { d: string }[]
      >`select disposition::text as d from gap where id = ${gapId}`;
      expect(row!.d).toBe("open");
      expect(await ledger(tx, gapId)).toEqual([]);
    });
  });

  /**
   * **Write-time truth, forward.** The guard is in the UPDATE's own WHERE, so a
   * gap that moved between the read and the write is a reported no-op — and
   * critically, no second ledger row: `writeRun`'s "a `gap.restated` entry for a
   * gap that was not restated is the ledger saying something that did not
   * happen."
   */
  it("reports a second accept as a no-op and writes no second ledger row", async () => {
    await rolledBack(async (tx) => {
      const world = await seedWorld(tx);
      const gapId = await makeGap(tx, world, "must");
      await actAs(tx, USERS.owner);

      expect(await accept(tx, gapId, "first")).toBe("accepted");
      expect(await accept(tx, gapId, "second")).toBe("not-open");

      await asOwner(tx);
      const rows = await ledger(tx, gapId);
      expect(rows.map((r) => r.action)).toEqual(["gap.accepted"]);
      // The first reason stands. A silent overwrite would rewrite a named
      // person's debt, which is the act §1 law 7 exists to forbid.
      expect(rows[0]!.reason).toBe("first");
    });
  });

  /**
   * A gap in another workspace and a uuid that names nothing are **one answer,
   * by one code path** — the ruling `/i/[key]` already made for its 404:
   * "telling them apart would answer 'does this key exist somewhere?', which is
   * not a question a stranger gets to ask." Being a member of *a* workspace does
   * not change it, because `can_see_product` is a boundary inside one.
   */
  it("answers not-found for a hidden gap exactly as for one that does not exist", async () => {
    await rolledBack(async (tx) => {
      const mine = await seedWorld(tx);
      const theirs = await seedWorld2(tx);
      const theirGap = await makeGap(tx, theirs, "must");
      const myGap = await makeGap(tx, mine, "must");

      await actAs(tx, USERS.owner);
      expect(await accept(tx, theirGap, "r")).toBe("not-found");
      expect(await accept(tx, "00000000-0000-4000-8000-000000000000", "r")).toBe("not-found");

      await asOwner(tx);
      // Their gap is untouched, and so is mine — a refused move writes nothing.
      const rows = await tx<{ d: string }[]>`
        select disposition::text as d from gap where id in (${theirGap}, ${myGap})`;
      expect(rows.map((r) => r.d)).toEqual(["open", "open"]);
      expect(await ledger(tx, theirGap)).toEqual([]);
    });
  });
});

/** A second workspace nobody in the first belongs to. */
async function seedWorld2(tx: Tx): Promise<World> {
  const stranger = "ffff0000-1111-4000-8000-0000000000f6";
  await tx`
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at)
    values (${stranger}, ${INSTANCE}, 'authenticated', 'authenticated',
            'stranger@accept.test', '', now(), now(), now())`;
  const [ws] = await tx<
    { id: string }[]
  >`insert into workspace (name) values ('Theirs') returning id`;
  await tx`insert into membership (workspace_id, user_id, role, all_products)
           values (${ws!.id}, ${stranger}, 'owner', true)`;
  const [product] = await tx<{ id: string }[]>`
    insert into product (workspace_id, name, slug, key_prefix)
    values (${ws!.id}, 'Theirs', 'theirs', 'the') returning id`;
  const [item] = await tx<{ id: string }[]>`
    insert into item (workspace_id, product_id, type, title, flow_intent)
    values (${ws!.id}, ${product!.id}, 'feature', 'Theirs', 'value') returning id`;
  return { workspaceId: ws!.id, productId: product!.id, itemId: item!.id };
}

describe.skipIf(OFFLINE)("reopen_gap — §1 law 4's standing reversal", () => {
  it("returns the gap to open, clears all three stamp columns, and keeps the reason", async () => {
    await rolledBack(async (tx) => {
      const world = await seedWorld(tx);
      const gapId = await makeGap(tx, world, "must");
      await actAs(tx, USERS.owner);

      await accept(tx, gapId, "Accepted for V1.");
      expect(await reopen(tx, gapId)).toBe("reopened");

      await asOwner(tx);
      const [row] = await tx<
        { d: string; by: string | null; at: Date | null; note: string | null }[]
      >`select disposition::text as d, resolved_by_user_id as by, resolved_at as at,
               resolution_note as note from gap where id = ${gapId}`;

      // All three together — `gap_resolution_shape`'s `open` arm demands it.
      expect(row).toMatchObject({ d: "open", by: null, at: null, note: null });

      const rows = await ledger(tx, gapId);
      expect(rows.map((r) => r.action)).toEqual(["gap.accepted", "gap.reopened"]);
      // §1 law 7: the column is gone, and the record of why is not. History
      // holds both moves forever.
      expect(rows[1]!.undid).toBe("Accepted for V1.");
    });
  });

  /** **Write-time truth, backward** — the mirror of the accept's guard. */
  it("reports reopening an open gap as a no-op, with no ledger row", async () => {
    await rolledBack(async (tx) => {
      const world = await seedWorld(tx);
      const gapId = await makeGap(tx, world, "must");
      await actAs(tx, USERS.owner);

      expect(await reopen(tx, gapId)).toBe("not-accepted");

      await asOwner(tx);
      expect(await ledger(tx, gapId)).toEqual([]);
    });
  });

  /**
   * `excluded` is §5's *first* move and `closed` is the machine's — written by a
   * scoring run with a time and no name. A human hand-reopening either would put
   * a person's name on a transition nobody decided.
   */
  it("refuses to reopen an excluded or a closed gap", async () => {
    await rolledBack(async (tx) => {
      const world = await seedWorld(tx);
      const excluded = await makeGap(tx, world, "must");
      const closed = await makeGap(tx, world, "must");

      await tx`update gap set disposition = 'excluded', resolved_by_user_id = ${USERS.owner},
                              resolved_at = now(), resolution_note = 'Not applicable.'
                where id = ${excluded}`;
      await tx`update gap set disposition = 'closed', resolved_at = now() where id = ${closed}`;

      await actAs(tx, USERS.owner);
      expect(await reopen(tx, excluded)).toBe("not-accepted");
      expect(await reopen(tx, closed)).toBe("not-accepted");

      await asOwner(tx);
      const [still] = await tx<
        { d: string }[]
      >`select disposition::text as d from gap where id = ${excluded}`;
      expect(still!.d).toBe("excluded");
    });
  });

  // The same gate as accepting: whoever could have taken the debt on can hand it
  // back, and nobody else can quietly undo their name.
  it("gates the reversal exactly as the acceptance was gated", async () => {
    await rolledBack(async (tx) => {
      const world = await seedWorld(tx);
      const gapId = await makeGap(tx, world, "must");

      await actAs(tx, USERS.owner);
      await accept(tx, gapId, "Accepted.");
      await asOwner(tx);

      await actAs(tx, USERS.product);
      expect(await reopen(tx, gapId)).toBe("not-decider");
      await asOwner(tx);

      await actAs(tx, USERS.decider);
      expect(await reopen(tx, gapId)).toBe("reopened");
    });
  });
});

describe.skipIf(OFFLINE)("the meter does not move", () => {
  /**
   * **§5's own words, and the line between this ticket and Phase 3's.**
   *
   * "'We accept this risk' → **never closes the gap**". Accepting is a statement
   * about who owns a debt, not about whether the artifact is better — so the
   * score must be byte-identical across the move. Moves 1 and 2 are the ones
   * that change a number, and they are Phase 3.
   *
   * Proved rather than asserted: this composes the real `RunView` from the real
   * stored rows before and after a real accept, and compares the whole object.
   * A `toEqual` over the composed view catches a changed score, a changed
   * denominator, a changed verdict, a reordered list and a changed provenance in
   * one assertion — anything an accept could conceivably have touched.
   */
  it("composes an identical run before and after an accept, and after the reopen", async () => {
    await rolledBack(async (tx) => {
      const world = await seedWorld(tx);
      const gapId = await makeGap(tx, world, "must");

      const [artifact] = await tx<{ id: string }[]>`
        insert into artifact (workspace_id, item_id, kind)
        values (${world.workspaceId}, ${world.itemId}, 'prd') returning id`;
      const [version] = await tx<{ id: string }[]>`
        insert into artifact_version (workspace_id, artifact_id, version_no, content,
                                      content_hash, authored_by_kind, authored_by_agent)
        values (${world.workspaceId}, ${artifact!.id}, 1, ${tx.json({ body: "# Ghost" })},
                'hash-1', 'agent', 'seed') returning id`;
      const [run] = await tx<{ id: string }[]>`
        insert into scoring_run (workspace_id, item_id, artifact_id, artifact_version_id,
                                 pack_id, pack_version, protocol_version, provider, model,
                                 conditions_met, earned, denominator)
        values (${world.workspaceId}, ${world.itemId}, ${artifact!.id}, ${version!.id},
                'feature-prd', '1.0.0', '1.0.0', 'anthropic', 'claude-sonnet-5',
                ${["network-dependent-surface"]}, 66, 99) returning id`;
      await tx`insert into scoring_check_result
                 (workspace_id, run_id, check_id, tag, points, passed, note)
               values (${world.workspaceId}, ${run!.id}, 'prd-10', 'must', 10, false,
                       'GM-4 is prose.')`;
      await tx`insert into scoring_check_not_asked
                 (workspace_id, run_id, check_id, tag, points, condition_id, condition_when)
               values (${world.workspaceId}, ${run!.id}, 'prd-15', 'must', 6,
                       'list-rendering-surface', 'The feature renders a list.')`;

      /** The run as the item page would compose it, read back from the rows. */
      const compose = async () => {
        const [header] = await tx<Record<string, string | number>[]>`
          select pack_id, pack_version, model, scored_at::text as scored_at, earned, denominator
            from scoring_run where id = ${run!.id}`;
        const results = await tx<Record<string, unknown>[]>`
          select check_id, tag, points, passed, requirement_id, quote, note
            from scoring_check_result where run_id = ${run!.id}`;
        const notAsked = await tx<Record<string, unknown>[]>`
          select check_id, tag, points, condition_when
            from scoring_check_not_asked where run_id = ${run!.id}`;

        const stored: StoredRunInput = {
          packId: String(header!.pack_id),
          packVersion: String(header!.pack_version),
          model: String(header!.model),
          scoredAt: String(header!.scored_at),
          nextScoringAttemptAt: null,
          earned: Number(header!.earned),
          denominator: Number(header!.denominator),
          results: results.map((r) => ({
            checkId: String(r.check_id),
            tag: r.tag as "must" | "should",
            points: Number(r.points),
            passed: Boolean(r.passed),
            requirementId: (r.requirement_id as string | null) ?? null,
            quote: (r.quote as string | null) ?? null,
            note: (r.note as string | null) ?? null,
          })),
          notAsked: notAsked.map((r) => ({
            checkId: String(r.check_id),
            tag: r.tag as "must" | "should",
            points: Number(r.points),
            conditionWhen: String(r.condition_when),
          })),
        };
        return composeRunView(featurePrdPack, stored);
      };

      const before = await compose();
      expect(before.score).toBe(67);

      await actAs(tx, USERS.owner);
      expect(await accept(tx, gapId, "Accepted for V1.")).toBe("accepted");
      await asOwner(tx);

      const afterAccept = await compose();
      expect(afterAccept).toEqual(before);

      await actAs(tx, USERS.owner);
      expect(await reopen(tx, gapId)).toBe("reopened");
      await asOwner(tx);

      expect(await compose()).toEqual(before);
    });
  });
});
