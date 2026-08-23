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
import { eq } from "drizzle-orm";

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
      console.log(`seed: "${WORKSPACE_NAME}" already exists (${existing[0]?.id}). Nothing to do.`);
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
        slug: "sociera",
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
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error("seed failed:", error);
  process.exit(1);
});
