// ============================================================
// PAMIGO - Authentication
// ============================================================
import { supabase } from './supabase.js';

export function phoneToEmail(phone) {
  const clean = phone.replace(/\D/g, '');
  return `${clean}@pamigo.local`;
}

// ============================================================
// تسجيل عميل جديد
// ============================================================
export async function signUpCustomer({ phone, password, name }) {
  const email = phoneToEmail(phone);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { phone, name, role: 'customer' } }
  });
  if (error) throw error;
  return data;
}

// ============================================================
// تسجيل تاجر جديد (مع البنكود)
// ============================================================
export async function signUpMerchant({ phone, password, name, bankCode }) {
  const code = bankCode.trim().toUpperCase();

  // 1) تحقق إن البنكود موجود
  const { data: merchant, error: merr } = await supabase
    .from('merchants')
    .select('id, owner_id, name')
    .eq('bank_code', code)
    .single();

  if (merr || !merchant) {
    throw new Error('البنكود غير موجود');
  }

  if (merchant.owner_id) {
    throw new Error('البنكود ده مرتبط بحساب تاني بالفعل');
  }

  // 2) سجل الحساب
  const email = phoneToEmail(phone);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { phone, name, role: 'merchant', bank_code: code }
    }
  });
  if (error) throw error;

  // 3) اربط الحساب بالمتجر
  const userId = data.user?.id;
  if (userId) {
    const { error: linkErr } = await supabase
      .from('merchants')
      .update({ owner_id: userId })
      .eq('id', merchant.id);

    if (linkErr) {
      console.error('Link error:', linkErr);
      throw new Error('تم التسجيل بس ربط المتجر فشل — تواصل مع الأدمن');
    }
  }

  return data;
}

// ============================================================
// تسجيل الدخول
// ============================================================
export async function signIn({ phone, password }) {
  const email = phoneToEmail(phone);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
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
// جلب الـ profile
// ============================================================
export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) { console.error('Profile error:', error); return null; }
  return data;
}

// ============================================================
// جلب بيانات المتجر المرتبط بالتاجر
// ============================================================
export async function getMyMerchant() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('merchants')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (error) { console.error('Merchant error:', error); return null; }
  return data;
}

// ============================================================
// الاستماع لتغيير حالة الجلسة
// ============================================================
export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => callback(event, session));
}
// ============================================================
// تسجيل أدمن بالبنكود السري
// ============================================================
export async function signUpAdmin({ phone, password, name, adminCode }) {
  if (adminCode.trim() !== 'PETAD-12321') {
    throw new Error('بنكود الأدمن غير صحيح');
  }

  const email = phoneToEmail(phone);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { phone, name, role: 'admin' }
    }
  });

  if (error) throw error;
  return data;
}