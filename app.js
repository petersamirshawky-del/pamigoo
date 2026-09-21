// ============================================================
// PAMIGO - Main Entry (Stage 4-C)
// ============================================================
import { supabase } from './supabase.js';
import { SUB_CATEGORIES } from './config.js';
import {
  signUpCustomer, signUpMerchant, signIn, signOut,
  getProfile, getMyMerchant, onAuthChange
} from './auth.js';

const $ = (id) => document.getElementById(id);

// ============================================================
// State
// ============================================================
let currentProfile = null;
let allMerchants = [];
let userLat = null, userLng = null;
let searchQuery = '';

// Home
let homeRadius = 2;
let homeCategories = ['all'];
let homeSubCategories = [];
let homeSort = 'nearest';

// Offers
let offersCategories = ['all'];
let offersSubCategories = [];

let currentModalMerchant = null;

// ============================================================
// Load
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
  if (error) { console.error(error); return []; }
  return data || [];
}

// ============================================================
// Helpers
// ============================================================
function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
  return (m.ratings.reduce((s, r) => s + r.stars, 0) / m.ratings.length).toFixed(1);
}

function getRoleName(role) {
  return { customer: '👤 عميل', merchant: '🏪 تاجر', admin: '👑 أدمن' }[role] || role;
}

// ============================================================
// Geo
// ============================================================
function getUserLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
}

async function updateLocation() {
  $('locationText').innerText = '⏳ جاري تحديد الموقع...';
  const loc = await getUserLocation();
  if (loc) {
    userLat = loc.lat; userLng = loc.lng;
    $('locationText').innerText = `${userLat.toFixed(4)}, ${userLng.toFixed(4)}`;
  } else {
    $('locationText').innerText = '❌ تعذر تحديد الموقع';
  }
  renderMerchantsList();
}

// ============================================================
// Filters
// ============================================================
function matchesCatSubs(m, cats, subs) {
  if (!cats.includes('all')) {
    if (!cats.includes(m.category)) return false;
  }
  if (subs.length) {
    if (!m.sub_categories || !m.sub_categories.length) return false;
    if (!m.sub_categories.some(s => subs.includes(s))) return false;
  }
  return true;
}

// ============================================================
// Render: merchants list (Home)
// ============================================================
function renderMerchantsList() {
  let list = [...allMerchants];

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.offers || []).some(o => (o.title || '').toLowerCase().includes(q))
    );
  }

  list = list.filter(m => matchesCatSubs(m, homeCategories, homeSubCategories));

  if (userLat !== null && userLng !== null) {
    list = list.filter(m => {
      m._dist = calcDistance(userLat, userLng, m.lat, m.lng);
      return m._dist <= homeRadius;
    });
  }

  if (homeSort === 'nearest' && userLat !== null) {
    list.sort((a, b) => (a._dist || 0) - (b._dist || 0));
  } else if (homeSort === 'cashback') {
    list.sort((a, b) => (b.cashback_rate || 0) - (a.cashback_rate || 0));
  } else if (homeSort === 'discount') {
    list.sort((a, b) => getMaxDiscount(b) - getMaxDiscount(a));
  }

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

    let subNames = '';
    if (m.sub_categories && m.sub_categories.length) {
      const l = SUB_CATEGORIES[m.category] || [];
      subNames = m.sub_categories
        .map(id => (l.find(x => x.id === id) || {}).name || id)
        .join(', ');
    }

    return `
      <div class="store-item" onclick="openMerchant('${m.bank_code}')">
        <div class="icon">${m.icon || '🏪'}</div>
        <div class="info">
          <h4>${m.name} <span class="tier-chip ${tier.cls}">${tier.icon} ${tier.name}</span></h4>
          <div class="desc">
            ${dist ? dist + ' • ' : ''}${(m.offers || []).length} عرض • كاش باك ${rate}%${maxDisc ? ' • خصم لحد ' + maxDisc + '%' : ''}
          </div>
          ${subNames ? `<div style="font-size:11px;color:#8b5cf6;margin-top:2px">${subNames}</div>` : ''}
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
// Top deals
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
// Offers grid (بدون فلتر مكان / ترتيب — شبكة كاملة)
// ============================================================
function renderOffersGrid() {
  let list = [...allMerchants].filter(m => (m.offers || []).length > 0);
  list = list.filter(m => matchesCatSubs(m, offersCategories, offersSubCategories));

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
        <div style="font-size:11px;color:#6b7280;margin-top:2px">${(m.offers || []).length} عرض</div>
      </div>
    `;
  }).join('');
}

