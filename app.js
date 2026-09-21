// ============================================================
// PAMIGO - Main Entry (Stage 4-B: Home + Merchants + Offers)
// ============================================================
import { supabase } from './supabase.js';
import { DEFAULT_RADIUS_KM } from './config.js';
import {
  signUpCustomer, signUpMerchant, signIn, signOut,
  getProfile, getMyMerchant, onAuthChange
} from './auth.js';

console.log('🚀 PAMIGO Stage 4-B starting...');

const $ = (id) => document.getElementById(id);

// ============================================================
// State
// ============================================================
let currentProfile = null;
let allMerchants = [];
let userLat = null;
let userLng = null;
let currentRadius = DEFAULT_RADIUS_KM;
let currentCategory = 'all';
let currentSort = 'nearest';
let searchQuery = '';
let currentModalMerchant = null;

// ============================================================
// Supabase: fetch merchants with offers and ratings
// ============================================================
async function loadMerchants() {
  const { data, error } = await supabase
    .from('merchants')
    .select(`
      id, bank_code, name, phone, category, sub_categories,
      icon, lat, lng, cashback_rate, frozen,
      offers ( id, title, discount ),
      ratings ( stars )
    `)
    .eq('frozen', false);

  if (error) { console.error('Load merchants error:', error); return []; }
  return data || [];
}

// ============================================================
// Haversine distance
// ============================================================
function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) *
            Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================================
// Helpers
// ============================================================
function getTier(rate) {
  if (rate >= 40) return { name: 'VIP', icon: '💎', cls: 'tier-vip' };
  if (rate >= 25) return { name: 'بريميوم', icon: '🥇', cls: 'tier-gold' };
  if (rate >= 10) return { name: 'مميز', icon: '🥈', cls: 'tier-silver' };
  return { name: 'عادي', icon: '🥉', cls: 'tier-bronze' };
}

function getMaxDiscount(m) {
  if (!m.offers || !m.offers.length) return 0;
  return Math.max(...m.offers.map(o => {
    const x = (o.discount || '').match(/(\d+)/);
    return x ? parseInt(x[1]) : 0;
  }));
}

function getAvgRating(m) {
  if (!m.ratings || !m.ratings.length) return null;
  const sum = m.ratings.reduce((s, r) => s + r.stars, 0);
  return (sum / m.ratings.length).toFixed(1);
}

function getRoleName(role) {
  return { customer: '👤 عميل', merchant: '🏪 تاجر', admin: '👑 أدمن' }[role] || role;
}

// ============================================================
// Geolocation
// ============================================================
function getUserLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => { console.warn('Geo error:', err); resolve(null); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
}

async function updateLocation() {
  $('locationText').innerText = '⏳ جاري تحديد الموقع...';
  const loc = await getUserLocation();
  if (loc) {
    userLat = loc.lat;
    userLng = loc.lng;
    $('locationText').innerText = `${userLat.toFixed(4)}, ${userLng.toFixed(4)}`;
  } else {
    $('locationText').innerText = '❌ تعذر تحديد الموقع';
  }
  renderMerchantsList();
}

// ============================================================
// Filter + sort
// ============================================================
function getFilteredMerchants() {
  let list = [...allMerchants];

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.offers || []).some(o => (o.title || '').toLowerCase().includes(q))
    );
  }

  if (currentCategory !== 'all') {
    list = list.filter(m => m.category === currentCategory);
  }

  if (userLat !== null && userLng !== null) {
    list = list.filter(m => {
      m._dist = calcDistance(userLat, userLng, m.lat, m.lng);
      return m._dist <= currentRadius;
    });
  }

  if (currentSort === 'nearest' && userLat !== null) {
    list.sort((a, b) => (a._dist || 0) - (b._dist || 0));
  } else if (currentSort === 'cashback') {
    list.sort((a, b) => (b.cashback_rate || 0) - (a.cashback_rate || 0));
  } else if (currentSort === 'discount') {
    list.sort((a, b) => getMaxDiscount(b) - getMaxDiscount(a));
  }

  return list;
}

