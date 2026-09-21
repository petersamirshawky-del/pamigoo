// ============================================================
// PAMIGO - Main Entry (Stage 4-A: Roles)
// ============================================================
import { supabase } from './supabase.js';
import {
  signUpCustomer,
  signUpMerchant,
  signIn,
  signOut,
  getProfile,
  getMyMerchant,
  onAuthChange
} from './auth.js';

console.log('🚀 PAMIGO Stage 4-A starting...');

const $ = (id) => document.getElementById(id);

// ============================================================
// شاشات
// ============================================================
function showAuthScreen() {
  $('authScreen').style.display = 'block';
  $('mainScreen').style.display = 'none';
}

async function showMainScreen(profile) {
  $('authScreen').style.display = 'none';
  $('mainScreen').style.display = 'block';

  $('userName').innerText = profile.name || 'مستخدم';
  $('userPhone').innerText = profile.phone || '-';
  $('userRole').innerText = getRoleName(profile.role);
  $('userRole').className = 'role-badge role-' + profile.role;
  $('userSince').innerText = new Date(profile.created_at).toLocaleDateString('ar-EG');

  // إظهار الكارت المناسب حسب الدور
  if (profile.role === 'merchant') {
    $('customerCard').style.display = 'none';
    $('merchantCard').style.display = 'block';
    await loadMerchantData();
  } else if (profile.role === 'customer') {
    $('merchantCard').style.display = 'none';
    $('customerCard').style.display = 'block';
  } else {
    $('merchantCard').style.display = 'none';
    $('customerCard').style.display = 'none';
  }
}

// ============================================================
// تحميل بيانات المتجر للتاجر
// ============================================================
async function loadMerchantData() {
  const merchant = await getMyMerchant();
  if (!merchant) {
    $('merchantName').innerText = '⚠️ مش مرتبط بمتجر';
    $('merchantBankCode').innerText = '-';
    $('merchantCategory').innerText = '-';
    $('merchantRate').innerText = '-';
    return;
  }

  $('merchantName').innerText = merchant.name;
  $('merchantBankCode').innerText = merchant.bank_code;
  $('merchantCategory').innerText = merchant.category || '-';
  $('merchantRate').innerText = (merchant.cashback_rate || 0) + '%';
}

// ============================================================
// ترجمة الأدوار
// ============================================================
function getRoleName(role) {
  const map = {
    customer: '👤 عميل',
    merchant: '🏪 تاجر',
    admin: '👑 أدمن'
  };
  return map[role] || role;
}

// ============================================================
// التبويبات
// ============================================================
function showTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab)
  );
  $('loginForm').style.display = tab === 'login' ? 'block' : 'none';
  $('signupForm').style.display = tab === 'signup' ? 'block' : 'none';
  $('authMessage').innerText = '';
  $('authMessage').className = 'auth-message';
}

// ============================================================
// رسائل
// ============================================================
function showMessage(text, type = 'error') {
  const el = $('authMessage');
  el.className = 'auth-message ' + type;
  el.innerText = text;
}

// ============================================================
// إظهار/إخفاء حقل البنكود
// ============================================================
function updateBankCodeVisibility() {
  const role = $('signupRole').value;
  $('bankCodeGroup').style.display = role === 'merchant' ? 'block' : 'none';
}

// ============================================================
// تسجيل الدخول
// ============================================================
async function handleLogin(e) {
  e.preventDefault();
  const phone = $('loginPhone').value.trim();
  const password = $('loginPassword').value;

  if (!phone || !password) {
    showMessage('❌ املأ رقم الموبايل وكلمة المرور');
    return;
  }

  const btn = $('loginBtn');
  btn.disabled = true;
  btn.innerText = '⏳ جاري الدخول...';

  try {
    await signIn({ phone, password });
    showMessage('✅ تم تسجيل الدخول', 'success');
  } catch (err) {
    console.error(err);
    showMessage('❌ ' + translateError(err.message));
  } finally {
    btn.disabled = false;
    btn.innerText = '🚀 دخول';
  }
}

// ============================================================
// تسجيل حساب جديد
// ============================================================
async function handleSignup(e) {
  e.preventDefault();

  const name = $('signupName').value.trim();
  const phone = $('signupPhone').value.trim();
  const password = $('signupPassword').value;
  const role = $('signupRole').value;
  const bankCode = $('signupBankCode').value.trim();

  if (!name || !phone || !password) {
    showMessage('❌ املأ كل الحقول');
    return;
  }

  if (password.length < 6) {
    showMessage('❌ كلمة المرور لازم 6 أحرف على الأقل');
    return;
  }

  if (role === 'merchant' && !bankCode) {
    showMessage('❌ لازم تدخل البنكود');
    return;
  }

  const btn = $('signupBtn');
  btn.disabled = true;
  btn.innerText = '⏳ جاري التسجيل...';

  try {
    if (role === 'merchant') {
      await signUpMerchant({ phone, password, name, bankCode });
    } else {
      await signUpCustomer({ phone, password, name });
    }

    showMessage('✅ تم إنشاء الحساب — جاري الدخول...', 'success');
    await signIn({ phone, password });
  } catch (err) {
    console.error(err);
    showMessage('❌ ' + translateError(err.message));
  } finally {
    btn.disabled = false;
    btn.innerText = '📝 إنشاء الحساب';
  }
}

// ============================================================
// تسجيل الخروج
// ============================================================
async function handleLogout() {
  if (!confirm('متأكد من تسجيل الخروج؟')) return;
  await signOut();
  showMessage('✅ تم تسجيل الخروج', 'success');
}

// ============================================================
// ترجمة الأخطاء
// ============================================================
function translateError(msg) {
  if (msg.includes('Invalid login credentials')) return 'بيانات الدخول غير صحيحة';
  if (msg.includes('User already registered')) return 'رقم الموبايل مسجل بالفعل';
  if (msg.includes('Password should be at least')) return 'كلمة المرور قصيرة جدًا';
  if (msg.includes('Unable to validate email')) return 'رقم موبايل غير صالح';
  if (msg.includes('rate limit')) return 'حاول تاني بعد شوية';
  if (msg.includes('البنكود غير موجود')) return 'البنكود غير موجود';
  if (msg.includes('مرتبط بحساب')) return 'البنكود ده مرتبط بحساب تاني';
  return msg;
}

// ============================================================
// ربط الأحداث
// ============================================================
function bindEvents() {
  $('loginForm').addEventListener('submit', handleLogin);
  $('signupForm').addEventListener('submit', handleSignup);
  $('logoutBtn').addEventListener('click', handleLogout);
  $('signupRole').addEventListener('change', updateBankCodeVisibility);

  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => showTab(tab.dataset.tab));
  });
}

// ============================================================
// مراقبة الجلسة
// ============================================================
onAuthChange(async (event, session) => {
  console.log('🔐 Auth event:', event);
  if (session?.user) {
    const profile = await getProfile();
    if (profile) await showMainScreen(profile);
    else showMessage('⚠️ مفيش profile');
  } else {
    showAuthScreen();
  }
});

// ============================================================
// التشغيل
// ============================================================
window.addEventListener('load', async () => {
  bindEvents();
  showTab('login');
  updateBankCodeVisibility();

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    const profile = await getProfile();
    if (profile) await showMainScreen(profile);
  } else {
    showAuthScreen();
  }
});