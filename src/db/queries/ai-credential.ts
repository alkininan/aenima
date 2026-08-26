import "server-only";

import { sharedDbClient } from "@/db/client";
import { createClient } from "@/lib/supabase/server";
import type { ProviderId } from "@/lib/ai/types";
import { initialScorerModel } from "@/lib/ai/router";

/**
 * The workspace's AI credential — product-spec.md §12, §14 and §5's pin.
 *
 * Two paths, and the split is the security boundary:
 *
 * - **The request path** (`getWorkspaceCredential`) goes through the user's
 *   Supabase client and is therefore subject to RLS as that user. §14 gives
 *   only the Owner a policy, so for anyone else the row does not exist. The
 *   type it returns has no field for the key, and `vault_secret_id` is not
 *   granted to `authenticated` at all, so "never returned to the client" is
 *   structural rather than a habit.
 *
 * - **The provider path** (`readApiKey`) goes over the direct connection and
 *   joins `vault.decrypted_secrets`, which is granted to `postgres` and
 *   `service_role` only. It exists to hand a key to an adapter and to nothing
 *   else. It is never called from a Server Component, never from a route
 *   handler that renders, and — because every module in `src/lib/ai` is
 *   `server-only` — never from a browser.
 *
 * The key itself is never logged, never placed in an error message, and never
 * returned to any caller but the adapter that is about to use it.
 */

/** Everything about a credential except the one thing that matters. */
export type CredentialSummary = {
  provider: ProviderId;
  /** Last four characters. The only part of a key anyone is ever shown. */
  keyHint: string;
  /** §5's pin: the model this workspace's scorer uses, and keeps using. */
  scorerModel: string;
  setByUserId: string | null;
  setAt: string;
};

/**
 * The credential's metadata, or null.
 *
 * Null covers two situations that are the same from here: no key has been set,
 * or the caller is not an Owner and RLS is showing them an empty table. Neither
 * is an error, and distinguishing them would leak the fact that a key exists to
 * someone §14 says cannot see it.
 */
export async function getWorkspaceCredential(
  workspaceId: string,
): Promise<CredentialSummary | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("workspace_ai_credential")
    // Not `select("*")`: the column grant would reject it, and naming the
    // columns says out loud which ones are safe to read.
    .select("provider, key_hint, scorer_model, created_by_user_id, created_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) throw new Error(`Could not read AI credential: ${error.message}`);
  if (!data) return null;

  return {
    provider: data.provider,
    keyHint: data.key_hint,
    scorerModel: data.scorer_model,
    setByUserId: data.created_by_user_id,
    setAt: data.created_at,
  };
}

/** The last four characters, which is all §12's settings screen ever shows. */
export function hintOf(apiKey: string): string {
  return apiKey.slice(-4);
}

/**
 * Set or rotate a workspace's key.
 *
 * The secret goes to Vault and the public row gets a pointer. Rotation reuses
 * the same Vault secret via `vault.update_secret`, so a rotated key leaves no
 * copy of the old one behind.
 *
 * The scorer is pinned here, at the moment the key is set — §12 puts scoring on
 * the analysis tier, so that is where the pin starts — and re-pinned only when
 * the provider changes, which §5 says triggers a re-baseline pass. Rotating a
 * key within one provider leaves the pin exactly where it was, because the
 * model has not changed and neither should any score.
 *
 * Over the direct connection because it writes to `vault`, which no
 * `authenticated` role can reach. The caller is responsible for having
 * established that the actor is an Owner; the RLS policy backs that up for
 * every path that is not this one.
 */
export async function setWorkspaceCredential(input: {
  workspaceId: string;
  provider: ProviderId;
  apiKey: string;
  setByUserId: string | null;
}): Promise<CredentialSummary> {
  const { sql } = sharedDbClient();

  const existing = await sql<
    Array<{ vault_secret_id: string; provider: ProviderId; scorer_model: string }>
  >`
    select vault_secret_id, provider, scorer_model
      from workspace_ai_credential
     where workspace_id = ${input.workspaceId}
  `;
  const previous = existing.at(0);

  const secretName = `ai_key:${input.workspaceId}`;

  /**
   * The two statements that bind the plaintext key, wrapped so its error cannot
   * carry it.
   *
   * `postgres@3` defines `query`, `parameters` and `args` on every rejected
   * query's error (`src/connection.js`). They are non-enumerable while `debug`
   * is off, so `console.error` and `JSON.stringify` do not print them — but
   * `err.parameters[0]` is the key, and error reporters that walk
   * `Object.getOwnPropertyNames` capture non-enumerable own properties. The
   * ticket's rule is that a key is never logged, and "not usually printed" is a
   * weaker promise than that.
   *
   * Only the message survives, and only after the key is stripped from it in
   * case a driver ever interpolates one.
   */
  const scrubbed = async <T>(what: string, run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${what} failed: ${message.replaceAll(input.apiKey, "[redacted]")}`);
    }
  };

  let secretId: string;

  if (previous) {
    await scrubbed(
      "vault.update_secret",
      () =>
        sql`select vault.update_secret(${previous.vault_secret_id}::uuid, ${input.apiKey}, ${secretName}, null)`,
    );
    secretId = previous.vault_secret_id;
  } else {
    const created = await scrubbed(
      "vault.create_secret",
      () => sql<Array<{ id: string }>>`
        select vault.create_secret(${input.apiKey}, ${secretName}, ${"aenima workspace AI key"}) as id
      `,
    );
    const id = created.at(0)?.id;
    if (!id) throw new Error("vault.create_secret returned no id");
    secretId = id;
  }

  // The pin moves only when the provider does.
  const scorerModel =
    previous && previous.provider === input.provider
      ? previous.scorer_model
      : initialScorerModel(input.provider);

  const hint = hintOf(input.apiKey);

  await sql`
    insert into workspace_ai_credential
      (workspace_id, provider, vault_secret_id, key_hint, scorer_model, created_by_user_id)
    values
      (${input.workspaceId}, ${input.provider}::ai_provider, ${secretId}::uuid, ${hint},
       ${scorerModel}, ${input.setByUserId})
    on conflict (workspace_id) do update set
      provider = excluded.provider,
      vault_secret_id = excluded.vault_secret_id,
      key_hint = excluded.key_hint,
      scorer_model = excluded.scorer_model
  `;

  return {
    provider: input.provider,
    keyHint: hint,
    scorerModel,
    setByUserId: input.setByUserId,
    setAt: new Date().toISOString(),
  };
}

/** What an adapter needs, and the only shape that ever carries a key. */
export type ProviderCredential = {
  provider: ProviderId;
  apiKey: string;
  scorerModel: string;
};

/**
 * The key, decrypted, for one call.
 *
 * Null when the workspace has no credential — which the seam turns into a
 * `no-credential` failure rather than an exception, because a workspace that
 * has not set a key yet is a normal state and not a crash.
 *
 * Never cached, never memoized, never returned anywhere but into an adapter.
 */
export async function readApiKey(workspaceId: string): Promise<ProviderCredential | null> {
  const { sql } = sharedDbClient();

  const rows = await sql<Array<{ provider: ProviderId; scorer_model: string; secret: string }>>`
    select c.provider, c.scorer_model, s.decrypted_secret as secret
      from workspace_ai_credential c
      join vault.decrypted_secrets s on s.id = c.vault_secret_id
     where c.workspace_id = ${workspaceId}
  `;

  const row = rows.at(0);
  if (!row) return null;

  return { provider: row.provider, apiKey: row.secret, scorerModel: row.scorer_model };
}
