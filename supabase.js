// ============================================================
// Supabase Client
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});

// ============================================================
// Helper: الحصول على المستخدم الحالي
// ============================================================
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ============================================================
// Helper: الحصول على profile المستخدم الحالي
// ============================================================
export async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error) return null;
  return data;
}

// ============================================================
// Helper: تسجيل الدخول
// ============================================================
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;
  return data;
}

// ============================================================
// Helper: تسجيل مستخدم جديد
// ============================================================
export async function signUp(email, password, phone, role = 'customer') {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { phone, role }
    }
  });
  if (error) throw error;
  return data;
}

// ============================================================
// Helper: تسجيل الخروج
// ============================================================
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}