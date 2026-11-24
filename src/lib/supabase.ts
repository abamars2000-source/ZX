import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export async function syncSupabaseGoogleSession(
  googleIdToken?: string | null,
  accessToken?: string | null
): Promise<{ userId: string | null; email: string | null }> {
  if (!supabase || !googleIdToken) {
    return { userId: null, email: null };
  }
  try {
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: googleIdToken,
      ...(accessToken ? { access_token: accessToken } : {}),
    });
    if (error) {
      return { userId: null, email: null };
    }
    return {
      userId: data.user?.id || null,
      email: data.user?.email || null,
    };
  } catch {
    return { userId: null, email: null };
  }
}

export async function signOutSupabase(): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
  } catch {
    // ignore signout error
  }
}
