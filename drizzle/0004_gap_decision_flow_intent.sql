-- ============================================================================
-- T1.1 — the last two nodes of the §2 object tree, and the §4 flow-intent tag.
--
-- Hand-written like 0001, and for the same reason: the RLS policies at the
-- bottom are the security boundary and are SQL the schema DSL cannot express.
-- `drizzle-kit push` is prohibited on this project — it cannot see these
-- policies and plans to drop every one.
--
-- The FK shapes here are the lesson of 0003 applied forward. An append-only
-- table cannot carry `ON DELETE SET NULL` (nulling is an UPDATE the trigger
-- refuses) and cannot carry `ON DELETE CASCADE` (a cascade is a DELETE, refused
-- the same way). `RESTRICT` is the only shape that fails legibly, so `decision`
-- uses it throughout — and the two `activity` constraints that still carry the
-- broken shapes are corrected at the end.
-- ============================================================================

CREATE TYPE flow_intent AS ENUM ('value', 'quality', 'risk', 'debt');--> statement-breakpoint
CREATE TYPE gap_tag AS ENUM ('must', 'should');--> statement-breakpoint
CREATE TYPE gap_disposition AS ENUM ('open', 'accepted', 'excluded');--> statement-breakpoint

-- §4: assigned by the same classification call that proposes the item type.
-- Nullable until that classifier ships — an unclassified item is not a "value"
-- item, so there is no default to give it.
ALTER TABLE item ADD COLUMN flow_intent flow_intent;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- gap — §5. Mutable: the three negotiation moves *are* transitions on this row.
-- ---------------------------------------------------------------------------
CREATE TABLE gap (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspace (id) ON DELETE CASCADE,
  item_id             uuid NOT NULL,
  -- Free text until rubric packs arrive in Phase 2.
  check_id            text NOT NULL,
  tag                 gap_tag NOT NULL,
  disposition         gap_disposition NOT NULL DEFAULT 'open',
  -- §5: "a failure quotes the exact gap" — evidence, not a verdict.
  evidence            text NOT NULL,
  -- §5 stamps accepted and excluded gaps with the accepter. No FK to
  -- auth.users: this is a historical stamp, and deleting an account must not
  -- erase who accepted a risk. Deliberately unlike product.decider_user_id,
  -- where SET NULL is right because a decider is a current assignment.
  resolved_by_user_id uuid,
  resolved_at         timestamptz,
  resolution_note     text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gap_workspace_id UNIQUE (workspace_id, id),
  CONSTRAINT gap_item_fk FOREIGN KEY (workspace_id, item_id)
    REFERENCES item (workspace_id, id) ON DELETE CASCADE,

  CONSTRAINT gap_check_len    CHECK (length(btrim(check_id)) BETWEEN 1 AND 120),
  CONSTRAINT gap_evidence_len CHECK (length(btrim(evidence)) BETWEEN 1 AND 2000),

  -- An open gap carries no stamp; a resolved one carries all three parts of it.
  CONSTRAINT gap_resolution_shape CHECK (
    (disposition = 'open'
       AND resolved_by_user_id IS NULL AND resolved_at IS NULL AND resolution_note IS NULL)
    OR (disposition IN ('accepted', 'excluded')
       AND resolved_by_user_id IS NOT NULL AND resolved_at IS NOT NULL
       AND length(btrim(resolution_note)) > 0)
  )
);--> statement-breakpoint

CREATE INDEX gap_item_idx ON gap (workspace_id, item_id);--> statement-breakpoint
-- The list surface counts open gaps per item on every render (§13 at-risk
-- sorting reads blocking-gap age), so the open subset gets its own index.
CREATE INDEX gap_open_idx ON gap (workspace_id, item_id) WHERE disposition = 'open';--> statement-breakpoint

