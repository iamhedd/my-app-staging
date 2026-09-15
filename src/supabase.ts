import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

function requireSupabase() {
  if (!supabase) throw new Error('اتصال Supabase تنظیم نشده است. متغیرهای محیطی پروژه را کامل کن.');
  return supabase;
}

export async function signInWithEmail(email: string, password: string) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return data;
}

export async function signUpWithEmail(email: string, password: string, fullName: string) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { full_name: fullName.trim() },
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw error;
  return data;
}

export async function sendPasswordReset(email: string) {
  const client = requireSupabase();
  const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const client = requireSupabase();
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;
}

export async function signInWithGoogle() {
  const client = requireSupabase();

  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account',
      },
    },
  });

  if (error) throw error;
}

export async function signOut() {
  const client = requireSupabase();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
