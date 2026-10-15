// ============================================================
// PAMIGO - Authentication
// ============================================================
import { supabase } from './supabase.js';

// ============================================================
// Peek Effect
// ============================================================
export function applyPeekEffect(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.dataset.peekApplied === 'true') return;
  input.dataset.peekApplied = 'true';

  let peekTimer = null;
  let realValue = input.dataset.realValue || '';

  input.addEventListener('input', function () {
    const currentValue = this.value;
    let newReal = realValue;

    if (currentValue.length > realValue.length) {
      const added = currentValue.replace(/\u25CF/g, '');
      const lastChar = added[added.length - 1] || '';
      newReal = realValue + lastChar;
    } else if (currentValue.length < realValue.length) {
      newReal = realValue.slice(0, currentValue.length);
    } else {
      newReal = currentValue.replace(/\u25CF/g, '');
    }

    realValue = newReal;
    this.dataset.realValue = realValue;

    if (realValue.length === 0) { this.value = ''; return; }

    this.value = '\u25CF'.repeat(Math.max(0, realValue.length - 1)) + realValue[realValue.length - 1];
    try { this.setSelectionRange(this.value.length, this.value.length); } catch (_) {}

    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => {
      if (realValue.length > 0) {
        this.value = '\u25CF'.repeat(realValue.length);
        try { this.setSelectionRange(this.value.length, this.value.length); } catch (_) {}
      }
    }, 700);
  });

  input.addEventListener('paste', function (e) {
    e.preventDefault();
    const pastedText = (e.clipboardData || window.clipboardData).getData('text');
    realValue = realValue + pastedText;
    this.dataset.realValue = realValue;
    this.value = '\u25CF'.repeat(realValue.length);
  });
}

export function getRealValue(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return '';
  return (input.dataset.realValue || input.value || '').trim();
}

// ============================================================
// Signup (with real email)
// ============================================================
export async function signUpCustomer({ phone, email, password, name }) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { phone, name, role: 'customer' } }
  });
  if (error) throw error;
  return data;
}

// ✅ التعديل 1: signUpMerchant — نستخدم RPC بدل القراءة المباشرة
export async function signUpMerchant({ phone, email, password, name, bankCode }) {
  const code = bankCode.trim().toUpperCase();

  // ✅ التحقق من البنكود عن طريق RPC (مش في الفرونت)
  const { data: check, error: checkErr } = await supabase.rpc('verify_merchant_bank_code', {
    p_bank_code: code
  });

  if (checkErr) throw new Error('فشل التحقق من البنكود');
  if (!check.ok) throw new Error(check.error || 'البنكود غير موجود');

  // ✅ نعمل الحساب
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { phone, name, role: 'merchant', bank_code: code } }
  });
  if (error) throw error;

  // ✅ نربط المتجر بالمستخدم عن طريق RPC
  const userId = data.user?.id;
  if (userId) {
    // ✅ ملاحظة: RPC ده هيشتغل بعد ما المستخدم يعمل login
    // لما الجلسة تبقى active، هيقدر يربط المتجر
    const { data: linkResult, error: linkErr } = await supabase.rpc('link_merchant_to_user', {
      p_bank_code: code
    });

    if (linkErr) {
      console.error('Link error:', linkErr);
      // متعملش throw عشان الحساب اتعمل خلاص
    }
  }

  return data;
}

export async function signUpAdmin({ phone, email, password, name, adminCode }) {
  const { data: check, error: checkErr } = await supabase.rpc('verify_admin_code', {
    p_code: (adminCode || '').trim()
  });

  if (checkErr) throw new Error('فشل التحقق من الكود');
  if (!check.ok) throw new Error('بنكود الأدمن غير صحيح');

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { phone, name, role: 'admin' } }
  });
  if (error) throw error;
  return data;
}

// ============================================================
// ✅ Google Sign-In
// ============================================================
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent'
      }
    }
  });
  if (error) throw error;
  return data;
}

// ✅ التعديل 2: completeGoogleProfile — نستخدم RPC للبنكود
export async function completeGoogleProfile({ phone, name, role = 'customer', bankCode = null, adminCode = null }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('مش مسجل دخول');

  // ✅ لو تاجر، لازم نتحقق من البنكود عن طريق RPC
  if (role === 'merchant') {
    const code = bankCode?.trim().toUpperCase();
    if (!code) throw new Error('لازم البنكود');

    const { data: check, error: checkErr } = await supabase.rpc('verify_merchant_bank_code', {
      p_bank_code: code
    });

    if (checkErr) throw new Error('فشل التحقق من البنكود');
    if (!check.ok) throw new Error(check.error || 'البنكود غير موجود');
  }

  // ✅ لو أدمن، نتحقق من كود الأدمن
  if (role === 'admin') {
    const { data: check, error: checkErr } = await supabase.rpc('verify_admin_code', {
      p_code: (adminCode || '').trim()
    });
    if (checkErr || !check.ok) {
      throw new Error('بنكود الأدمن غير صحيح');
    }
  }

  // ✅ نحدّث الـ profile
  const { error: profErr } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      phone,
      name,
      role,
      email: user.email
    });
  if (profErr) throw profErr;

  // ✅ لو تاجر، نربط الحساب بالمتجر عن طريق RPC
  if (role === 'merchant') {
    const code = bankCode.trim().toUpperCase();
    const { data: linkResult, error: linkErr } = await supabase.rpc('link_merchant_to_user', {
      p_bank_code: code
    });

    if (linkErr) {
      console.error('Link error:', linkErr);
      throw new Error('تم حفظ البيانات بس ربط المتجر فشل');
    }

    if (!linkResult.ok) {
      throw new Error(linkResult.error || 'فشل ربط المتجر');
    }
  }

  return { success: true };
}

// ============================================================
// Signin / Signout
// ============================================================
export async function findEmailByPhone(phone) {
  const { data, error } = await supabase.rpc('get_email_by_phone', { p_phone: phone });
  if (error) throw error;
  return data;
}

export async function signInWithEmail({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ============================================================
// Get profile
// ============================================================
// ✅ التعديل 3: getProfile — نحدد الأعمدة اللي محتاجينها
export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, phone, email, role')
    .eq('id', user.id)
    .single();

  if (error) { console.error('Profile error:', error); return null; }
  return data;
}

export async function getMyMerchant() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('merchants').select('*').eq('owner_id', user.id).maybeSingle();
  if (error) { console.error('Merchant error:', error); return null; }
  return data;
}

// ============================================================
// Password Management
// ============================================================
export async function changeMyPassword({ currentPassword, newPassword }) {
  if (!newPassword || newPassword.length < 6) throw new Error('كلمة المرور الجديدة 6 أحرف على الأقل');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('مش مسجل دخول');

  const { error: signErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword
  });
  if (signErr) throw new Error('كلمة المرور الحالية غير صحيحة');

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function adminChangePassword(userId, newPassword) {
  const { data, error } = await supabase.rpc('admin_change_password', {
    p_user_id: userId,
    p_new_password: newPassword
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
}

// ============================================================
// Forgot Password
// ============================================================
export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  });
  if (error) throw error;
}

// ============================================================
// Update Email
// ============================================================
export async function updateMyEmail(email) {
  const { error } = await supabase.auth.updateUser({ email: email.trim().toLowerCase() });
  if (error) throw error;
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('profiles').update({ email }).eq('id', user.id);
  }
}

// ============================================================
// Auth state
// ============================================================
export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => callback(event, session));
}
