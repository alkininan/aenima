/**
 * Seed data for later tickets to build against: one workspace, one product, one
 * opportunity, and a handful of items across several of the seven types.
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
import { activity, item, membership, opportunity, product, workspace } from "../src/db/schema";

const WORKSPACE_NAME = "Seed workspace";
const OWNER_EMAIL = "seed-owner@aenima.test";

/** product-spec.md §4 — a spread across types, not seven of the same thing. */
const ITEMS = [
  { type: "feature", title: "Weekly digest email" },
  { type: "enhancement", title: "Faster item search" },
  { type: "technical", title: "Move scoring to a queue" },
  { type: "content", title: "Rewrite the empty states" },
  { type: "experiment", title: "Inline confirm vs modal" },
  { type: "fix", title: "Timestamps render in UTC on the item page" },
  { type: "spike", title: "Can we diff Figma frames by node id?" },
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
    const opportunityId = randomUUID();

    await db.insert(workspace).values({ id: workspaceId, name: WORKSPACE_NAME });
    await db.insert(membership).values({
      workspaceId,
      userId: ownerId,
      role: "owner",
      allProducts: true,
    });
    await db.insert(product).values({
      id: productId,
      workspaceId,
      name: "Sociera",
      slug: "sociera",
      deciderUserId: ownerId,
    });
    await db.insert(opportunity).values({
      id: opportunityId,
      workspaceId,
      productId,
      title: "New users don't return after week 1",
      summary: "Retention drops sharply between day 3 and day 7.",
    });

    for (const [index, entry] of ITEMS.entries()) {
      await db.insert(item).values({
        workspaceId,
        productId,
        // §2: an item may be unlinked from any opportunity. One of them is.
        opportunityId: index === ITEMS.length - 1 ? null : opportunityId,
        type: entry.type,
        title: entry.title,
      });
    }

    // §2: every mutating action writes an activity row. Q5 on the ticket: the
    // seed writes human rows as the seeded Owner rather than inventing a
    // third actor kind the spec does not have.
    await db.insert(activity).values({
      workspaceId,
      productId,
      actorKind: "human",
      actorUserId: ownerId,
      action: "workspace.seeded",
      triggerSource: "user",
      subjectTable: "workspace",
      subjectId: workspaceId,
      metadata: { items: ITEMS.length },
    });

    console.log(
      `seed: created "${WORKSPACE_NAME}" (${workspaceId}) — 1 product, 1 opportunity, ${ITEMS.length} items.`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error("seed failed:", error);
  process.exit(1);
});
