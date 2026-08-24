import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * The AI credential is the most sensitive row in the schema, proved against a
 * real Postgres rather than asserted in TypeScript.
 *
 * Four walls, and each one is tested separately because each one is supposed to
 * hold on its own:
 *
 *   1. A member of another workspace sees nothing. (RLS, product isolation.)
 *   2. A non-Owner member of the *same* workspace sees nothing. (§14.)
 *   3. `vault_secret_id` is not readable by `authenticated` at all, Owner
 *      included. (Column grant.)
 *   4. `vault.decrypted_secrets` is not reachable by `authenticated` at all.
 *      (Supabase's own grants — the wall that holds even if 1–3 were wrong.)
 *
 * Plus the meter's append-only guarantee, which the service role cannot walk
 * past either.
 *
 * Users are impersonated the way PostgREST does it: `set local role
 * authenticated` plus a `request.jwt.claims` carrying the subject. Every test
 * runs inside a transaction that is rolled back.
 */

const DATABASE_URL = process.env.DATABASE_URL;
const OFFLINE = !DATABASE_URL;

if (OFFLINE) {
  process.stderr.write(
    [
      "",
      "[33m  ============================================================[0m",
      "[33m  SKIPPED: AI credential database tests did not run.[0m",
      "",
      "  DATABASE_URL is not set, so the AI key's isolation was NOT",
      "  verified by this run. This covers the most sensitive column",
      "  in the schema — a green suite is not proof that it holds.",
      "[33m  ============================================================[0m",
      "",
      "",
    ].join("\n"),
  );
}

const sql = OFFLINE ? null : postgres(DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

afterAll(async () => {
  await sql?.end();
});

const OWNER_A = "aaaaaaaa-2222-4000-8000-00000000000a";
const MEMBER_A = "cccccccc-2222-4000-8000-00000000000c";
const OWNER_B = "bbbbbbbb-2222-4000-8000-00000000000b";
const INSTANCE = "00000000-0000-0000-0000-000000000000";

type Tx = postgres.TransactionSql;

async function rolledBack<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!sql) throw new Error("no database");
  const sentinel = Symbol("rollback");
  let captured: T;

  try {
    await sql.begin(async (tx) => {
      captured = await fn(tx as Tx);
      throw sentinel;
    });
  } catch (error) {
    if (error !== sentinel) throw error;
  }

  return captured!;
}

async function rejectsWith(tx: Tx, statement: (sp: Tx) => Promise<unknown>, pattern: RegExp) {
  await expect(tx.savepoint((sp) => statement(sp as Tx))).rejects.toThrow(pattern);
}

async function actAs(tx: Tx, user: string) {
  await tx`select set_config('role', 'authenticated', true)`;
  await tx`select set_config('request.jwt.claims',
                             ${JSON.stringify({ sub: user, role: "authenticated" })}, true)`;
}

/**
 * Two workspaces with a credential each, plus a non-Owner member in A.
 *
 * The secret goes through Vault, exactly as `setWorkspaceCredential` does it —
 * a fake uuid in the column would test the policies while skipping the wall
 * that matters most.
 */
async function seedCredentials(tx: Tx) {
  for (const [id, email] of [
    [OWNER_A, "ai-owner-a@example.test"],
    [MEMBER_A, "ai-member-a@example.test"],
    [OWNER_B, "ai-owner-b@example.test"],
  ] as const) {
    await tx`
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                              email_confirmed_at, created_at, updated_at)
      values (${id}, ${INSTANCE}, 'authenticated', 'authenticated', ${email}, '',
              now(), now(), now())`;
  }

  const made: Record<string, { workspace: string; secret: string }> = {};

  for (const [key, owner, name, apiKey] of [
    ["a", OWNER_A, "AI Workspace A", "sk-ant-secret-aaaa"],
    ["b", OWNER_B, "AI Workspace B", "sk-ant-secret-bbbb"],
  ] as const) {
    const [ws] = await tx<{ id: string }[]>`
      insert into workspace (name) values (${name}) returning id`;
    const workspaceId = ws!.id;

    await tx`insert into membership (workspace_id, user_id, role, all_products)
             values (${workspaceId}, ${owner}, 'owner', true)`;

    const [secret] = await tx<{ id: string }[]>`
      select vault.create_secret(${apiKey}, ${`ai_key:${workspaceId}`}, 'test') as id`;

    await tx`
      insert into workspace_ai_credential
        (workspace_id, provider, vault_secret_id, key_hint, scorer_model, created_by_user_id)
      values (${workspaceId}, 'anthropic', ${secret!.id}, ${apiKey.slice(-4)},
              'claude-sonnet-5', ${owner})`;

    made[key] = { workspace: workspaceId, secret: secret!.id };
  }

  // §14's Product role: a real member of A, and not an Owner.
  await tx`insert into membership (workspace_id, user_id, role, all_products)
           values (${made.a!.workspace}, ${MEMBER_A}, 'product', true)`;

  return made;
}

