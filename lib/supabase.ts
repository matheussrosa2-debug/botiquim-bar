import { createClient } from "@supabase/supabase-js";

// Remove any invisible/special characters that could cause ByteString errors
// This sanitizes env vars in case they were copied with hidden characters (e.g. U+2028)
function cleanEnv(s: string | undefined): string {
  return (s || "").replace(/[^\x21-\x7E]/g, "").trim();
}

const url  = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const anon = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const svc  = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

// Client-side (limited — anon key, respects RLS)
export const supabase = createClient(url, anon);

// Server-side (full access — service_role bypasses RLS, use ONLY in API routes)
export const supabaseAdmin = () => createClient(url, svc, {
  auth: { autoRefreshToken: false, persistSession: false },
});
