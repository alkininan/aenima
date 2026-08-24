/**
 * Seed data for later tickets to build against: one workspace, two products,
 * several opportunities, and items across all seven types (§4) and every stage
 * the system can currently derive (§3).
 *
 * The point is that the list surface has something honest to render. That means
 * artifacts with real version histories rather than empty identity rows —
 * `deriveStage` reads version counts, so an item with an empty PRD is in
 * Discover and would make the seed look broken — and gaps in all three
 * dispositions, because §5's negotiation history is what an item page is for.
 * `handed_over` is deliberately absent: there is no packet table, so no seed
 * row could reach it without lying.
 *
 * Runs on the service-role connection, which bypasses RLS — it has no session
 * to act as. It creates a real auth user so that memberships and activity rows
 * have a genuine owner to point at, rather than a dangling uuid.
 *
 * Idempotent: re-running finds the existing workspace by name and stops.
 */
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";

import { createDbClient } from "../src/db/client";
import {
  activity,
  artifact,
  artifactVersion,
  decision,
  gap,
  item,
  membership,
  opportunity,
  product,
  workspace,
} from "../src/db/schema";

const WORKSPACE_NAME = "Seed workspace";
const OWNER_EMAIL = "seed-owner@aenima.test";

/** The seed's first product. Named, because two of them exist. */
const PRIMARY_PRODUCT_SLUG = "sociera";

/**
 * §4's seven types, and §3's three derivable stages spread across them.
 *
 * `artifacts` is what decides the stage: a PRD with versions reads as Define, a
 * design package on top of it reads as Design, nothing reads as Discover. The
 * `versions` counts are deliberately uneven — §11 makes history the normal
 * case, so a seed where everything is at v1 would be a seed nobody could test
 * version rendering against.
 */
const ITEMS = [
  {
    type: "feature",
    title: "Weekly digest email",
    flowIntent: "value",
    artifacts: [
      { kind: "brief", versions: 1 },
      { kind: "prd", versions: 3 },
      { kind: "design_package", versions: 2 },
    ],
  },
  {
    type: "enhancement",
    title: "Faster item search",
    flowIntent: "quality",
    artifacts: [
      { kind: "prd", versions: 2 },
      { kind: "design_package", versions: 1 },
    ],
  },
  {
    type: "technical",
    title: "Move scoring to a queue",
    flowIntent: "debt",
    artifacts: [
      { kind: "prd", versions: 1 },
      { kind: "tech_spec", versions: 2 },
    ],
  },
  {
    type: "content",
    title: "Rewrite the empty states",
    flowIntent: "quality",
    artifacts: [{ kind: "prd", versions: 1 }],
  },
  {
    type: "experiment",
    title: "Inline confirm vs modal",
    flowIntent: "value",
    artifacts: [{ kind: "brief", versions: 1 }],
  },
  {
    type: "fix",
    title: "Timestamps render in UTC on the item page",
    flowIntent: "risk",
    // An artifact row with no versions: identity without content, which §3
    // reads as Discover. Worth seeding because it is the case that looks wrong
    // until you know the rule.
    artifacts: [{ kind: "prd", versions: 0 }],
  },
  {
    type: "spike",
    title: "Can we diff Figma frames by node id?",
    flowIntent: "risk",
    artifacts: [],
  },
] as const;

/** A second product, so nothing can quietly assume one (§2's isolation unit). */
const SECOND_PRODUCT_ITEMS = [
  {
    type: "feature",
    title: "Shared reading lists",
    flowIntent: "value",
    artifacts: [{ kind: "prd", versions: 2 }],
  },
  {
    type: "fix",
    title: "Duplicate notifications on retry",
    flowIntent: "risk",
    artifacts: [],
  },
] as const;

/**
 * §13's At risk bucket, given something to hold.
 *
 * Without this the seed demonstrates two buckets out of three: its one open
 * Must gap is a day old on an item in Design, which is Your move, and nothing is
 * stale. So this is an item deliberately arranged to be at risk and nothing
 * else.
 *
 * **It carries no artifacts, and that is the whole trick.** An open Must gap on
 * an item at Define or later is Your move — a decision waiting on a person, and
 * Your move outranks At risk. In Discover the same gap is not yet anyone's move,
 * so what remains is §13's other clause: "a handover-blocking gap older than 5
 * days". Nine days puts it comfortably past, without sitting on the boundary the
 * unit tests already own.
 *
 * An invite-by-link surface is where §4's safety layer applies, so a blocking
 * safety gap is what this item would really have.
 */