describe.skipIf(OFFLINE)("the AI credential", () => {
  it("is invisible to a member of another workspace", async () => {
    await rolledBack(async (tx) => {
      await seedCredentials(tx);
      await actAs(tx, OWNER_B);

      const rows = await tx`
        select provider, key_hint from workspace_ai_credential`;
      // B is an Owner — of B. One row, and it is theirs.
      expect(rows).toHaveLength(1);
      expect(rows[0]!.key_hint).toBe("bbbb");
    });
  });

  // §14: "Product | Cannot: Workspace settings, AI keys." Not "can see but not
  // edit" — for a non-Owner the row does not exist.
  it("is invisible to a non-Owner member of the same workspace", async () => {
    await rolledBack(async (tx) => {
      await seedCredentials(tx);
      await actAs(tx, MEMBER_A);

      const rows = await tx`select workspace_id from workspace_ai_credential`;
      expect(rows).toHaveLength(0);
    });
  });

  it("lets the Owner read the metadata a settings screen shows", async () => {
    await rolledBack(async (tx) => {
      await seedCredentials(tx);
      await actAs(tx, OWNER_A);

      const rows = await tx<{ provider: string; key_hint: string; scorer_model: string }[]>`
        select provider, key_hint, scorer_model from workspace_ai_credential`;

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        provider: "anthropic",
        key_hint: "aaaa",
        scorer_model: "claude-sonnet-5",
      });
    });
  });

  // The third wall. Even the Owner — the person §12 says holds the key — cannot
  // read the pointer through the request path, because nothing in the request
  // path ever needs it.
  it("hides vault_secret_id from the Owner, not just from everyone else", async () => {
    await rolledBack(async (tx) => {
      await seedCredentials(tx);
      await actAs(tx, OWNER_A);

      await rejectsWith(
        tx,
        (sp) => sp`select vault_secret_id from workspace_ai_credential`,
        /permission denied/i,
      );
      // And the blunt version a careless query would use.
      await rejectsWith(
        tx,
        (sp) => sp`select * from workspace_ai_credential`,
        /permission denied/i,
      );
    });
  });

  /**
   * The fourth wall, and the one that holds even if every policy above were
   * wrong: `authenticated` has no privilege on the vault schema at all. This is
   * Supabase's own grant, not ours — which is exactly why the key lives there
   * rather than in a column we would have to protect ourselves.
   */
  it("keeps the key itself out of reach of any signed-in member", async () => {
    await rolledBack(async (tx) => {
      const made = await seedCredentials(tx);
      await actAs(tx, OWNER_A);

      await rejectsWith(
        tx,
        (sp) => sp`select decrypted_secret from vault.decrypted_secrets`,
        /permission denied/i,
      );
      await rejectsWith(
        tx,
        (sp) =>
          sp`select decrypted_secret from vault.decrypted_secrets where id = ${made.a!.secret}`,
        /permission denied/i,
      );
    });
  });

  // The path the provider layer actually uses, over the direct connection.
  it("decrypts for the server-side path that has to send it", async () => {
    await rolledBack(async (tx) => {
      const made = await seedCredentials(tx);

      const [row] = await tx<{ secret: string }[]>`
        select s.decrypted_secret as secret
          from workspace_ai_credential c
          join vault.decrypted_secrets s on s.id = c.vault_secret_id
         where c.workspace_id = ${made.a!.workspace}`;

      expect(row!.secret).toBe("sk-ant-secret-aaaa");
    });
  });

  it("refuses a second credential for the same workspace", async () => {
    await rolledBack(async (tx) => {
      const made = await seedCredentials(tx);
      await rejectsWith(
        tx,
        (sp) => sp`
          insert into workspace_ai_credential
            (workspace_id, provider, vault_secret_id, key_hint, scorer_model)
          values (${made.a!.workspace}, 'openai', ${made.a!.secret}, 'zzzz', 'gpt-5.6-terra')`,
        /duplicate key|unique/i,
      );
    });
  });
});