// ============================================================
// Render: merchants list
// ============================================================
function renderMerchantsList() {
  const list = getFilteredMerchants();
  const el = $('merchantsList');

  if (!list.length) {
    el.innerHTML = `<div class="no-requests">😅 لا توجد نتائج</div>`;
    return;
  }

  el.innerHTML = list.map(m => {
    const rate = m.cashback_rate || 15;
    const tier = getTier(rate);
    const maxDisc = getMaxDiscount(m);
    const rating = getAvgRating(m);
    const dist = m._dist ? m._dist.toFixed(2) + ' كم' : '';

    return `
      <div class="store-item" onclick="openMerchant('${m.bank_code}')">
        <div class="icon">${m.icon || '🏪'}</div>
        <div class="info">
          <h4>${m.name} <span class="tier-chip ${tier.cls}">${tier.icon} ${tier.name}</span></h4>
          <div class="desc">
            ${dist ? dist + ' • ' : ''}${(m.offers || []).length} عرض • كاش باك ${rate}%${maxDisc ? ' • خصم لحد ' + maxDisc + '%' : ''}
          </div>
          <div style="font-size:12px;color:#f59e0b;margin-top:2px">
            ${rating ? '⭐'.repeat(Math.floor(rating)) + ' ' + rating : '⭐ لا تقييمات'}
          </div>
        </div>
        <div class="badge">${rate}%</div>
      </div>
    `;
  }).join('');
}

// ============================================================
// Render: top deals scroll
// ============================================================
function renderTopDeals() {
  const sorted = [...allMerchants]
    .filter(m => (m.offers || []).length > 0)
    .sort((a, b) => (b.cashback_rate || 0) - (a.cashback_rate || 0))
    .slice(0, 10);

  const el = $('dealsScroll');
  if (!sorted.length) { el.innerHTML = ''; return; }

  el.innerHTML = sorted.map(m => {
    const rate = m.cashback_rate || 15;
    const tier = getTier(rate);
    return `
      <div class="deal-card" onclick="openMerchant('${m.bank_code}')">
        <div class="tier-badge">${tier.icon}</div>
        <div class="discount">${rate}%</div>
        <div class="icon">${m.icon || '🏪'}</div>
        <div class="tag">${m.name}</div>
        <div style="font-size:11px;color:#ff6b35;margin-top:4px">كاش باك ${rate}%</div>
      </div>
    `;
  }).join('');
}

// ============================================================
// Render: offers grid
// ============================================================
function renderOffersGrid(cat = 'all') {
  let list = cat === 'all'
    ? [...allMerchants]
    : allMerchants.filter(m => m.category === cat);

  list.sort((a, b) => (b.cashback_rate || 0) - (a.cashback_rate || 0));

  const el = $('offersGrid');
  if (!list.length) {
    el.innerHTML = `<p style="text-align:center;padding:20px;color:#6b7280">لا توجد عروض</p>`;
    return;
  }

  el.innerHTML = list.map(m => {
    const rate = m.cashback_rate || 15;
    const tier = getTier(rate);
    return `
      <div class="deal-card" onclick="openMerchant('${m.bank_code}')" style="min-width:auto;text-align:center">
        <div class="tier-badge">${tier.icon}</div>
        <div style="font-size:48px">${m.icon || '🏪'}</div>
        <div class="discount" style="font-size:20px">${rate}%</div>
        <div style="font-size:13px;font-weight:600">${m.name}</div>
        <div style="font-size:11px;color:#ff6b35;margin-top:4px">كاش باك ${rate}%</div>
      </div>
    `;
  }).join('');
}

