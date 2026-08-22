"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/db/database.types";

import { publicEnv } from "@/lib/env";

/**
 * The browser client. Carries the publishable key and the user's session
 * cookie, so every query it makes is subject to RLS as that user.
 */
export function createClient() {
  return createBrowserClient<Database>(publicEnv.supabaseUrl(), publicEnv.supabaseKey());
}