describe.skipIf(OFFLINE)("the usage meter is append-only", () => {
  async function seedUsage(tx: Tx) {
    const made = await seedCredentials(tx);
    const [row] = await tx<{ id: string }[]>`
      insert into ai_usage (workspace_id, actor_kind, actor_user_id, provider, model, tier,
                            purpose, uncached_input_tokens, cache_read_tokens,
                            cache_write_tokens, output_tokens, outcome, latency_ms, rate_card)
      values (${made.a!.workspace}, 'human', ${OWNER_A}, 'anthropic', 'claude-sonnet-5',
              'analysis', 'score', 100, 0, 0, 50, 'ok', 900, 'anthropic-2026-08')
      returning id`;
    return { ...made, usage: row!.id };
  }

  // The trigger is the layer the service role cannot walk past, and this
  // connection *is* the service role's — it bypasses RLS.
  it("refuses UPDATE and DELETE to everyone, service role included", async () => {
    await rolledBack(async (tx) => {
      const made = await seedUsage(tx);

      await rejectsWith(
        tx,
        (sp) => sp`update ai_usage set output_tokens = 0 where id = ${made.usage}`,
        /append-only/i,
      );
      await rejectsWith(
        tx,
        (sp) => sp`delete from ai_usage where id = ${made.usage}`,
        /append-only/i,
      );
    });
  });

  // §12's meter is the Owner's: per-member attribution means one member reading
  // it would be reading everyone else's spend.
  it("is readable by the Owner and by nobody else", async () => {
    await rolledBack(async (tx) => {
      await seedUsage(tx);

      await actAs(tx, MEMBER_A);
      expect(await tx`select id from ai_usage`).toHaveLength(0);
    });

    await rolledBack(async (tx) => {
      await seedUsage(tx);

      await actAs(tx, OWNER_A);
      expect(await tx`select id from ai_usage`).toHaveLength(1);
    });
  });

  // No INSERT policy at all: a client that could write its own meter row could
  // under-report itself, and §12 has the Owner paying for everyone's calls.
  it("cannot be written from the request path, even by the Owner", async () => {
    await rolledBack(async (tx) => {
      const made = await seedCredentials(tx);
      await actAs(tx, OWNER_A);

      await rejectsWith(
        tx,
        (sp) => sp`
          insert into ai_usage (workspace_id, actor_kind, actor_user_id, provider, model, tier,
                                purpose, uncached_input_tokens, cache_read_tokens,
                                cache_write_tokens, output_tokens, outcome, latency_ms, rate_card)
          values (${made.a!.workspace}, 'human', ${OWNER_A}, 'anthropic', 'claude-sonnet-5',
                  'analysis', 'score', 1, 0, 0, 1, 'ok', 1, 'anthropic-2026-08')`,
        /row-level security|permission denied/i,
      );
    });
  });

  // `activity`'s actor rule, held here too: an agent action is asserted rather
  // than inferred from a null user.
  it("refuses a row that claims to be both a human and an agent", async () => {
    await rolledBack(async (tx) => {
      const made = await seedCredentials(tx);

      await rejectsWith(
        tx,
        (sp) => sp`
          insert into ai_usage (workspace_id, actor_kind, actor_user_id, actor_agent, provider,
                                model, tier, purpose, uncached_input_tokens, cache_read_tokens,
                                cache_write_tokens, output_tokens, outcome, latency_ms, rate_card)
          values (${made.a!.workspace}, 'human', ${OWNER_A}, 'sweep', 'anthropic',
                  'claude-sonnet-5', 'analysis', 'score', 1, 0, 0, 1, 'ok', 1, 'anthropic-2026-08')`,
        /ai_usage_actor_shape/i,
      );
    });
  });
});
