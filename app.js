// ============================================================
// PAMIGO - Main Entry (Stage 3: Auth)
// ============================================================
import { supabase } from './supabase.js';
import { signUp, signIn, signOut, getProfile, onAuthChange } from './auth.js';

console.log('🚀 PAMIGO starting...');

// ============================================================
// عناصر الصفحة
// ============================================================
const $ = (id) => document.getElementById(id);

// ============================================================
// التبديل بين شاشة الدخول والموقع
// ============================================================
function showAuthScreen() {
  $('authScreen').style.display = 'block';
  $('mainScreen').style.display = 'none';
}

function showMainScreen(profile) {
  $('authScreen').style.display = 'none';
  $('mainScreen').style.display = 'block';

  $('userName').innerText = profile.name || 'مستخدم';
  $('userPhone').innerText = profile.phone || '-';
  $('userRole').innerText = getRoleName(profile.role);
  $('userRole').className = 'role-badge role-' + profile.role;
  $('userSince').innerText = new Date(profile.created_at).toLocaleDateString('ar-EG');
}

function getRoleName(role) {
  const map = {
    customer: '👤 عميل',
    merchant: '🏪 تاجر',
    admin: '👑 أدمن'
  };
  return map[role] || role;
}

// ============================================================
// التبديل بين Login / Signup
// ============================================================
function showTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab)
  );
  $('loginForm').style.display = tab === 'login' ? 'block' : 'none';
  $('signupForm').style.display = tab === 'signup' ? 'block' : 'none';
  $('authMessage').innerText = '';
}

// ============================================================
// رسائل المستخدم
// ============================================================
function showMessage(text, type = 'error') {
  const el = $('authMessage');
  el.className = 'auth-message ' + type;
  el.innerText = text;
}

// ============================================================
// نموذج تسجيل الدخول
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
    // onAuthChange هيشتغل تلقائي
  } catch (err) {
    console.error(err);
    showMessage('❌ ' + translateError(err.message));
  } finally {
    btn.disabled = false;
    btn.innerText = '🚀 دخول';
  }
}

// ============================================================
// نموذج تسجيل حساب جديد
// ============================================================
async function handleSignup(e) {
  e.preventDefault();
  const name = $('signupName').value.trim();
  const phone = $('signupPhone').value.trim();
  const password = $('signupPassword').value;
  const role = $('signupRole').value;

  if (!name || !phone || !password) {
    showMessage('❌ املأ كل الحقول');
    return;
  }
  if (password.length < 6) {
    showMessage('❌ كلمة المرور لازم 6 أحرف على الأقل');
    return;
  }

  const btn = $('signupBtn');
  btn.disabled = true;
  btn.innerText = '⏳ جاري التسجيل...';

  try {
    await signUp({ phone, password, name, role });
    showMessage('✅ تم إنشاء الحساب — جاري الدخول...', 'success');

    // دخول تلقائي بعد التسجيل
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
// ترجمة رسائل Supabase للعربي
// ============================================================
function translateError(msg) {
  if (msg.includes('Invalid login credentials')) return 'بيانات الدخول غير صحيحة';
  if (msg.includes('User already registered')) return 'رقم الموبايل مسجل بالفعل';
  if (msg.includes('Password should be at least')) return 'كلمة المرور قصيرة جدًا';
  if (msg.includes('Unable to validate email')) return 'رقم موبايل غير صالح';
  if (msg.includes('rate limit')) return 'حاول تاني بعد شوية';
  return msg;
}

// ============================================================
// ربط الأحداث
// ============================================================
function bindEvents() {
  $('loginForm').addEventListener('submit', handleLogin);
  $('signupForm').addEventListener('submit', handleSignup);
  $('logoutBtn').addEventListener('click', handleLogout);

  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => showTab(tab.dataset.tab));
  });
}

// ============================================================
// مراقبة حالة الجلسة
// ============================================================
onAuthChange(async (event, session) => {
  console.log('🔐 Auth event:', event);

  if (session?.user) {
    const profile = await getProfile();
    if (profile) {
      showMainScreen(profile);
    } else {
      showMessage('⚠️ مفيش profile — تواصل مع الأدمن');
    }
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

  // فحص الجلسة الحالية
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    const profile = await getProfile();
    if (profile) showMainScreen(profile);
  } else {
    showAuthScreen();
  }
});