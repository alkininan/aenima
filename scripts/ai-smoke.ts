/**
 * One real call to each provider, through the seam rather than around it.
 *
 * The point is the things a unit test cannot check: that the model IDs exist,
 * that `output_config` and `text.format` are spelled the way the current docs
 * say, that the cache fields are accepted, and that a real answer validates
 * against a real zod schema. Every one of those fails at run time rather than
 * at build time, which is why this script exists at all.
 *
 * Two passes per provider:
 *
 *   1. **The adapter**, against a key from the environment. Proves the request
 *      shape and the model name.
 *   2. **The whole seam**, for whichever provider the seed workspace has a key
 *      for — credential read out of Vault, call, meter row written. Proves the
 *      parts a key in an env var cannot reach.
 *
 * A provider with no key is reported as untested. That is a result, not a
 * failure: §12 has one provider active at a time, and this project has been
 * certifying Claude first.
 *
 *   pnpm ai:smoke
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { closeSharedDbClient, createDbClient } from "../src/db/client";
import { membership, workspace } from "../src/db/schema";
import { readApiKey } from "../src/db/queries/ai-credential";
import { createAnthropicProvider } from "../src/lib/ai/anthropic";
import { callAtTier } from "../src/lib/ai/call";
import { createOpenAiProvider } from "../src/lib/ai/openai";
import { runRoutine } from "../src/lib/ai";
import { spendOf, currentCard } from "../src/lib/ai/pricing";
import type { Provider, ProviderId } from "../src/lib/ai/types";

const WORKSPACE_NAME = "Seed workspace";

/**
 * The smallest question with exactly one right answer.
 *
 * `.nullable()` rather than `.optional()` on purpose, even though nothing here
 * needs an absent value: OpenAI's strict mode requires every property in
 * `required`, and this script is the one place that would catch it if that
 * stopped being true.
 */
const Answer = z.object({
  ok: z.literal(true),
  language: z.string(),
  note: z.string().nullable(),
});

const REQUEST = {
  purpose: "classify" as const,
  // Deliberately far under any cache minimum — this is a liveness check, not a
  // caching benchmark. Haiku's floor is 4,096 tokens; see docs/build-log.md.
  context:
    "You are a connectivity check for a spec-validation product. " +
    "Answer strictly in the requested JSON shape and nothing else.",
  input: 'Reply with ok=true, language="en", and note=null.',
  schema: Answer,
  maxTokens: 256,
};

const KEYS: Array<{ id: ProviderId; env: string; make: (key: string) => Provider }> = [
  { id: "anthropic", env: "DEV_ANTHROPIC_API_KEY", make: createAnthropicProvider },
  { id: "openai", env: "DEV_OPENAI_API_KEY", make: createOpenAiProvider },
];

async function smokeAdapter(id: ProviderId, provider: Provider): Promise<boolean> {
  const startedAt = Date.now();
  const result = await callAtTier(provider, "routine", REQUEST);
  const ms = Date.now() - startedAt;

  if (!result.ok) {
    console.error(`  ${id}: FAILED — ${result.failure.kind}: ${result.failure.detail}`);
    return false;
  }

  const cost = spendOf(currentCard(id), result.model, result.usage);
  console.log(
    `  ${id}: ok — ${result.model}, ${ms} ms, ` +
      `${result.usage.uncachedInputTokens} in / ${result.usage.outputTokens} out` +
      (cost === null ? ", unpriced" : `, $${(cost / 1_000_000).toFixed(6)}`),
  );
  console.log(`     answered: ${JSON.stringify(result.value)}`);
  return true;
}

/** The full seam: Vault → adapter → meter row. */
async function smokeSeam(): Promise<boolean | null> {
  const { db, sql } = createDbClient();

  try {
    const [ws] = await db
      .select({ id: workspace.id })
      .from(workspace)
      .where(eq(workspace.name, WORKSPACE_NAME))
      .limit(1);

    if (!ws) {
      console.log("  seam: untested — no seed workspace. Run pnpm db:seed.");
      return null;
    }

    // The same read the seam does. Only the provider is looked at here; the
    // key goes nowhere but into the adapter, and nothing prints it.
    const credential = await readApiKey(ws.id);
    if (!credential) {
      console.log("  seam: untested — the seed workspace has no AI key.");
      return null;
    }

    const [owner] = await db
      .select({ userId: membership.userId })
      .from(membership)
      .where(and(eq(membership.workspaceId, ws.id), eq(membership.role, "owner")))
      .limit(1);

    if (!owner) {
      console.log("  seam: untested — the seed workspace has no Owner.");
      return null;
    }

    const before = await sql<Array<{ n: number }>>`
      select count(*)::int as n from ai_usage where workspace_id = ${ws.id}`;

    const result = await runRoutine(
      { workspaceId: ws.id, productId: null, actor: { kind: "human", userId: owner.userId } },
      REQUEST,
    );

    const after = await sql<Array<{ n: number }>>`
      select count(*)::int as n from ai_usage where workspace_id = ${ws.id}`;

    const wrote = (after[0]?.n ?? 0) - (before[0]?.n ?? 0);

    if (!result.ok) {
      console.error(`  seam: FAILED — ${result.failure.kind}: ${result.failure.detail}`);
      return false;
    }

    console.log(
      `  seam: ok — ${credential.provider} key read from Vault, ` +
        `${result.model} answered, ${wrote} meter row written.`,
    );
    return wrote === 1;
  } finally {
    await sql.end();
  }
}

async function main() {
  console.log("ai smoke — one real call per provider\n");

  let failed = false;

  for (const { id, env, make } of KEYS) {
    const key = process.env[env]?.trim();
    if (!key) {
      console.log(`  ${id}: untested — ${env} is not set.`);
      continue;
    }
    if (!(await smokeAdapter(id, make(key)))) failed = true;
  }

  console.log("");
  if ((await smokeSeam()) === false) failed = true;

  // The AI layer's connection outlives a request by design; a script has to
  // say when it is done or hang on an open handle.
  await closeSharedDbClient();

  console.log("");
  process.exit(failed ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error("ai smoke failed:", error);
  process.exit(1);
});
