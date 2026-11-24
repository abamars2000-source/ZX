import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedAdmin: SupabaseClient | null | undefined;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (cachedAdmin !== undefined) return cachedAdmin;
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceKey) {
    cachedAdmin = null;
    return null;
  }
  cachedAdmin = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return cachedAdmin;
}

export async function syncUserToSupabaseAuth(params: {
  email: string;
  fullName: string;
  username: string;
  avatarUrl?: string;
  googleSub?: string;
  password?: string;
  hasPassword?: boolean;
  language?: string;
}): Promise<{ supabaseUserId: string | null }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { supabaseUserId: null };

  const cleanEmail = params.email.trim().toLowerCase();
  try {
    const { data: listData } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = listData?.users?.find((u) => (u.email || '').toLowerCase() === cleanEmail);

    let supabaseUserId = existing?.id || null;

    if (!existing) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: cleanEmail,
        ...(params.password ? { password: params.password } : {}),
        email_confirm: true,
        user_metadata: {
          full_name: params.fullName,
          username: params.username,
          avatar_url: params.avatarUrl || '',
          google_sub: params.googleSub || '',
        },
      });
      if (!createErr && created.user) {
        supabaseUserId = created.user.id;
      }
    } else {
      await admin.auth.admin.updateUserById(existing.id, {
        email_confirm: true,
        user_metadata: {
          ...existing.user_metadata,
          full_name: params.fullName,
          username: params.username,
          ...(params.avatarUrl ? { avatar_url: params.avatarUrl } : {}),
          ...(params.googleSub ? { google_sub: params.googleSub } : {}),
        },
      });
    }

    if (supabaseUserId) {
      await admin.from('profiles').upsert(
        {
          id: supabaseUserId,
          full_name: params.fullName.slice(0, 80),
          username: params.username,
          email: cleanEmail,
          google_sub: params.googleSub || '',
          has_password: params.hasPassword ?? Boolean(params.password),
          avatar_url: params.avatarUrl || '',
          language: params.language === 'en' ? 'en' : 'hi',
          email_verified: true,
          last_active_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'email' }
      );
    }

    return { supabaseUserId };
  } catch (err) {
    console.warn('Supabase Auth sync skipped:', err instanceof Error ? err.message : err);
    return { supabaseUserId: null };
  }
}