CREATE TRIGGER gap_touch BEFORE UPDATE ON gap
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- decision — §13 "decision, reason, date, who". Append-only.
-- ---------------------------------------------------------------------------
CREATE TABLE decision (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL,
  product_id         uuid NOT NULL,
  -- Null when the decision attaches to the product rather than to one item.
  item_id            uuid,
  statement          text NOT NULL,
  reason             text NOT NULL,
  -- No FK, as on gap and the ledger: a record, not a link.
  decided_by_user_id uuid NOT NULL,
  decided_at         timestamptz NOT NULL DEFAULT now(),
  -- Correcting a decision is logging a new one that supersedes it — §11's
  -- revert-as-new-version, made queryable rather than left as a convention.
  supersedes_id      uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- No updated_at. A row that can never change has none.

  CONSTRAINT decision_workspace_id UNIQUE (workspace_id, id),
  CONSTRAINT decision_workspace_fk FOREIGN KEY (workspace_id)
    REFERENCES workspace (id) ON DELETE RESTRICT,
  CONSTRAINT decision_product_fk FOREIGN KEY (workspace_id, product_id)
    REFERENCES product (workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT decision_item_fk FOREIGN KEY (workspace_id, item_id)
    REFERENCES item (workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT decision_supersedes_fk FOREIGN KEY (workspace_id, supersedes_id)
    REFERENCES decision (workspace_id, id) ON DELETE RESTRICT,

  CONSTRAINT decision_statement_len CHECK (length(btrim(statement)) BETWEEN 1 AND 2000),
  CONSTRAINT decision_reason_len    CHECK (length(btrim(reason))    BETWEEN 1 AND 2000),
  CONSTRAINT decision_not_self      CHECK (supersedes_id IS DISTINCT FROM id)
);--> statement-breakpoint

CREATE INDEX decision_product_idx ON decision (workspace_id, product_id, decided_at DESC);--> statement-breakpoint
CREATE INDEX decision_item_idx ON decision (workspace_id, item_id);--> statement-breakpoint

CREATE TRIGGER decision_append_only BEFORE UPDATE OR DELETE ON decision
  FOR EACH ROW EXECUTE FUNCTION app.deny_mutation();--> statement-breakpoint

REVOKE UPDATE, DELETE ON decision FROM anon, authenticated;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- RLS — §14's role matrix. Viewer appears in no write policy anywhere.
-- ---------------------------------------------------------------------------
ALTER TABLE gap      ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE gap      FORCE  ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE decision ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE decision FORCE  ROW LEVEL SECURITY;--> statement-breakpoint

-- gap is reached through its item, so per-product visibility runs through
-- app.item_product(). No new helpers: these are 0001's.
CREATE POLICY gap_select ON gap FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT app.workspace_ids())
    AND app.can_see_product(app.item_product(item_id))
  );--> statement-breakpoint
CREATE POLICY gap_insert ON gap FOR INSERT TO authenticated
  WITH CHECK (
    app.role_in(workspace_id) IN ('owner', 'product')
    AND app.can_see_product(app.item_product(item_id))
  );--> statement-breakpoint
CREATE POLICY gap_update ON gap FOR UPDATE TO authenticated
  USING (
    app.role_in(workspace_id) IN ('owner', 'product')
    AND app.can_see_product(app.item_product(item_id))
  )
  WITH CHECK (
    app.role_in(workspace_id) IN ('owner', 'product')
    AND app.can_see_product(app.item_product(item_id))
  );--> statement-breakpoint
-- No DELETE policy: §5's answer to a gap that should not exist is `excluded`,
-- which keeps the history §15 calls load-bearing. Deleting the item still
-- reaches its gaps, because a cascade does not consult policies.

CREATE POLICY decision_select ON decision FOR SELECT TO authenticated
  USING (
    workspace_id IN (SELECT app.workspace_ids())
    AND app.can_see_product(product_id)
  );--> statement-breakpoint
CREATE POLICY decision_insert ON decision FOR INSERT TO authenticated
  WITH CHECK (
    app.role_in(workspace_id) IN ('owner', 'product')
    AND app.can_see_product(product_id)
  );--> statement-breakpoint
-- No UPDATE and no DELETE policy: append-only, and §14 gives Developer no
-- decision-logging right in the first place.

-- ---------------------------------------------------------------------------
-- activity — correcting the two FK shapes 0003 taught us to avoid.
--
-- Neither of these ever worked. `activity` is append-only, so the CASCADE from
-- `workspace` was refused by the trigger, and the SET NULL from `product` was
-- refused twice over: the trigger, and the fact that SET NULL on a *composite*
-- foreign key nulls every referencing column — including `workspace_id`, which
-- is NOT NULL. A product or workspace carrying any activity row was already
-- undeletable; this only makes the refusal name the right table.
-- ---------------------------------------------------------------------------
ALTER TABLE activity DROP CONSTRAINT activity_product_fk;--> statement-breakpoint
ALTER TABLE activity ADD CONSTRAINT activity_product_fk
  FOREIGN KEY (workspace_id, product_id) REFERENCES product (workspace_id, id)
  ON DELETE RESTRICT;--> statement-breakpoint

ALTER TABLE activity DROP CONSTRAINT activity_workspace_id_workspace_id_fk;--> statement-breakpoint
ALTER TABLE activity ADD CONSTRAINT activity_workspace_fk
  FOREIGN KEY (workspace_id) REFERENCES workspace (id) ON DELETE RESTRICT;--> statement-breakpoint
