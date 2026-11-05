import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function supabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export function getSupabase(): SupabaseClient {
  const env = supabaseEnv();
  if (!env) {
    throw new Error("Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.");
  }
  if (!browserClient) {
    browserClient = createClient(env.url, env.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return browserClient;
}

export async function ensureSession(): Promise<string> {
  const supabase = getSupabase();
  const existing = await supabase.auth.getSession();
  if (existing.error) throw new Error(existing.error.message);
  if (!existing.data.session) {
    const signedIn = await supabase.auth.signInAnonymously();
    if (signedIn.error) {
      throw new Error(
        `${signedIn.error.message} Enable Anonymous sign-ins in the Supabase Auth settings.`,
      );
    }
  }
  const user = await supabase.auth.getUser();
  if (user.error || !user.data.user) {
    throw new Error(user.error?.message ?? "Anonymous sign-in failed.");
  }
  return user.data.user.id;
}
