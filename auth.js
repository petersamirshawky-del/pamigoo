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
      const added = currentValue.replace(/?/g, '');
      const lastChar = added[added.length - 1] || '';
      newReal = realValue + lastChar;
    } else if (currentValue.length < realValue.length) {
      newReal = realValue.slice(0, currentValue.length);
    } else {
      newReal = currentValue.replace(/?/g, '');
    }

    realValue = newReal;
    this.dataset.realValue = realValue;

    if (realValue.length === 0) { this.value = ''; return; }

    this.value = '?'.repeat(Math.max(0, realValue.length - 1)) + realValue[realValue.length - 1];
    try { this.setSelectionRange(this.value.length, this.value.length); } catch (_) {}

    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => {
      if (realValue.length > 0) {
        this.value = '?'.repeat(realValue.length);
        try { this.setSelectionRange(this.value.length, this.value.length); } catch (_) {}
      }
    }, 700);
  });

  input.addEventListener('paste', function (e) {
    e.preventDefault();
    const pastedText = (e.clipboardData || window.clipboardData).getData('text');
    realValue = realValue + pastedText;
    this.dataset.realValue = realValue;
    this.value = '?'.repeat(realValue.length);
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

export async function signUpMerchant({ phone, email, password, name, bankCode }) {
  const code = bankCode.trim().toUpperCase();

  const { data: merchant, error: merr } = await supabase
    .from('merchants').select('id, owner_id, name')
    .eq('bank_code', code).single();

  if (merr || !merchant) throw new Error('«·»‰ﬂÊœ €Ì— „ÊÃÊœ');
  if (merchant.owner_id) throw new Error('«·»‰ﬂÊœ œÂ „— »ÿ »Õ”«»  «‰Ì »«·›⁄·');

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { phone, name, role: 'merchant', bank_code: code } }
  });
  if (error) throw error;

  const userId = data.user?.id;
  if (userId) {
    const { error: linkErr } = await supabase
      .from('merchants').update({ owner_id: userId }).eq('id', merchant.id);
    if (linkErr) { console.error('Link error:', linkErr); throw new Error(' „ «· ”ÃÌ· »” —»ÿ «·„ Ã— ›‘·'); }
  }
  return data;
}

export async function signUpAdmin({ phone, email, password, name, adminCode }) {
  if (adminCode.trim() !== 'PETAD-12321') throw new Error('»‰ﬂÊœ «·√œ„‰ €Ì— ’ÕÌÕ');
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { phone, name, role: 'admin' } }
  });
  if (error) throw error;
  return data;
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
export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles').select('*').eq('id', user.id).single();
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
  if (!newPassword || newPassword.length < 6) throw new Error('ﬂ·„… «·„—Ê— «·ÃœÌœ… 6 √Õ—› ⁄·Ï «·√ﬁ·');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('„‘ „”Ã· œŒÊ·');

  const { error: signErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword
  });
  if (signErr) throw new Error('ﬂ·„… «·„—Ê— «·Õ«·Ì… €Ì— ’ÕÌÕ…');

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