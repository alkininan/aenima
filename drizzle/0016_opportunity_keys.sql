-- ============================================================================
-- T1.4 — opportunity keys: `/o/<key>` is a URL a person can say.
--
-- Hand-written like 0001 through 0014, and for the same reason: the trigger at
-- the bottom is not something the schema DSL can express, and `drizzle-kit
-- push` is prohibited on this project.
--
-- This is 0005 again, one table over. `opportunity` carried `id`,
-- `workspace_id`, `product_id`, `title` and `summary` — nothing to put in a URL
-- a person can read out — so `src/lib/routes.ts` reserved `/o` and could not
-- build it, and the item header rendered its opportunity as plain text (build
-- log, open question 9). One column and one trigger close that.
--
--   opportunity.key   the product's `key_prefix` plus a per-opportunity
--                     counter within that product. Assigned by the database on
--                     insert and never by the client, exactly as `item.key` and
--                     `artifact_version.version_no` are: a client that can
--                     choose its own identifier can collide with one, and a key
--                     is a name rather than a preference.
--
-- **Opportunity keys and item keys share a shape and a counter space they do
-- not share.** `soc-3` can name an item and an opportunity in the same product,
-- because the two counters are independent and the two unique constraints are
-- on different tables. The route tells them apart — `/i/soc-3` and `/o/soc-3` —
-- and the spoken name does not. That is what "mirroring `item.key`" asks for,
-- and it is the one property of this design worth a second look before there is
-- anything in the wild to migrate.
--
-- The column is NOT NULL, so it is added nullable, backfilled, and only then
-- constrained: a NOT NULL column added to a populated table cannot be added and
-- filled in one statement.
-- ============================================================================

ALTER TABLE opportunity ADD COLUMN key text;--> statement-breakpoint

-- Backfill in creation order per product, so the seed's opportunities come out
-- numbered 1..n with no gaps and in the order they were made. `row_number()`
-- over `(created_at, id)` is deterministic, so re-running this on a copy of the
-- data produces the same keys.
WITH numbered AS (
  SELECT
    o.id,
    p.key_prefix || '-' || row_number() OVER (
      PARTITION BY o.product_id ORDER BY o.created_at, o.id
    )::text AS key
  FROM opportunity AS o
  JOIN product AS p ON p.id = o.product_id
)
UPDATE opportunity AS o
   SET key = n.key
  FROM numbered AS n
 WHERE o.id = n.id;--> statement-breakpoint

ALTER TABLE opportunity ALTER COLUMN key SET NOT NULL;--> statement-breakpoint

-- The backstop. A per-product counter read as MAX+1 can hand the same number to
-- two concurrent inserts; this is what turns that into a failed insert rather
-- than two opportunities sharing a name. The same known race as 0005's, and
-- deliberately mitigated no better than the precedent.
ALTER TABLE opportunity ADD CONSTRAINT opportunity_workspace_key UNIQUE (workspace_id, key);--> statement-breakpoint

ALTER TABLE opportunity ADD CONSTRAINT opportunity_key_shape
  CHECK (key ~ '^[a-z][a-z0-9]{1,7}-[0-9]+$');--> statement-breakpoint

-- NEW.key is overwritten unconditionally rather than defaulted, so an insert
-- that supplies one is ignored rather than honoured — 0005's rule, and
-- `src/db/opportunity-key.db.test.ts` is where it is held.
CREATE OR REPLACE FUNCTION app.assign_opportunity_key()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  prefix text;
  next_no integer;
BEGIN
  SELECT key_prefix INTO prefix FROM product WHERE id = NEW.product_id;

  -- Count within the product, from the numeric half of the existing keys. The
  -- prefix is not parsed back out: it is read from the product above, so a
  -- product whose prefix changed would still number correctly.
  SELECT COALESCE(MAX(split_part(key, '-', 2)::integer), 0) + 1
    INTO next_no
    FROM opportunity
   WHERE product_id = NEW.product_id;

  NEW.key = prefix || '-' || next_no::text;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER opportunity_key
  BEFORE INSERT ON opportunity
  FOR EACH ROW EXECUTE FUNCTION app.assign_opportunity_key();