const AT_RISK_ITEM = {
  type: "feature",
  title: "Invite teammates by link",
  flowIntent: "value",
  checkId: "SF-2",
  evidence: "Anyone holding the link can join — no bound on who, and no way to revoke one.",
  gapAgeDays: 9,
} as const;

/**
 * §2's ledger, on a few items — so the item page's feed shows something on real
 * data rather than only in the /dev fixture.
 *
 * Keyed by item title, which is what makes this idempotent: the ids are new on
 * every run and the titles are what identify these items.
 *
 * **One row per item is an agent's**, which is the point of including them: §0
 * law 4 puts agent attribution in violet, and until something in the ledger was
 * written by a machine that treatment could only be seen in a fixture.
 */
const ITEM_ACTIVITY = [
  {
    title: "Weekly digest email",
    rows: [
      { action: "item.created", actor: "human", daysAgo: 20, trigger: "user" },
      { action: "artifact.version.added", actor: "human", daysAgo: 6, trigger: "user" },
      { action: "gap.raised", actor: "agent", daysAgo: 2, trigger: "agent" },
    ],
  },
  {
    title: "Invite teammates by link",
    rows: [
      { action: "item.created", actor: "human", daysAgo: 11, trigger: "user" },
      { action: "gap.raised", actor: "agent", daysAgo: 9, trigger: "agent" },
    ],
  },
  {
    title: "Shared reading lists",
    rows: [
      { action: "item.created", actor: "human", daysAgo: 14, trigger: "user" },
      { action: "artifact.version.added", actor: "human", daysAgo: 1, trigger: "user" },
    ],
  },
] as const;

/** The agent that writes the ledger's machine rows. §5 pins the scorer per workspace. */
const SEED_AGENT = "scorer";

/** §5: one gap in each disposition, so every branch has something to render. */
const GAPS = [
  {
    checkId: "MN-2",
    tag: "must",
    disposition: "open",
    evidence: "'nearby' — same venue, or within 100 m? Two readings possible.",
  },
  {
    checkId: "MN-7",
    tag: "should",
    disposition: "accepted",
    evidence: "No offline behaviour described for the digest list.",
    resolutionNote: "Accepted for V1 — the list is server-rendered and rarely opened offline.",
  },
  {
    checkId: "SF-1",
    tag: "must",
    disposition: "excluded",
    evidence: "No user-to-user visibility on this surface.",
    resolutionNote:
      "Excluded: the digest has no interpersonal surface, so the safety layer is off.",
  },
] as const;

type Db = ReturnType<typeof createDbClient>["db"];
/**
 * Only the sliver of the admin client this needs.
 *
 * Structural rather than `ReturnType<typeof createClient>`, which resolves to a
 * differently-parameterised `SupabaseClient` than the one `main` builds and does
 * not match it under `exactOptionalPropertyTypes`. Naming the two fields that
 * are actually read is both assignable and a more honest signature: this helper
 * looks up one user and touches nothing else.
 */
type AdminAuth = {
  auth: {
    admin: {
      listUsers: () => Promise<{ data: { users: { id: string; email?: string }[] } | null }>;
    };
  };
};

/**
 * Development convenience: put your own account inside the seed workspace.
 *
 * The seed's owner is `seed-owner@aenima.test`, an account nobody can sign in
 * as, so a developer signing in with their real address lands in a workspace of
 * their own and sees none of this. Setting `DEV_SEED_EMAIL` to that address adds
 * it to the seed workspace as an Owner, and RLS does the rest.
 *
 * Three things keep it out of anywhere it does not belong:
 *
 * 1. It does nothing unless `DEV_SEED_EMAIL` is set.
 * 2. It refuses to run under `NODE_ENV=production`.
 * 3. **It can only ever add a member to the workspace the seed itself made.**
 *    That is the structural half, and the one worth relying on: the id it is
 *    handed comes from the seed's own workspace lookup, so there is no argument
 *    it could be given that would grant anyone access to a real one.
 *
 * It never throws. A missing account, a mistyped address, an auth API that is
 * having a bad day — none of those are reasons for `pnpm db:seed` to fail, so
 * every path returns null and the seed carries on.
 */
