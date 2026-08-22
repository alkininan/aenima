"use client";

import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";

/**
 * The browser client. Carries the publishable key and the user's session
 * cookie, so every query it makes is subject to RLS as that user.
 */
export function createClient() {
  return createBrowserClient(publicEnv.supabaseUrl(), publicEnv.supabaseKey());
}