// ============================================================
// Sub-categories renderer
// ============================================================
function renderSubCategoriesGeneric({ categories, subs, wrapperEl, containerEl, onToggle }) {
  const singleCat = categories.length === 1 && categories[0] !== 'all'
    ? categories[0] : null;

  if (!singleCat || !SUB_CATEGORIES[singleCat]) {
    wrapperEl.style.display = 'none';
    return;
  }

  wrapperEl.style.display = 'block';
  const list = SUB_CATEGORIES[singleCat];

  containerEl.innerHTML = list.map(sub => `
    <button class="category-chip ${subs.includes(sub.id) ? 'active' : ''}"
            data-sub="${sub.id}">${sub.name}</button>
  `).join('');

  containerEl.querySelectorAll('.category-chip').forEach(btn => {
    btn.addEventListener('click', () => onToggle(btn.dataset.sub, btn));
  });
}

// ============================================================
// Category toggle (multi)
// ============================================================
function toggleCategoryGeneric({ cat, chip, categories, subs, containerId, onUpdate }) {
  if (cat === 'all') {
    categories.length = 0; categories.push('all');
    subs.length = 0;
    document.querySelectorAll(`#${containerId} .category-chip`).forEach(c => {
      c.classList.toggle('active', c.dataset.cat === 'all');
    });
  } else {
    const ai = categories.indexOf('all');
    if (ai > -1) categories.splice(ai, 1);
    document.querySelector(`#${containerId} .category-chip[data-cat="all"]`)
      ?.classList.remove('active');

    const idx = categories.indexOf(cat);
    if (idx > -1) {
      categories.splice(idx, 1);
      chip.classList.remove('active');
    } else {
      categories.push(cat);
      chip.classList.add('active');
    }

    if (categories.length === 0) {
      categories.push('all');
      document.querySelector(`#${containerId} .category-chip[data-cat="all"]`)
        ?.classList.add('active');
    }
  }
  onUpdate();
}

// ============================================================
// Sub-category wrappers
// ============================================================
function renderHomeSubCategories() {
  renderSubCategoriesGeneric({
    categories: homeCategories,
    subs: homeSubCategories,
    wrapperEl: $('homeSubWrapper'),
    containerEl: $('homeSubCategories'),
    onToggle: (id, btn) => {
      const i = homeSubCategories.indexOf(id);
      if (i > -1) { homeSubCategories.splice(i, 1); btn.classList.remove('active'); }
      else { homeSubCategories.push(id); btn.classList.add('active'); }
      renderMerchantsList();
    }
  });
}

function renderOffersSubCategories() {
  renderSubCategoriesGeneric({
    categories: offersCategories,
    subs: offersSubCategories,
    wrapperEl: $('offersSubWrapper'),
    containerEl: $('offersSubCategories'),
    onToggle: (id, btn) => {
      const i = offersSubCategories.indexOf(id);
      if (i > -1) { offersSubCategories.splice(i, 1); btn.classList.remove('active'); }
      else { offersSubCategories.push(id); btn.classList.add('active'); }
      renderOffersGrid();
    }
  });
}

// ============================================================
// Modal
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
// Auth
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
  renderHomeSubCategories();
  renderOffersSubCategories();
  renderMerchantsList();
  renderOffersGrid();
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
    showMessage('✅ تم إنشاء الحساب', 'success');
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
// Bind
// ============================================================
function bindEvents() {
  $('loginForm').addEventListener('submit', handleLogin);
  $('signupForm').addEventListener('submit', handleSignup);
  $('logoutBtn').addEventListener('click', handleLogout);
  $('signupRole').addEventListener('change', updateBankCodeVisibility);

  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => showAuthTab(tab.dataset.tab));
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  $('refreshLocation').addEventListener('click', updateLocation);

  $('searchInput').addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    renderMerchantsList();
  });

  // HOME
  $('homeRadiusSlider').addEventListener('input', (e) => {
    homeRadius = parseFloat(e.target.value);
    $('homeRadiusValue').innerText = homeRadius;
    renderMerchantsList();
  });

  document.querySelectorAll('#homeSortOptions .category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#homeSortOptions .category-chip').forEach(c =>
        c.classList.remove('active'));
      chip.classList.add('active');
      homeSort = chip.dataset.sort;
      renderMerchantsList();
    });
  });

  document.querySelectorAll('#homeCategories .category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      toggleCategoryGeneric({
        cat: chip.dataset.cat,
        chip,
        categories: homeCategories,
        subs: homeSubCategories,
        containerId: 'homeCategories',
        onUpdate: () => {
          renderHomeSubCategories();
          renderMerchantsList();
        }
      });
    });
  });

  // OFFERS
  document.querySelectorAll('#offersCategories .category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      toggleCategoryGeneric({
        cat: chip.dataset.cat,
        chip,
        categories: offersCategories,
        subs: offersSubCategories,
        containerId: 'offersCategories',
        onUpdate: () => {
          renderOffersSubCategories();
          renderOffersGrid();
        }
      });
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

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    const profile = await getProfile();
    if (profile) await showMainScreen(profile);
  } else {
    showAuthScreen();
  }
});