// ============================================================
// PAMIGO - i18n (Internationalization)
// ============================================================

const translations = {
  ar: {
    // Header
    'header.refresh': '🔄 تحديث الموقع',
    'header.locating': 'جاري تحديد الموقع...',
    'header.locationFailed': '❌ تعذر تحديد الموقع',

    // Auth Tabs
    'auth.loginTab': '🔐 دخول',
    'auth.signupTab': '📝 حساب جديد',

    // Login Form
    'login.title': 'تسجيل الدخول',
    'login.role': '👤 حسابي:',
    'login.roleCustomer': '👤 عميل',
    'login.roleMerchant': '🏪 تاجر',
    'login.roleAdmin': '👑 أدمن',
    'login.phone': '📱 رقم الموبايل',
    'login.password': '🔑 كلمة المرور',
    'login.bankCode': '🔑 بنكود التاجر',
    'login.adminCode': '🔑 بنكود الأدمن',
    'login.btn': '🚀 دخول',
    'login.forgot': 'نسيت كلمة المرور؟',

    // Signup Form
    'signup.title': 'حساب جديد',
    'signup.name': '👤 الاسم',
    'signup.phone': '📱 رقم الموبايل',
    'signup.email': '📧 الإيميل الحقيقي',
    'signup.password': '🔑 كلمة المرور (6 أحرف على الأقل)',
    'signup.merchantBankCode': '🔑 البنكود (مثال: MERCH-MNS01)',
    'signup.merchantBankHint': '💡 البنكود بتستلمه من إدارة PAMIGO.',
    'signup.adminCode': '🔑 بنكود الأدمن',
    'signup.adminHint': '💡 خاص بصاحب المنصة فقط.',
    'signup.btn': '📝 إنشاء الحساب',

    // Tabs
    'tab.home': '🏠 الرئيسية',
    'tab.offers': '🎁 العروض',
    'tab.invoice': '🧾 الفاتورة',
    'tab.requests': '📋 طلباتي',
    'tab.dashboard': '📊 لوحتي',
    'tab.reports': '📈 تقاريري',
    'tab.analytics': '📉 تحليلاتي',
    'tab.admin': '👑 الأدمن',
    'tab.account': '👤 حسابي',

    // Logout
    'logout': '🚪 خروج',

    // Roles
    'role.customer': '👤 عميل',
    'role.merchant': '🏪 تاجر',
    'role.admin': '👑 أدمن',

    // Merchant Banner
    'merchant.yourShop': '🏪 متجرك:',

    // Language
    'lang.ar': 'AR',
    'lang.en': 'EN'
  },

  en: {
    // Header
    'header.refresh': '🔄 Refresh Location',
    'header.locating': 'Locating...',
    'header.locationFailed': '❌ Location unavailable',

    // Auth Tabs
    'auth.loginTab': '🔐 Login',
    'auth.signupTab': '📝 Sign Up',

    // Login Form
    'login.title': 'Login',
    'login.role': '👤 Account:',
    'login.roleCustomer': '👤 Customer',
    'login.roleMerchant': '🏪 Merchant',
    'login.roleAdmin': '👑 Admin',
    'login.phone': '📱 Phone number',
    'login.password': '🔑 Password',
    'login.bankCode': '🔑 Merchant code',
    'login.adminCode': '🔑 Admin code',
    'login.btn': '🚀 Login',
    'login.forgot': 'Forgot password?',

    // Signup Form
    'signup.title': 'New Account',
    'signup.name': '👤 Name',
    'signup.phone': '📱 Phone number',
    'signup.email': '📧 Real email',
    'signup.password': '🔑 Password (min 6 chars)',
    'signup.merchantBankCode': '🔑 Bank code (e.g. MERCH-MNS01)',
    'signup.merchantBankHint': '💡 You receive this from PAMIGO admin.',
    'signup.adminCode': '🔑 Admin code',
    'signup.adminHint': '💡 Platform owner only.',
    'signup.btn': '📝 Create Account',

    // Tabs
    'tab.home': '🏠 Home',
    'tab.offers': '🎁 Offers',
    'tab.invoice': '🧾 Invoice',
    'tab.requests': '📋 My Requests',
    'tab.dashboard': '📊 Dashboard',
    'tab.reports': '📈 Reports',
    'tab.analytics': '📉 Analytics',
    'tab.admin': '👑 Admin',
    'tab.account': '👤 Account',

    // Logout
    'logout': '🚪 Logout',

    // Roles
    'role.customer': '👤 Customer',
    'role.merchant': '🏪 Merchant',
    'role.admin': '👑 Admin',

    // Merchant Banner
    'merchant.yourShop': '🏪 Your shop:',

    // Language
    'lang.ar': 'AR',
    'lang.en': 'EN'
  }
};

export let currentLang = localStorage.getItem('pamigo_lang') || 'ar';

export function t(key) {
  return translations[currentLang]?.[key] || translations.ar[key] || key;
}

export function setLang(lang) {
  if (!['ar', 'en'].includes(lang)) return;
  currentLang = lang;
  localStorage.setItem('pamigo_lang', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.body.style.direction = lang === 'ar' ? 'rtl' : 'ltr';

  // Update language buttons
  document.querySelectorAll('.lang-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === lang);
  });

  applyI18nToHTML();

  // Dispatch event so app.js can re-render
  window.dispatchEvent(new CustomEvent('langChanged', { detail: { lang } }));
}

export function applyI18nToHTML() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}

export function initI18n() {
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
  document.body.style.direction = currentLang === 'ar' ? 'rtl' : 'ltr';
  applyI18nToHTML();

  document.querySelectorAll('.lang-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === currentLang);
  });
}