// ============================================================
// Merchant modal
// ============================================================
window.openMerchant = function (bankCode) {
  const m = allMerchants.find(x => x.bank_code === bankCode);
  if (!m) return;
  currentModalMerchant = m;

  const rate = m.cashback_rate || 15;
  const tier = getTier(rate);

  $('modalMerchantName').innerText = m.name;
  $('modalMerchantInfo').innerHTML =
    `${m.icon || '🏪'} • ${(m.offers || []).length} عرض • ` +
    `<span class="tier-chip ${tier.cls}">${tier.icon} ${tier.name}</span> • كاش باك <strong>${rate}%</strong>`;

  $('modalOffersList').innerHTML = (m.offers || []).length
    ? m.offers.map((o, i) => `
        <div style="background:#f9fafb;padding:14px;border-radius:12px;margin-bottom:10px;border-right:4px solid #ff6b35;display:flex;justify-content:space-between;align-items:center;gap:10px">
          <div style="flex:1">
            <h5 style="font-size:15px;margin-bottom:4px;color:var(--primary)">${o.title}</h5>
            <p style="font-size:12px;color:#6b7280">عرض ${i + 1} من ${m.offers.length}</p>
          </div>
          <div style="background:#1a2a6c;color:#fff;padding:6px 14px;border-radius:30px;font-weight:700;font-size:14px;white-space:nowrap">${o.discount}</div>
        </div>
      `).join('')
    : '<p style="text-align:center;color:#6b7280;padding:20px">لا توجد عروض حالياً</p>';

  $('merchantModal').classList.add('active');
};

window.closeMerchantModal = function () {
  $('merchantModal').classList.remove('active');
  currentModalMerchant = null;
};

window.closeModal = function (e) {
  if (e.target.classList.contains('modal-overlay')) closeMerchantModal();
};

// ============================================================
// Tabs
// ============================================================
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === name)
  );
  document.querySelectorAll('.tab-content').forEach(c =>
    c.classList.toggle('active', c.id === 'tab-' + name)
  );
}

// ============================================================
// Auth screens
// ============================================================
function showMessage(text, type = 'error') {
  const el = $('authMessage');
  if (!el) return;
  el.className = 'auth-message ' + type;
  el.innerText = text;
}

function showAuthScreen() {
  $('authScreen').style.display = 'block';
  $('mainScreen').style.display = 'none';
}

async function showMainScreen(profile) {
  currentProfile = profile;
  $('authScreen').style.display = 'none';
  $('mainScreen').style.display = 'block';

  $('userRole').innerText = getRoleName(profile.role);
  $('userRole').className = 'role-badge role-' + profile.role;
  $('userName').innerText = profile.name || 'مستخدم';

  if (profile.role === 'merchant') {
    $('merchantBanner').style.display = 'block';
    const m = await getMyMerchant();
    $('merchantName').innerText = m ? m.name : 'غير مرتبط';
  } else {
    $('merchantBanner').style.display = 'none';
  }

  await refreshData();
  if (userLat === null) updateLocation();
}

async function refreshData() {
  $('merchantsList').innerHTML = '<div class="no-requests">⏳ جاري التحميل...</div>';
  allMerchants = await loadMerchants();
  renderTopDeals();
  renderMerchantsList();
  renderOffersGrid('all');
}