/**
 * Writes `ITEM_ACTIVITY` for any of its items that has no ledger rows yet, and
 * reports how many rows it added.
 *
 * Idempotent per item rather than per workspace: an item that already has a
 * feed is skipped, so a second run adds nothing and an item added later still
 * gets one. `activity` is append-only — INSERT is the only thing anyone can do
 * to it — so "already there" has to be checked rather than overwritten.
 */
async function ensureItemActivity(db: Db, workspaceId: string, ownerId: string): Promise<number> {
  let written = 0;

  for (const spec of ITEM_ACTIVITY) {
    const [target] = await db
      .select({ id: item.id, productId: item.productId })
      .from(item)
      .where(and(eq(item.workspaceId, workspaceId), eq(item.title, spec.title)))
      .limit(1);

    if (!target) continue;

    const existing = await db
      .select({ id: activity.id })
      .from(activity)
      .where(
        and(
          eq(activity.workspaceId, workspaceId),
          eq(activity.subjectTable, "item"),
          eq(activity.subjectId, target.id),
        ),
      )
      .limit(1);

    if (existing.length > 0) continue;

    for (const row of spec.rows) {
      const agent = row.actor === "agent";
      await db.insert(activity).values({
        workspaceId,
        productId: target.productId,
        actorKind: row.actor,
        // The `activity_actor_shape` check wants exactly one of these per row.
        actorUserId: agent ? null : ownerId,
        actorAgent: agent ? SEED_AGENT : null,
        action: row.action,
        triggerSource: row.trigger,
        subjectTable: "item",
        subjectId: target.id,
        occurredAt: new Date(Date.now() - row.daysAgo * 24 * 60 * 60 * 1000),
      });
      written += 1;
    }
  }

  return written;
}

async function ensureDevMember(
  db: Db,
  auth: AdminAuth,
  workspaceId: string,
): Promise<string | null> {
  if (process.env.NODE_ENV === "production") return null;

  const email = process.env.DEV_SEED_EMAIL?.trim();
  if (!email) return null;

  try {
    const { data } = await auth.auth.admin.listUsers();
    const user = data?.users.find(
      (candidate) => candidate.email?.toLowerCase() === email.toLowerCase(),
    );
    // No such account is a normal outcome — the address may simply not have
    // signed in yet — so it is silence rather than an error.
    if (!user) return null;

    await db
      .insert(membership)
      .values({ workspaceId, userId: user.id, role: "owner", allProducts: true })
      // Second run, same person: the unique on (workspace_id, user_id) makes
      // this a no-op rather than a failure.
      .onConflictDoNothing();

    return email;
  } catch {
    return null;
  }
}

/**
 * Inserts `AT_RISK_ITEM` into a workspace unless it is already there, and
 * reports whether it did anything.
 *
 * Idempotent on the item's title within the workspace rather than on a
 * generated id, because the id is new on every run and the title is what makes
 * this item the one it is. Runs on a fresh seed and on an existing one, so an
 * environment seeded before this item existed still ends up with it.
 *
 * No artifacts and no owner: the item stays in Discover, which is what makes its
 * blocking gap read as At risk rather than Your move, and an open gap carries no
 * resolver stamp.
 */
