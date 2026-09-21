// ============================================================
// PAMIGO - Authentication
// ============================================================
import { supabase } from './supabase.js';

// ============================================================
// تحويل رقم الموبايل لإيميل وهمي
// ============================================================
export function phoneToEmail(phone) {
  const clean = phone.replace(/\D/g, '');
  return `${clean}@pamigo.local`;
}

// ============================================================
// تسجيل مستخدم جديد
// ============================================================
export async function signUp({ phone, password, name, role = 'customer', bankCode = null }) {
  const email = phoneToEmail(phone);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        phone,
        name,
        role,
        bank_code: bankCode
      }
    }
  });

  if (error) throw error;
  return data;
}

// ============================================================
// تسجيل الدخول
// ============================================================
export async function signIn({ phone, password }) {
  const email = phoneToEmail(phone);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;
  return data;
}

// ============================================================
// تسجيل الخروج
// ============================================================
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ============================================================
// جلب الـ profile للمستخدم الحالي
// ============================================================
export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Profile error:', error);
    return null;
  }
  return data;
}

// ============================================================
// الاستماع لتغيير حالة الجلسة
// ============================================================
export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}