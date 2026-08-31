/**
 * GENERATED — do not edit by hand.
 *
 * Regenerate after every migration. `supabase gen types typescript --db-url …`
 * needs a container runtime, which this machine does not have, so the working
 * route is the Supabase MCP server's `generate_typescript_types` against the
 * project the migration was just applied to.
 *
 * T2.4 regenerated this whole file, which retires two hand-edit notes and
 * confirms them: `item.key`, `product.key_prefix` (T1.2) and `ai_usage`,
 * `workspace_ai_credential` (T2.2) came back byte-identical in shape to what
 * was written by hand — required on Row and Insert, optional on Update, the
 * shape the generator gives a NOT NULL column with no default. One value did
 * drift: `PostgrestVersion` was hand-typed `14.15` and the platform reports
 * `14.5`. Nothing read it, so nothing was wrong; it is right now.
 *
 * The one thing this file still cannot express: `vault_secret_id` is typed
 * because Drizzle owns the column, but the request path cannot select it —
 * `authenticated` holds no grant on it (see `drizzle/0007_ai_layer.sql`), so a
 * query naming it fails at run time even though it typechecks.
 *
 * This file is what makes `src/db/queries/*` typed rather than typed-looking:
 * the clients in `src/lib/supabase/` are parameterised with `Database`, so a
 * column that does not exist is a `pnpm typecheck` failure instead of a runtime
 * `null`. Drift between this file and the schema shows up the same way.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      activity: {
        Row: {
          action: string;
          actor_agent: string | null;
          actor_kind: Database["public"]["Enums"]["actor_kind"];
          actor_user_id: string | null;
          id: string;
          metadata: Json;
          occurred_at: string;
          product_id: string | null;
          subject_id: string;
          subject_table: string;
          trigger_source: Database["public"]["Enums"]["activity_trigger"];
          workspace_id: string;
        };
        Insert: {
          action: string;
          actor_agent?: string | null;
          actor_kind: Database["public"]["Enums"]["actor_kind"];
          actor_user_id?: string | null;
          id?: string;
          metadata?: Json;
          occurred_at?: string;
          product_id?: string | null;
          subject_id: string;
          subject_table: string;
          trigger_source: Database["public"]["Enums"]["activity_trigger"];
          workspace_id: string;
        };
        Update: {
          action?: string;
          actor_agent?: string | null;
          actor_kind?: Database["public"]["Enums"]["actor_kind"];
          actor_user_id?: string | null;
          id?: string;
          metadata?: Json;
          occurred_at?: string;
          product_id?: string | null;
          subject_id?: string;
          subject_table?: string;
          trigger_source?: Database["public"]["Enums"]["activity_trigger"];
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_product_fk";
            columns: ["workspace_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "product";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "activity_workspace_fk";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspace";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_usage: {
        Row: {
          actor_agent: string | null;
          actor_kind: Database["public"]["Enums"]["actor_kind"];
          actor_user_id: string | null;
          cache_read_tokens: number;
          cache_write_tokens: number;
          escalated_from: Database["public"]["Enums"]["ai_tier"] | null;
          id: string;
          latency_ms: number;
          model: string;
          occurred_at: string;
          outcome: Database["public"]["Enums"]["ai_outcome"];
          output_tokens: number;
          product_id: string | null;
          provider: Database["public"]["Enums"]["ai_provider"];
          purpose: string;
          rate_card: string;
          tier: Database["public"]["Enums"]["ai_tier"];
          uncached_input_tokens: number;
          workspace_id: string;
        };
        Insert: {
          actor_agent?: string | null;
          actor_kind: Database["public"]["Enums"]["actor_kind"];
          actor_user_id?: string | null;
          cache_read_tokens: number;
          cache_write_tokens: number;
          escalated_from?: Database["public"]["Enums"]["ai_tier"] | null;
          id?: string;
          latency_ms: number;
          model: string;
          occurred_at?: string;
          outcome: Database["public"]["Enums"]["ai_outcome"];
          output_tokens: number;
          product_id?: string | null;
          provider: Database["public"]["Enums"]["ai_provider"];
          purpose: string;
          rate_card: string;
          tier: Database["public"]["Enums"]["ai_tier"];
          uncached_input_tokens: number;
          workspace_id: string;
        };
        Update: {
          actor_agent?: string | null;
          actor_kind?: Database["public"]["Enums"]["actor_kind"];
          actor_user_id?: string | null;
          cache_read_tokens?: number;
          cache_write_tokens?: number;
          escalated_from?: Database["public"]["Enums"]["ai_tier"] | null;
          id?: string;
          latency_ms?: number;
          model?: string;
          occurred_at?: string;
          outcome?: Database["public"]["Enums"]["ai_outcome"];
          output_tokens?: number;
          product_id?: string | null;
          provider?: Database["public"]["Enums"]["ai_provider"];
          purpose?: string;
          rate_card?: string;
          tier?: Database["public"]["Enums"]["ai_tier"];
          uncached_input_tokens?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_usage_product_fk";
            columns: ["workspace_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "product";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "ai_usage_workspace_id_workspace_id_fk";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspace";
            referencedColumns: ["id"];
          },
        ];
      };
      artifact: {
        Row: {
          created_at: string;
          id: string;
          item_id: string;
          kind: Database["public"]["Enums"]["artifact_kind"];
          next_scoring_attempt_at: string | null;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          item_id: string;
          kind: Database["public"]["Enums"]["artifact_kind"];
          next_scoring_attempt_at?: string | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          item_id?: string;
          kind?: Database["public"]["Enums"]["artifact_kind"];
          next_scoring_attempt_at?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "artifact_item_fk";
            columns: ["workspace_id", "item_id"];
            isOneToOne: false;
            referencedRelation: "item";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      artifact_version: {
        Row: {
          artifact_id: string;
          authored_by_agent: string | null;
          authored_by_kind: Database["public"]["Enums"]["actor_kind"];
          authored_by_user_id: string | null;
          content: Json;
          content_hash: string;
          created_at: string;
          id: string;
          version_no: number;
          workspace_id: string;
        };
        Insert: {
          artifact_id: string;
          authored_by_agent?: string | null;
          authored_by_kind: Database["public"]["Enums"]["actor_kind"];
          authored_by_user_id?: string | null;
          content: Json;
          content_hash: string;
          created_at?: string;
          id?: string;
          version_no: number;
          workspace_id: string;
        };
        Update: {
          artifact_id?: string;
          authored_by_agent?: string | null;
          authored_by_kind?: Database["public"]["Enums"]["actor_kind"];
          authored_by_user_id?: string | null;
          content?: Json;
          content_hash?: string;
          created_at?: string;
          id?: string;
          version_no?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "artifact_version_artifact_fk";
            columns: ["workspace_id", "artifact_id"];
            isOneToOne: false;
            referencedRelation: "artifact";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      decision: {
        Row: {
          created_at: string;
          decided_at: string;
          decided_by_user_id: string;
          id: string;
          item_id: string | null;
          product_id: string;
          reason: string;
          statement: string;
          supersedes_id: string | null;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          decided_at?: string;
          decided_by_user_id: string;
          id?: string;
          item_id?: string | null;
          product_id: string;
          reason: string;
          statement: string;
          supersedes_id?: string | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          decided_at?: string;
          decided_by_user_id?: string;
          id?: string;
          item_id?: string | null;
          product_id?: string;
          reason?: string;
          statement?: string;
          supersedes_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "decision_item_fk";
            columns: ["workspace_id", "item_id"];
            isOneToOne: false;
            referencedRelation: "item";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "decision_product_fk";
            columns: ["workspace_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "product";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "decision_supersedes_fk";
            columns: ["workspace_id", "supersedes_id"];
            isOneToOne: false;
            referencedRelation: "decision";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "decision_workspace_fk";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspace";
            referencedColumns: ["id"];
          },
        ];
      };
      gap: {
        Row: {
          check_id: string;
          created_at: string;
          disposition: Database["public"]["Enums"]["gap_disposition"];
          evidence: string;
          id: string;
          item_id: string;
          resolution_note: string | null;
          resolved_at: string | null;
          resolved_by_user_id: string | null;
          tag: Database["public"]["Enums"]["gap_tag"];
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          check_id: string;
          created_at?: string;
          disposition?: Database["public"]["Enums"]["gap_disposition"];
          evidence: string;
          id?: string;
          item_id: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by_user_id?: string | null;
          tag: Database["public"]["Enums"]["gap_tag"];
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          check_id?: string;
          created_at?: string;
          disposition?: Database["public"]["Enums"]["gap_disposition"];
          evidence?: string;
          id?: string;
          item_id?: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by_user_id?: string | null;
          tag?: Database["public"]["Enums"]["gap_tag"];
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gap_item_fk";
            columns: ["workspace_id", "item_id"];
            isOneToOne: false;
            referencedRelation: "item";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "gap_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspace";
            referencedColumns: ["id"];
          },
        ];
      };
      item: {
        Row: {
          created_at: string;
          flow_intent: Database["public"]["Enums"]["flow_intent"] | null;
          id: string;
          key: string;
          opportunity_id: string | null;
          product_id: string;
          title: string;
          type: Database["public"]["Enums"]["item_type"];
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          flow_intent?: Database["public"]["Enums"]["flow_intent"] | null;
          id?: string;
          key: string;
          opportunity_id?: string | null;
          product_id: string;
          title: string;
          type: Database["public"]["Enums"]["item_type"];
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          flow_intent?: Database["public"]["Enums"]["flow_intent"] | null;
          id?: string;
          key?: string;
          opportunity_id?: string | null;
          product_id?: string;
          title?: string;
          type?: Database["public"]["Enums"]["item_type"];
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "item_opportunity_fk";
            columns: ["workspace_id", "opportunity_id"];
            isOneToOne: false;
            referencedRelation: "opportunity";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "item_product_fk";
            columns: ["workspace_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "product";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "item_workspace_id_workspace_id_fk";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspace";
            referencedColumns: ["id"];
          },
        ];
      };
      membership: {
        Row: {
          all_products: boolean;
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["member_role"];
          updated_at: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          all_products?: boolean;
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["member_role"];
          updated_at?: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          all_products?: boolean;
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["member_role"];
          updated_at?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "membership_workspace_id_workspace_id_fk";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspace";
            referencedColumns: ["id"];
          },
        ];
      };
      membership_product: {
        Row: {
          membership_id: string;
          product_id: string;
          workspace_id: string;
        };
        Insert: {
          membership_id: string;
          product_id: string;
          workspace_id: string;
        };
        Update: {
          membership_id?: string;
          product_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "membership_product_membership_id_membership_id_fk";
            columns: ["membership_id"];
            isOneToOne: false;
            referencedRelation: "membership";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "membership_product_product_fk";
            columns: ["workspace_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "product";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      opportunity: {
        Row: {
          created_at: string;
          id: string;
          product_id: string;
          summary: string | null;
          title: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          product_id: string;
          summary?: string | null;
          title: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          product_id?: string;
          summary?: string | null;
          title?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "opportunity_product_fk";
            columns: ["workspace_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "product";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "opportunity_workspace_id_workspace_id_fk";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspace";
            referencedColumns: ["id"];
          },
        ];
      };
      product: {
        Row: {
          created_at: string;
          decider_user_id: string | null;
          id: string;
          key_prefix: string;
          name: string;
          slug: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          decider_user_id?: string | null;
          id?: string;
          key_prefix: string;
          name: string;
          slug: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          decider_user_id?: string | null;
          id?: string;
          key_prefix?: string;
          name?: string;
          slug?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_workspace_id_workspace_id_fk";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspace";
            referencedColumns: ["id"];
          },
        ];
      };
      scoring_check_result: {
        Row: {
          check_id: string;
          id: string;
          note: string | null;
          passed: boolean;
          points: number;
          quote: string | null;
          requirement_id: string | null;
          run_id: string;
          tag: Database["public"]["Enums"]["gap_tag"];
          workspace_id: string;
        };
        Insert: {
          check_id: string;
          id?: string;
          note?: string | null;
          passed: boolean;
          points: number;
          quote?: string | null;
          requirement_id?: string | null;
          run_id: string;
          tag: Database["public"]["Enums"]["gap_tag"];
          workspace_id: string;
        };
        Update: {
          check_id?: string;
          id?: string;
          note?: string | null;
          passed?: boolean;
          points?: number;
          quote?: string | null;
          requirement_id?: string | null;
          run_id?: string;
          tag?: Database["public"]["Enums"]["gap_tag"];
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scoring_check_result_run_fk";
            columns: ["workspace_id", "run_id"];
            isOneToOne: false;
            referencedRelation: "scoring_run";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      scoring_run: {
        Row: {
          artifact_id: string;
          artifact_version_id: string;
          conditions_met: string[];
          denominator: number;
          earned: number;
          id: string;
          item_id: string;
          model: string;
          pack_id: string;
          pack_version: string;
          protocol_version: string;
          provider: Database["public"]["Enums"]["ai_provider"];
          scored_at: string;
          workspace_id: string;
        };
        Insert: {
          artifact_id: string;
          artifact_version_id: string;
          conditions_met: string[];
          denominator: number;
          earned: number;
          id?: string;
          item_id: string;
          model: string;
          pack_id: string;
          pack_version: string;
          protocol_version: string;
          provider: Database["public"]["Enums"]["ai_provider"];
          scored_at?: string;
          workspace_id: string;
        };
        Update: {
          artifact_id?: string;
          artifact_version_id?: string;
          conditions_met?: string[];
          denominator?: number;
          earned?: number;
          id?: string;
          item_id?: string;
          model?: string;
          pack_id?: string;
          pack_version?: string;
          protocol_version?: string;
          provider?: Database["public"]["Enums"]["ai_provider"];
          scored_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scoring_run_artifact_fk";
            columns: ["workspace_id", "artifact_id"];
            isOneToOne: false;
            referencedRelation: "artifact";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "scoring_run_item_fk";
            columns: ["workspace_id", "item_id"];
            isOneToOne: false;
            referencedRelation: "item";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "scoring_run_version_fk";
            columns: ["workspace_id", "artifact_version_id"];
            isOneToOne: false;
            referencedRelation: "artifact_version";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "scoring_run_workspace_fk";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspace";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace: {
        Row: {
          created_at: string;
          id: string;
          locale: string;
          name: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          locale?: string;
          name: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          locale?: string;
          name?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      workspace_ai_credential: {
        Row: {
          created_at: string;
          created_by_user_id: string | null;
          key_hint: string;
          provider: Database["public"]["Enums"]["ai_provider"];
          scorer_model: string;
          updated_at: string;
          vault_secret_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by_user_id?: string | null;
          key_hint: string;
          provider: Database["public"]["Enums"]["ai_provider"];
          scorer_model: string;
          updated_at?: string;
          vault_secret_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by_user_id?: string | null;
          key_hint?: string;
          provider?: Database["public"]["Enums"]["ai_provider"];
          scorer_model?: string;
          updated_at?: string;
          vault_secret_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_ai_credential_workspace_id_workspace_id_fk";
            columns: ["workspace_id"];
            isOneToOne: true;
            referencedRelation: "workspace";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      bootstrap_workspace: {
        Args: { p_name: string };
        Returns: {
          created_at: string;
          id: string;
          locale: string;
          name: string;
          timezone: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "workspace";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
    };
    Enums: {
      activity_trigger: "user" | "agent" | "schedule" | "webhook" | "sync";
      actor_kind: "human" | "agent";
      ai_outcome: "ok" | "schema_invalid" | "refused" | "unavailable" | "rate_limited" | "rejected";
      ai_provider: "anthropic" | "openai";
      ai_tier: "routine" | "analysis" | "generation";
      artifact_kind: "brief" | "prd" | "tech_spec" | "design_package" | "backlog";
      flow_intent: "value" | "quality" | "risk" | "debt";
      gap_disposition: "open" | "accepted" | "excluded" | "closed";
      gap_tag: "must" | "should";
      item_type:
        "feature" | "enhancement" | "technical" | "content" | "experiment" | "fix" | "spike";
      member_role: "owner" | "product" | "developer" | "viewer";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      activity_trigger: ["user", "agent", "schedule", "webhook", "sync"],
      actor_kind: ["human", "agent"],
      ai_outcome: ["ok", "schema_invalid", "refused", "unavailable", "rate_limited", "rejected"],
      ai_provider: ["anthropic", "openai"],
      ai_tier: ["routine", "analysis", "generation"],
      artifact_kind: ["brief", "prd", "tech_spec", "design_package", "backlog"],
      flow_intent: ["value", "quality", "risk", "debt"],
      gap_disposition: ["open", "accepted", "excluded", "closed"],
      gap_tag: ["must", "should"],
      item_type: ["feature", "enhancement", "technical", "content", "experiment", "fix", "spike"],
      member_role: ["owner", "product", "developer", "viewer"],
    },
  },
} as const;