// ============================================================
// Auth handlers
// ============================================================
async function handleLogin(e) {
  e.preventDefault();
  const phone = $('loginPhone').value.trim();
  const password = $('loginPassword').value;
  if (!phone || !password) return showMessage('❌ املأ البيانات');

  const btn = $('loginBtn');
  btn.disabled = true; btn.innerText = '⏳ جاري الدخول...';
  try {
    await signIn({ phone, password });
    showMessage('✅ تم تسجيل الدخول', 'success');
  } catch (err) {
    showMessage('❌ ' + translateError(err.message));
  } finally {
    btn.disabled = false; btn.innerText = '🚀 دخول';
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const name = $('signupName').value.trim();
  const phone = $('signupPhone').value.trim();
  const password = $('signupPassword').value;
  const role = $('signupRole').value;
  const bankCode = $('signupBankCode').value.trim();

  if (!name || !phone || !password) return showMessage('❌ املأ كل الحقول');
  if (password.length < 6) return showMessage('❌ الباسورد 6 أحرف على الأقل');
  if (role === 'merchant' && !bankCode) return showMessage('❌ لازم البنكود');

  const btn = $('signupBtn');
  btn.disabled = true; btn.innerText = '⏳ جاري التسجيل...';
  try {
    if (role === 'merchant') await signUpMerchant({ phone, password, name, bankCode });
    else await signUpCustomer({ phone, password, name });

    showMessage('✅ تم إنشاء الحساب — جاري الدخول...', 'success');
    await signIn({ phone, password });
  } catch (err) {
    showMessage('❌ ' + translateError(err.message));
  } finally {
    btn.disabled = false; btn.innerText = '📝 إنشاء الحساب';
  }
}

async function handleLogout() {
  if (!confirm('متأكد من تسجيل الخروج؟')) return;
  await signOut();
}

function translateError(msg) {
  if (msg.includes('Invalid login credentials')) return 'بيانات الدخول غير صحيحة';
  if (msg.includes('User already registered')) return 'رقم الموبايل مسجل بالفعل';
  if (msg.includes('Password should be at least')) return 'كلمة المرور قصيرة جدًا';
  if (msg.includes('Unable to validate email')) return 'رقم موبايل غير صالح';
  if (msg.includes('البنكود غير موجود')) return 'البنكود غير موجود';
  if (msg.includes('مرتبط بحساب')) return 'البنكود ده مرتبط بحساب تاني';
  if (msg.includes('rate limit')) return 'حاول تاني بعد شوية';
  return msg;
}

// ============================================================
// Auth tabs
// ============================================================
function showAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab)
  );
  $('loginForm').style.display = tab === 'login' ? 'block' : 'none';
  $('signupForm').style.display = tab === 'signup' ? 'block' : 'none';
  $('authMessage').innerText = '';
  $('authMessage').className = 'auth-message';
}

function updateBankCodeVisibility() {
  $('bankCodeGroup').style.display =
    $('signupRole').value === 'merchant' ? 'block' : 'none';
}

// ============================================================
// Bind events
// ============================================================
function bindEvents() {
  // Auth
  $('loginForm').addEventListener('submit', handleLogin);
  $('signupForm').addEventListener('submit', handleSignup);
  $('logoutBtn').addEventListener('click', handleLogout);
  $('signupRole').addEventListener('change', updateBankCodeVisibility);

  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => showAuthTab(tab.dataset.tab));
  });

  // Main tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Location
  $('refreshLocation').addEventListener('click', updateLocation);

  // Search
  $('searchInput').addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    renderMerchantsList();
  });

  // Radius
  $('radiusSlider').addEventListener('input', (e) => {
    currentRadius = parseFloat(e.target.value);
    $('radiusValue').innerText = currentRadius;
    renderMerchantsList();
  });

  // Sort
  document.querySelectorAll('#sortOptions .category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#sortOptions .category-chip').forEach(c =>
        c.classList.remove('active'));
      chip.classList.add('active');
      currentSort = chip.dataset.sort;
      renderMerchantsList();
    });
  });

  // Home categories
  document.querySelectorAll('#homeCategories .category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#homeCategories .category-chip').forEach(c =>
        c.classList.remove('active'));
      chip.classList.add('active');
      currentCategory = chip.dataset.cat;
      renderMerchantsList();
    });
  });

  // Offers categories
  document.querySelectorAll('#offersCategories .category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#offersCategories .category-chip').forEach(c =>
        c.classList.remove('active'));
      chip.classList.add('active');
      renderOffersGrid(chip.dataset.cat);
    });
  });
}

// ============================================================
// Auth state
// ============================================================
onAuthChange(async (event, session) => {
  if (session?.user) {
    const profile = await getProfile();
    if (profile) await showMainScreen(profile);
  } else {
    showAuthScreen();
  }
});

// ============================================================
// Init
// ============================================================
window.addEventListener('load', async () => {
  bindEvents();
  showAuthTab('login');
  updateBankCodeVisibility();
  $('radiusValue').innerText = currentRadius;

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    const profile = await getProfile();
    if (profile) await showMainScreen(profile);
  } else {
    showAuthScreen();
  }
});