async function ensureAtRiskItem(db: Db, workspaceId: string): Promise<boolean> {
  const present = await db
    .select({ id: item.id })
    .from(item)
    .where(and(eq(item.workspaceId, workspaceId), eq(item.title, AT_RISK_ITEM.title)))
    .limit(1);

  if (present.length > 0) return false;

  // By slug, not by "the first row". Both products are inserted in one
  // statement, so they share a `created_at` to the microsecond and ordering by
  // it is a tie Postgres breaks however it likes — which would put this item
  // under a different product, and under a different key, in two environments
  // seeded from the same script.
  const [product_] = await db
    .select({ id: product.id })
    .from(product)
    .where(and(eq(product.workspaceId, workspaceId), eq(product.slug, PRIMARY_PRODUCT_SLUG)))
    .limit(1);

  if (!product_) return false;

  const itemId = randomUUID();
  await db.insert(item).values({
    id: itemId,
    workspaceId,
    productId: product_.id,
    // §2: unlinked from any opportunity, which is advisory and never a block.
    opportunityId: null,
    type: AT_RISK_ITEM.type,
    // Assigned by `app.assign_item_key()`; overwritten whatever is passed.
    key: "",
    title: AT_RISK_ITEM.title,
    flowIntent: AT_RISK_ITEM.flowIntent,
  });

  const raisedAt = new Date(Date.now() - AT_RISK_ITEM.gapAgeDays * 24 * 60 * 60 * 1000);
  await db.insert(gap).values({
    workspaceId,
    itemId,
    checkId: AT_RISK_ITEM.checkId,
    tag: "must",
    disposition: "open",
    evidence: AT_RISK_ITEM.evidence,
    // Backdated deliberately: the age is the whole point of this row, and
    // `created_at` defaults to now, which would put it in Flowing.
    createdAt: raisedAt,
    updatedAt: raisedAt,
  });

  return true;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey || !process.env.DATABASE_URL) {
    console.error(
      "seed: needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL.\n" +
        "Copy .env.example to .env.local and fill it in.",
    );
    process.exit(1);
  }

  const { db, sql } = createDbClient();
  const auth = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const existing = await db
      .select({ id: workspace.id })
      .from(workspace)
      .where(eq(workspace.name, WORKSPACE_NAME))
      .limit(1);

    if (existing.length > 0) {
      const id = existing[0]!.id;
      // Top up rather than stop dead. The at-risk item arrived after the first
      // seeds ran, and a workspace that already exists would otherwise never get
      // it — which would leave every established environment demonstrating two
      // buckets out of three. It inserts itself once and is a no-op after that.
      const added = await ensureAtRiskItem(db, id);
      // The ledger rows are the seeded Owner's, which is who this workspace's
      // history belongs to — the dev member joins as a reader, not as an author.
      const [owner] = await db
        .select({ userId: membership.userId })
        .from(membership)
        .where(and(eq(membership.workspaceId, id), eq(membership.role, "owner")))
        .limit(1);
      const ledgerRows = owner ? await ensureItemActivity(db, id, owner.userId) : 0;
      const joined = await ensureDevMember(db, auth, id);
      console.log(
        `seed: "${WORKSPACE_NAME}" already exists (${id}). ` +
          (added ? `Added "${AT_RISK_ITEM.title}".` : "Nothing to do."),
      );
      if (ledgerRows > 0) console.log(`seed: wrote ${ledgerRows} item activity rows.`);
      if (joined) console.log(`seed: ${joined} is an Owner of "${WORKSPACE_NAME}".`);
      return;
    }

    // An owner the memberships and activity rows can actually point at.
    const { data: users } = await auth.auth.admin.listUsers();
    const found = users?.users.find((u) => u.email === OWNER_EMAIL);
    const ownerId =
      found?.id ??
      (
        await auth.auth.admin.createUser({
          email: OWNER_EMAIL,
          email_confirm: true,
        })
      ).data.user?.id;

    if (!ownerId) throw new Error("seed: could not create or find the seed owner");

    const workspaceId = randomUUID();
    const productId = randomUUID();
    const secondProductId = randomUUID();
    const opportunityId = randomUUID();

    await db.insert(workspace).values({ id: workspaceId, name: WORKSPACE_NAME });
    await db.insert(membership).values({
      workspaceId,
      userId: ownerId,
      role: "owner",
      allProducts: true,
    });

    await db.insert(product).values([
      {
        id: productId,
        workspaceId,
        name: "Sociera",
        slug: PRIMARY_PRODUCT_SLUG,
        // The `soc` in `soc-12`. Explicit rather than derived from the slug —
        // see the column's own note in the schema.
        keyPrefix: "soc",
        deciderUserId: ownerId,
      },
      {
        id: secondProductId,
        workspaceId,
        name: "Aurenza",
        slug: "aurenza",
        keyPrefix: "aur",
        deciderUserId: ownerId,
      },
    ]);

    const secondOpportunityId = randomUUID();
    await db.insert(opportunity).values([
      {
        id: opportunityId,
        workspaceId,
        productId,
        title: "New users don't return after week 1",
        summary: "Retention drops sharply between day 3 and day 7.",
      },
      {
        id: randomUUID(),
        workspaceId,
        productId,
        title: "People miss what changed while they were away",
        summary: "No digest, so a week off means scrolling to catch up.",
      },
      {
        id: secondOpportunityId,
        workspaceId,
        productId: secondProductId,
        title: "Readers have no way to share a shelf",
        summary: "Lists are private, and the workaround is screenshots.",
      },
    ]);

    /**
     * Writes one item with its artifacts and versions.
     *
     * Versions go in one at a time on purpose: `app.assign_version_no()` derives
     * `version_no` from the current maximum per artifact, so a batch insert
     * would hand every row the same number and trip the unique index. The
     * database owning version numbers is the point — this is what it costs.
     */
    async function seedItem(
      targetProductId: string,
      targetOpportunityId: string | null,
      entry: {
        type: (typeof ITEMS)[number]["type"];
        title: string;
        flowIntent: (typeof ITEMS)[number]["flowIntent"];
        artifacts: readonly {
          kind: (typeof ITEMS)[number]["artifacts"][number]["kind"];
          versions: number;
        }[];
      },
    ) {
      const itemId = randomUUID();
      await db.insert(item).values({
        id: itemId,
        workspaceId,
        productId: targetProductId,
        opportunityId: targetOpportunityId,
        type: entry.type,
        // Assigned by `app.assign_item_key()`; Drizzle needs the column
        // present. Whatever is passed here is overwritten unconditionally —
        // that is the rule, and src/db/item-key.db.test.ts is where it is held.
        key: "",
        title: entry.title,
        flowIntent: entry.flowIntent,
      });

      for (const spec of entry.artifacts) {
        const artifactId = randomUUID();
        await db.insert(artifact).values({ id: artifactId, workspaceId, itemId, kind: spec.kind });

        for (let n = 1; n <= spec.versions; n += 1) {
          await db.insert(artifactVersion).values({
            workspaceId,
            artifactId,
            // Assigned by trigger; Drizzle needs the column present.
            versionNo: n,
            content: { body: `${entry.title} — ${spec.kind} draft ${n}` },
            contentHash: `${artifactId}-${n}`,
            authoredByKind: "human",
            authoredByUserId: ownerId,
          });
        }
      }

      return itemId;
    }

    const itemIds: string[] = [];
    for (const [index, entry] of ITEMS.entries()) {
      itemIds.push(
        await seedItem(
          productId,
          // §2: an item may be unlinked from any opportunity. One of them is.
          index === ITEMS.length - 1 ? null : opportunityId,
          entry,
        ),
      );
    }

    for (const entry of SECOND_PRODUCT_ITEMS) {
      await seedItem(secondProductId, secondOpportunityId, entry);
    }

    // §5: the first item carries one gap in each disposition, so an item page
    // has the whole negotiation history to render rather than just open ones.
    const gapItemId = itemIds[0]!;
    for (const spec of GAPS) {
      const resolved = spec.disposition !== "open";
      await db.insert(gap).values({
        workspaceId,
        itemId: gapItemId,
        checkId: spec.checkId,
        tag: spec.tag,
        disposition: spec.disposition,
        evidence: spec.evidence,
        // The CHECK requires all three parts of the stamp together, or none.
        resolvedByUserId: resolved ? ownerId : null,
        resolvedAt: resolved ? new Date() : null,
        resolutionNote: resolved ? (spec as { resolutionNote?: string }).resolutionNote! : null,
      });
    }

    // §13: "decision, reason, date, who" — one on an item, one on a product.
    await db.insert(decision).values([
      {
        workspaceId,
        productId,
        itemId: gapItemId,
        statement: "Dropping video from the digest for V1",
        reason: "Encoding capacity is committed elsewhere until Q3.",
        decidedByUserId: ownerId,
      },
      {
        workspaceId,
        productId,
        itemId: null,
        statement: "Sprints start Mondays, two weeks",
        reason: "Matches the development team's existing cadence (§3 ready buffer).",
        decidedByUserId: ownerId,
      },
    ]);

    await ensureAtRiskItem(db, workspaceId);
    await ensureItemActivity(db, workspaceId, ownerId);
    const joined = await ensureDevMember(db, auth, workspaceId);

    // §2: every mutating action writes an activity row. The seed writes human
    // rows as the seeded Owner rather than inventing a third actor kind.
    await db.insert(activity).values({
      workspaceId,
      productId,
      actorKind: "human",
      actorUserId: ownerId,
      action: "workspace.seeded",
      triggerSource: "user",
      subjectTable: "workspace",
      subjectId: workspaceId,
      metadata: { items: ITEMS.length + SECOND_PRODUCT_ITEMS.length, products: 2 },
    });

    console.log(
      `seed: created "${WORKSPACE_NAME}" (${workspaceId}) — 2 products, 3 opportunities, ` +
        `${ITEMS.length + SECOND_PRODUCT_ITEMS.length} items, ${GAPS.length} gaps, 2 decisions.`,
    );
    if (joined) console.log(`seed: ${joined} is an Owner of "${WORKSPACE_NAME}".`);
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error("seed failed:", error);
  process.exit(1);
});
