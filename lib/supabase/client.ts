import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";

/** Browser client (anon key, bound by RLS). Use only in client components. */
export function createClient() {
  const { url, anonKey } = getSupabaseConfig();
  return createBrowserClient(url, anonKey);
}
