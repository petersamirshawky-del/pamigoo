// ============================================================
// PAMIGO - Authentication (v5 - Fixed Bank Code & Merge)
// ============================================================
import { supabase } from './supabase.js';

// ✅ دالة مساعدة لتنظيف أرقام الموبايل (شيل المسافات والزائد 20)
function cleanPhoneNumber(phone) {
  if (!phone) return '';
  return phone.toString().trim()
    .replace(/\s+/g, '') 
    .replace(/^\+20/, '0') 
    .replace(/^\+2/, '0')  
    .replace(/^0020/, '0'); 
}

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

export async function signUpCustomer({ phone, email, password, name }) {
  const cleanPhone = cleanPhoneNumber(phone);
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { phone: cleanPhone, name, role: 'customer' } }
  });
  if (error) throw error;
  return data;
}

export async function signUpMerchant({ phone, email, password, name, bankCode }) {
  const code = bankCode.trim();
  const cleanPhone = cleanPhoneNumber(phone);

  const { data: check, error: checkErr } = await supabase.rpc('verify_merchant_bank_code', { p_bank_code: code });
  if (checkErr) throw new Error('فشل التحقق من البنكود');
  if (!check.ok) throw new Error(check.error || 'البنكود غير موجود');

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { phone: cleanPhone, name, role: 'merchant', bank_code: code } }
  });
  if (error) throw error;

  const userId = data.user?.id;
  if (userId) {
    const { data: linkResult, error: linkErr } = await supabase.rpc('link_merchant_to_user', { p_bank_code: code });
    if (linkErr) console.error('Link error:', linkErr);
  }
  return data;
}

export async function signUpAdmin({ phone, email, password, name, adminCode }) {
  const cleanPhone = cleanPhoneNumber(phone);

  const { data: check, error: checkErr } = await supabase.rpc('verify_admin_code', { p_code: (adminCode || '').trim() });
  if (checkErr) throw new Error('فشل التحقق من الكود');
  if (!check.ok) throw new Error('بنكود الأدمن غير صحيح');

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { phone: cleanPhone, name, role: 'admin' } }
  });
  if (error) throw error;
  return data;
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname, queryParams: { access_type: 'offline', prompt: 'consent' } }
  });
  if (error) throw error;
  return data;
}

export async function completeGoogleProfile({ phone, name, role = 'customer', bankCode = null, adminCode = null }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('مش مسجل دخول');

  const cleanPhone = cleanPhoneNumber(phone);

  // ✅ 1. نشوف هل الرقم ده متسجل قبل كده؟
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('phone', cleanPhone)
    .maybeSingle();

  // ✅ 2. لو الرقم موجود لحساب تاني (الدمج)
  if (existingProfile && existingProfile.id !== user.id) {
    if (!existingProfile.email) {
      await supabase
        .from('profiles')
        .update({ email: user.email, id: user.id })
        .eq('id', existingProfile.id);
      
      await supabase.from('profiles').delete().eq('id', existingProfile.id);
    } else if (existingProfile.email !== user.email) {
      throw new Error('رقم الموبايل ده متسجل بالفعل بحساب تاني.');
    }
  }

  // ✅ 3. التحقق من البنكود أو الأدمن (بقت أسهل)
  if (role === 'merchant') {
    if (!bankCode || bankCode.trim() === '') throw new Error('لازم البنكود');
  }

  if (role === 'admin') {
    const { data: check, error: checkErr } = await supabase.rpc('verify_admin_code', { p_code: (adminCode || '').trim() });
    if (checkErr || !check.ok) throw new Error('بنكود الأدمن غير صحيح');
  }

  // ✅ 4. حفظ البروفايل
  const { error: profErr } = await supabase.from('profiles').upsert({
    id: user.id, phone: cleanPhone, name, role, email: user.email
  });
  if (profErr) throw profErr;

  // ✅ 5. ربط التاجر (هنا بيتحقق من البنكود في السيرفر)
  if (role === 'merchant') {
    const code = bankCode.trim(); // شيلنا toUpperCase
    const { data: linkResult, error: linkErr } = await supabase.rpc('link_merchant_to_user', { p_bank_code: code });
    if (linkErr) throw new Error('تم حفظ البيانات بس ربط المتجر فشل');
    if (!linkResult.ok) throw new Error(linkResult.error || 'فشل ربط المتجر');
  }

  return { success: true };
}

export async function findEmailByPhone(phone) {
  const cleanPhone = cleanPhoneNumber(phone); 
  const { data, error } = await supabase.rpc('get_email_by_phone', { p_phone: cleanPhone });
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

export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('profiles').select('id, name, phone, email, role').eq('id', user.id).single();
  if (error) { console.error('Profile error:', error); return null; }
  return data;
}

export async function getMyMerchant() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('merchants').select('*').eq('owner_id', user.id).maybeSingle();
  if (error) { console.error('Merchant error:', error); return null; }
  return data;
}

export async function changeMyPassword({ currentPassword, newPassword }) {
  if (!newPassword || newPassword.length < 6) throw new Error('كلمة المرور الجديدة 6 أحرف على الأقل');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('مش مسجل دخول');
  const { error: signErr } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
  if (signErr) throw new Error('كلمة المرور الحالية غير صحيحة');
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function adminChangePassword(userId, newPassword) {
  const { data, error } = await supabase.rpc('admin_change_password', { p_user_id: userId, p_new_password: newPassword });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
}

export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
  if (error) throw error;
}

export async function updateMyEmail(email) {
  const { error } = await supabase.auth.updateUser({ email: email.trim().toLowerCase() });
  if (error) throw error;
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await supabase.from('profiles').update({ email }).eq('id', user.id);
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => callback(event, session));
}
