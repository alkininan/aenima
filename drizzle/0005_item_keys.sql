-- ============================================================================
-- T1.2 — item keys: the name people say out loud.
--
-- Hand-written like 0001 through 0004, and for the same reason: the trigger at
-- the bottom is not something the schema DSL can express, and `drizzle-kit
-- push` is prohibited on this project.
--
-- `soc-12` is a product key prefix plus a per-product counter. Two columns and
-- one trigger:
--
--   product.key_prefix  the `soc`. Its own column rather than the first letters
--                       of `slug`, because `sociera` and `social` both give
--                       `soc` while item keys are unique per workspace — a
--                       derived prefix would make the second product's first
--                       item fail to insert, at runtime, with a constraint
--                       error. It is also stable across a rename, which a key
--                       someone has pasted into a ticket needs to be.
--
--   item.key            the whole thing. Assigned by the database on insert and
--                       never by the client, exactly as `version_no` is (0001,
--                       `app.assign_version_no`). The unique constraint is the
--                       backstop against the concurrent-insert race a MAX+1
--                       counter leaves open — the same known race, mitigated the
--                       same way, deliberately not better than the precedent.
--
-- Both columns are NOT NULL, so both are added nullable, backfilled, and only
-- then constrained. A NOT NULL column added to a populated table cannot be
-- added and filled in one statement.
-- ============================================================================

ALTER TABLE product ADD COLUMN key_prefix text;--> statement-breakpoint
ALTER TABLE item    ADD COLUMN key        text;--> statement-breakpoint

-- Backfill the prefixes: the first three alphanumerics of the slug, with a
-- numeric suffix where two products would collide. `row_number()` over the
-- collision group is deterministic given the `created_at` order, so re-running
-- this migration on a copy of the data produces the same prefixes.
WITH derived AS (
  SELECT
    id,
    workspace_id,
    substring(regexp_replace(lower(slug), '[^a-z0-9]', '', 'g') FROM 1 FOR 3) AS base,
    row_number() OVER (
      PARTITION BY workspace_id,
                   substring(regexp_replace(lower(slug), '[^a-z0-9]', '', 'g') FROM 1 FOR 3)
      ORDER BY created_at, id
    ) AS collision
  FROM product
)
UPDATE product AS p
   SET key_prefix = CASE WHEN d.collision = 1 THEN d.base
                         ELSE d.base || d.collision::text
                    END
  FROM derived AS d
 WHERE p.id = d.id;--> statement-breakpoint

-- Backfill the keys in creation order per product, so the seed's items come out
-- numbered 1..n with no gaps and in the order they were made.
WITH numbered AS (
  SELECT
    i.id,
    p.key_prefix || '-' || row_number() OVER (
      PARTITION BY i.product_id ORDER BY i.created_at, i.id
    )::text AS key
  FROM item AS i
  JOIN product AS p ON p.id = i.product_id
)
UPDATE item AS i
   SET key = n.key
  FROM numbered AS n
 WHERE i.id = n.id;--> statement-breakpoint

ALTER TABLE product ALTER COLUMN key_prefix SET NOT NULL;--> statement-breakpoint
ALTER TABLE item    ALTER COLUMN key        SET NOT NULL;--> statement-breakpoint

ALTER TABLE product ADD CONSTRAINT product_workspace_key_prefix UNIQUE (workspace_id, key_prefix);--> statement-breakpoint
-- The backstop. A per-product counter read as MAX+1 can hand the same number to
-- two concurrent inserts; this is what turns that into a failed insert rather
-- than two items sharing a name.
ALTER TABLE item ADD CONSTRAINT item_workspace_key UNIQUE (workspace_id, key);--> statement-breakpoint

ALTER TABLE product ADD CONSTRAINT product_key_prefix_shape
  CHECK (key_prefix ~ '^[a-z][a-z0-9]{1,7}$');--> statement-breakpoint
ALTER TABLE item ADD CONSTRAINT item_key_shape
  CHECK (key ~ '^[a-z][a-z0-9]{1,7}-[0-9]+$');--> statement-breakpoint

-- Keys come from the database, never the client — the discipline of
-- `app.assign_version_no` in 0001, for the same reason: a client that can choose
-- its own identifier can collide with one, and a key is a name rather than a
-- preference. NEW.key is overwritten unconditionally rather than defaulted,
-- so an insert that supplies one is ignored rather than honoured.
CREATE OR REPLACE FUNCTION app.assign_item_key()
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
    FROM item
   WHERE product_id = NEW.product_id;

  NEW.key = prefix || '-' || next_no::text;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER item_key
  BEFORE INSERT ON item
  FOR EACH ROW EXECUTE FUNCTION app.assign_item_key();
