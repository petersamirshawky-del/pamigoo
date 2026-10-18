// ============================================================
// PAMIGO - Main Entry (v2.6 - Final Stable)
// ============================================================
const { supabase } = await import('./supabase.js');
const { toast, showLoader, hideLoader } = await import('./ui.js');
const { initI18n, setLang, currentLang, applyI18nToHTML } = await import('./i18n.js');
const { SUB_CATEGORIES, CATEGORY_ICONS, CATEGORY_NAMES } = await import('./config.js');

const {
  signUpCustomer, signUpMerchant, signUpAdmin, signOut,
  findEmailByPhone, signInWithEmail,
  getProfile, getMyMerchant, onAuthChange,
  applyPeekEffect, getRealValue,
  changeMyPassword, adminChangePassword,
  sendPasswordReset, updateMyEmail,
  signInWithGoogle, completeGoogleProfile
} = await import('./auth.js');

const {
  createInvoice, createInvoiceByBankCode,
  getMerchantInvoices, getMyInvoices,
  getMyPendingInvoices, confirmInvoice, rejectInvoice,
  getMyWallets, redeemCashback, getMerchantCustomerWallets,
  getMerchantCashbackSummary, checkCustomerPhone
} = await import('./invoices.js');

const {
  sendRequest, getMyRequests, getMerchantRequests,
  replyToRequest, acceptOffer, cancelRequest, deleteRequest,
  hideRequestForMerchant, askMerchantForImage, merchantSendExtraImage,
  requestSpecificOffer, getMyOfferRequests, getMerchantOfferRequests,
  replyToOfferRequest, cancelOfferRequest, deleteOfferRequest
} = await import('./requests.js');

const {
  getMerchantStats, getMerchantOffers, addOffer, deleteOffer,
  updateCashbackRate, getMerchantCustomers, getMerchantWallets,
  getMerchantInvoicesList, editInvoice, processReturn,
  getReportData, getAnalytics,
  uploadMerchantLogo, deleteMerchantLogo,
  uploadProductImage, deleteProductImage,
  trackOfferEvent, getOfferEventsStats,
  getMerchantTopOffers, getMerchantOffersViews,
  updateOffer
} = await import('./dashboard.js');

const {
  getAdminStats, getAllMerchants, getAllCustomers, getAllInvoices,
  addTrader, freezeMerchant, updateMerchantRate, deleteMerchant,
  adjustCustomerBalance, resetCustomerBalance, deleteCustomer,
  editInvoiceAdmin, returnInvoiceAdmin, deleteInvoice,
  sendNotification, getNotifications,
  adminUpdateMerchant, adminUpdateCustomer, adminGetAllRequests,
  getOfferEventsStats: getAdminOfferEventsStats,
  getMerchantFullReport
} = await import('./admin.js');

const {
  getUserWalletsBreakdown, initAccountMap, getMarkerPosition,
  setMarkerPosition, searchAddress, updateMyMerchantLocation
} = await import('./account.js');

const { rateMerchant, getMerchantRatings } = await import('./ratings.js');

const $ = (id) => document.getElementById(id);

// ============================================================
// ✅ XSS Protection
// ============================================================
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeJs(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

// ============================================================
// State
// ============================================================
let currentProfile = null;
let currentMerchant = null;
let allMerchants = [];
let allOffers = []; 
let userLat = null, userLng = null;
let searchQuery = '';
let homeRadius = 2, homeCategories = ['all'], homeSubCategories = [], homeSort = 'nearest';
let offersCategories = ['all'], offersSubCategories = [];
let currentModalMerchant = null;
let uploadedReqImage = null;
let currentReqFilter = 'all';
let myRequestsCache = [];
let myOfferRequestsCache = [];
let myPendingInvoicesCache = [];
let adminData = { merchants: [], customers: [], invoices: [] };
let expectedLogin = null;
let uploadedOfferImage = null;
let uploadedEditOfferImage = null;
let selectedRating = 0;
let lastRatedMerchantId = null;
let lastRatedMerchantName = '';
let viewMode = 'all';
let currentOfferFullData = null;
let pendingGoogleUser = null;
let searchDebounceTimer = null;

// ✅ متغيرات الأداء والـ Lazy Loading
let offersDisplayCount = 20;
let merchantsDisplayCount = 20;

// ============================================================
// ✅ Load merchants & offers
// ============================================================
async function loadMerchants() {
  try {
    const [merchantsResult, offersResult, ratingsResult] = await Promise.all([
      supabase.from('merchants').select('*').eq('frozen', false),
      supabase.from('offers').select('*').limit(200), // ✅ قللنا العروض عشان السرعة
      supabase.from('ratings').select('merchant_id, stars') // ✅ سحبنا النجوم بس
    ]);

    if (merchantsResult.error) return [];

    const merchantsData = merchantsResult.data || [];
    allOffers = offersResult.data || []; 
    const allRatings = ratingsResult.data || [];

    // ربط العروض بالمتاجر
    const offersByMerchant = {};
    allOffers.forEach(o => {
      if (!offersByMerchant[o.merchant_id]) offersByMerchant[o.merchant_id] = [];
      offersByMerchant[o.merchant_id].push(o);
    });

    const ratingsByMerchant = {};
    allRatings.forEach(r => {
      if (!ratingsByMerchant[r.merchant_id]) ratingsByMerchant[r.merchant_id] = [];
      ratingsByMerchant[r.merchant_id].push(r);
    });

    // ✅ السحر هنا: بنربط بيانات المتجر بالعرض في الذاكرة عشان منتقلش الداتابيز تاني
    allOffers = allOffers.map(o => {
      const merchant = merchantsData.find(m => m.id === o.merchant_id);
      return { ...o, merchants: merchant || {} };
    });

    return merchantsData.map(m => ({
      ...m,
      offers: offersByMerchant[m.id] || [],
      ratings: ratingsByMerchant[m.id] || []
    }));
  } catch (err) {
    return [];
  }
}

// ============================================================
// Helpers
// ============================================================
function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
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
  return Math.max(...m.offers.map(o => parseInt(o.discount_value) || 0));
}

function getAvgRating(m) {
  if (!m.ratings || !m.ratings.length) return null;
  return (m.ratings.reduce((s, r) => s + r.stars, 0) / m.ratings.length).toFixed(1);
}

function getRoleName(role) {
  return { customer: '👤 عميل', merchant: '🏪 تاجر', admin: '👑 أدمن' }[role] || role;
}

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

function matchesCatSubs(m, cats, subs) {
  if (!cats.includes('all') && !cats.includes(m.category)) return false;
  if (subs.length) {
    if (!m.sub_categories || !m.sub_categories.length) return false;
    if (!m.sub_categories.some(s => subs.includes(s))) return false;
  }
  return true;
}

function logoImgHtml(m) {
  if (m.logo_url) {
    return `<img src="${escapeHtml(m.logo_url)}" alt="${escapeHtml(m.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit" onerror="this.parentElement.innerHTML='${escapeHtml(m.icon || '🏪')}'">`;
  }
  return escapeHtml(m.icon || '🏪');
}

// ============================================================
// ✅ Render: merchants list
// ============================================================
function renderMerchantsList() {
  let list = [...allMerchants];
  const el = $('merchantsList');
  if (!el) return;

  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    const matchingOffers = [];
    allMerchants.forEach(m => {
      (m.offers || []).forEach(o => {
        const title = (o.title || '').toLowerCase();
        const desc = (o.description || '').toLowerCase();
        if (title.includes(q) || desc.includes(q)) {
          matchingOffers.push({ offer: o, merchant: m });
        }
      });
    });

    const matchingMerchants = allMerchants.filter(m => m.name && m.name.toLowerCase().includes(q));

    if (!matchingOffers.length && !matchingMerchants.length) {
      el.innerHTML = `<div class="no-requests">😅 لا توجد نتائج للبحث "${escapeHtml(searchQuery)}"</div>`;
      return;
    }

    let html = '';
    if (matchingOffers.length) {
      html += `<div class="section-title"><h3>🎁 عروض مطابقة (${matchingOffers.length})</h3></div>`;
      html += matchingOffers.map(({ offer, merchant }) => {
        const imgHtml = offer.image_url ? `<img src="${escapeHtml(offer.image_url)}" style="width:100%;max-width:220px;height:140px;object-fit:cover;border-radius:10px;margin-bottom:8px;display:block" onerror="this.style.display='none'">` : '';
        const descHtml = offer.description ? `<p style="font-size:13px;color:#4b5563;margin-top:6px">${escapeHtml(offer.description)}</p>` : '';
        const priceHtml = offer.price ? `<div style="font-size:15px;color:#10b981;font-weight:700;margin-bottom:4px">💰 ${parseFloat(offer.price).toFixed(2)} ج</div>` : '';
        const logoHtml = merchant.logo_url ? `<img src="${escapeHtml(merchant.logo_url)}" style="width:24px;height:24px;border-radius:6px;object-fit:cover;vertical-align:middle">` : `<span style="font-size:16px">${escapeHtml(merchant.icon || '🏪')}</span>`;

        return `
          <div onclick="window.openOfferFull('${escapeJs(offer.id)}','${escapeJs(merchant.id)}')"
               style="background:#f9fafb;padding:16px;border-radius:14px;margin-bottom:14px;border-right:4px solid #ff6b35;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.05)">
            ${imgHtml}
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
              <div style="flex:1">
                <h5 style="font-size:16px;margin-bottom:6px;color:var(--primary);font-weight:700">${escapeHtml(offer.title)}</h5>
                ${priceHtml}${descHtml}
                <div style="font-size:12px;color:#6b7280;margin-top:6px">${logoHtml} ${escapeHtml(merchant.name)}</div>
              </div>
              <div style="background:#1a2a6c;color:#fff;padding:8px 16px;border-radius:30px;font-weight:700;font-size:15px;white-space:nowrap">${escapeHtml(offer.discount)}</div>
            </div>
          </div>`;
      }).join('');
    }

    if (matchingMerchants.length) {
      html += `<div class="section-title" style="margin-top:20px"><h3>🏪 متاجر مطابقة (${matchingMerchants.length})</h3></div>`;
      html += matchingMerchants.map(m => {
        const rate = m.cashback_rate || 15;
        const tier = getTier(rate);
        return `
          <div class="store-item" onclick="window.openMerchant('${escapeJs(m.bank_code)}')">
            <div class="icon" style="overflow:hidden">${logoImgHtml(m)}</div>
            <div class="info">
              <h4>${escapeHtml(m.name)} <span class="tier-chip ${tier.cls}">${tier.icon} ${tier.name}</span></h4>
              <div class="desc">${(m.offers || []).length} عرض • كاش باك ${rate}%</div>
            </div>
            <div class="badge">${rate}%</div>
          </div>`;
      }).join('');
    }
    el.innerHTML = html;
    return;
  }

  list = list.filter(m => matchesCatSubs(m, homeCategories, homeSubCategories));

  if (viewMode === 'shop') {
    list = list.filter(m => m.merchant_type !== 'warehouse');
  } else if (viewMode === 'online') {
    list = list.filter(m => m.merchant_type !== 'shop');
    const radiusControl = document.querySelector('.radius-control');
    if (radiusControl) radiusControl.style.display = 'none';
  } else {
    const radiusControl = document.querySelector('.radius-control');
    if (radiusControl) radiusControl.style.display = 'block';
  }

  const radius = parseFloat(homeRadius) || 2;
  if (viewMode !== 'online' && userLat !== null && userLng !== null) {
    list = list.map(m => ({ ...m, _dist: (m.lat && m.lng) ? calcDistance(userLat, userLng, m.lat, m.lng) : null })).filter(m => m._dist === null || m._dist <= radius);
  }

  if (homeSort === 'nearest' && userLat !== null) list.sort((a, b) => (a._dist || 0) - (b._dist || 0));
  else if (homeSort === 'cashback') list.sort((a, b) => (b.cashback_rate || 0) - (a.cashback_rate || 0));
  else if (homeSort === 'discount') list.sort((a, b) => getMaxDiscount(b) - getMaxDiscount(a));

  if (!list.length) {
    el.innerHTML = `<div class="no-requests">😅 لا توجد نتائج في نطاق ${escapeHtml(String(radius))} كم</div>`;
    return;
  }

  const displayList = list.slice(0, merchantsDisplayCount);
  const hasMore = list.length > merchantsDisplayCount;

  el.innerHTML = displayList.map(m => {
    const rate = m.cashback_rate || 15;
    const tier = getTier(rate);
    const maxDisc = getMaxDiscount(m);
    const rating = getAvgRating(m);
    const isWarehouse = m.merchant_type === 'warehouse';
    const dist = (!isWarehouse && m._dist) ? m._dist.toFixed(2) + ' كم' : (isWarehouse ? '📦 مخزن' : '');
    let subNames = '';
    if (m.sub_categories && m.sub_categories.length) {
      const l = SUB_CATEGORIES[m.category] || [];
      subNames = m.sub_categories.map(id => (l.find(x => x.id === id) || {}).name || id).join(', ');
    }

    return `
      <div class="store-item" onclick="window.openMerchant('${escapeJs(m.bank_code)}')">
        <div class="icon" style="overflow:hidden">${logoImgHtml(m)}</div>
        <div class="info">
          <h4>${escapeHtml(m.name)} <span class="tier-chip ${tier.cls}">${tier.icon} ${tier.name}</span></h4>
          <div class="desc">${dist ? dist + ' • ' : ''}${(m.offers || []).length} عرض • كاش باك ${rate}%${maxDisc ? ' • خصم لحد ' + maxDisc + '%' : ''}</div>
          ${subNames ? `<div style="font-size:11px;color:#8b5cf6;margin-top:2px">${escapeHtml(subNames)}</div>` : ''}
          ${m.delivery_available ? '<div style="font-size:11px;color:#10b981;margin-top:2px">🛵 التوصيل متاح</div>' : ''}
          <div style="font-size:12px;color:#f59e0b;margin-top:2px">${rating ? '⭐'.repeat(Math.floor(rating)) + ' ' + rating : '⭐ لا تقييمات'}</div>
        </div>
        <div class="badge">${rate}%</div>
      </div>
    `;
  }).join('');

  if (hasMore) {
    el.innerHTML += `<div style="text-align:center;margin:15px 0"><button onclick="window.loadMoreMerchants()" style="background:#fff;color:#1a2a6c;border:2px solid #1a2a6c;padding:10px 30px;border-radius:30px;font-weight:700;cursor:pointer">شوف المزيد من المتاجر 👇</button></div>`;
  }
}

window.loadMoreMerchants = function() {
  merchantsDisplayCount += 20;
  renderMerchantsList();
};

// ============================================================
// ✅ Render: Top Deals & Offers Grid (NOON STYLE & LAZY)
// ============================================================
function renderTopDeals() {
  const sorted = [...allOffers].sort((a, b) => (b.discount_value || 0) - (a.discount_value || 0)).slice(0, 10);
  const el = $('dealsScroll');
  if (!el) return;
  if (!sorted.length) { el.innerHTML = ''; return; }

  el.innerHTML = sorted.map(o => {
    const m = o.merchants || {};
    const imgSrc = o.image_url ? o.image_url : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(o.title || 'عرض') + '&background=f3f4f6&color=6b7280&size=200';
    return `
      <div class="noon-card" style="min-width:160px;width:160px" onclick="window.openOfferFull('${escapeJs(o.id)}','${escapeJs(o.merchant_id || m.id)}')">
        <div class="noon-discount-circle" style="width:35px;height:35px;font-size:11px">${escapeHtml(o.discount)}</div>
        <img src="${escapeHtml(imgSrc)}" style="height:120px" alt="${escapeHtml(o.title)}" onerror="this.src='https://ui-avatars.com/api/?name=Offer&background=f3f4f6&color=6b7280'">
        <div class="noon-body" style="padding:8px">
          <h4 class="noon-title" style="font-size:12px;height:32px">${escapeHtml(o.title)}</h4>
          <div class="noon-merchant" style="margin-bottom:4px">
            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(m.name || '')}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderOffersGrid() {
  let list = [...allOffers];
  const el = $('offersGrid');
  if (!el) return;

  if (!offersCategories.includes('all')) list = list.filter(o => o.category && offersCategories.includes(o.category));
  if (offersSubCategories.length > 0) list = list.filter(o => o.sub_category && offersSubCategories.includes(o.sub_category));

  if (!list.length) {
    const isMerchant = currentProfile && currentProfile.role === 'merchant';
    const addOfferBtn = isMerchant ? `<button onclick="window.switchTab('dashboard')" style="background:#ff6b35;color:#fff;border:none;padding:12px 24px;border-radius:30px;font-weight:600;cursor:pointer;margin-top:15px">➕ أضف عرضك</button>` : '';
    el.innerHTML = `<div style="text-align:center;padding:40px;color:#6b7280;grid-column:1/-1"><div style="font-size:48px;margin-bottom:10px">🎁</div><p style="margin-bottom:15px;font-weight:600">لا توجد عروض حالياً في هذا القسم</p>${addOfferBtn}</div>`;
    return;
  }

  const displayList = list.slice(0, offersDisplayCount);
  const hasMore = list.length > offersDisplayCount;

  el.innerHTML = displayList.map(o => {
    const m = o.merchants || {};
    const rate = m.cashback_rate || 15;
    const tier = getTier(rate);
    const imgSrc = o.image_url ? o.image_url : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(o.title || 'عرض') + '&background=f3f4f6&color=6b7280&size=200';
    const logoHtml = m.logo_url ? `<img src="${escapeHtml(m.logo_url)}" style="width:16px;height:16px;border-radius:4px;object-fit:cover">` : `<span style="font-size:14px">${escapeHtml(m.icon || '🏪')}</span>`;

    return `
      <div class="noon-card" onclick="window.openOfferFull('${escapeJs(o.id)}','${escapeJs(o.merchant_id || m.id)}')">
        <div class="noon-discount-circle"><span>${escapeHtml(o.discount)}</span></div>
        <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(o.title)}" onerror="this.src='https://ui-avatars.com/api/?name=Offer&background=f3f4f6&color=6b7280'">
        <div class="noon-body">
          <h4 class="noon-title">${escapeHtml(o.title)}</h4>
          ${o.price ? `<div style="font-size:16px;font-weight:800;color:#10b981;margin-bottom:6px">💰 ${parseFloat(o.price).toFixed(2)} ج</div>` : ''}
          <div class="noon-merchant">
            ${logoHtml}
            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(m.name || 'متجر')}</span>
            <span style="margin-right:auto;font-size:12px">${tier.icon}</span>
          </div>
          <div class="noon-cashback">كاش باك ${rate}%</div>
        </div>
      </div>
    `;
  }).join('');

  if (hasMore) {
    el.innerHTML += `<div style="grid-column: 1 / -1; text-align: center; margin-top: 15px; margin-bottom: 25px;"><button onclick="window.loadMoreOffers()" style="background: #fff; color: #1a2a6c; border: 2px solid #1a2a6c; padding: 10px 30px; border-radius: 30px; font-weight: 700; font-size: 14px; cursor: pointer;">شوف المزيد 👇</button></div>`;
  }
}

window.loadMoreOffers = function() {
  offersDisplayCount += 20;
  renderOffersGrid();
};
window.resetOffersLimit = function() { offersDisplayCount = 20; };

// ============================================================
// ✅ Categories
// ============================================================
function renderSubCategoriesGeneric({ categories, subs, wrapperEl, containerEl, onToggle }) {
  if (!wrapperEl || !containerEl) return;
  const singleCat = categories.length === 1 && categories[0] !== 'all' ? categories[0] : null;
  if (!singleCat || !SUB_CATEGORIES[singleCat]) { wrapperEl.style.display = 'none'; return; }
  wrapperEl.style.display = 'block';
  const list = SUB_CATEGORIES[singleCat];
  containerEl.innerHTML = list.map(sub => `<button class="category-chip ${subs.includes(sub.id) ? 'active' : ''}" data-sub="${escapeHtml(sub.id)}">${escapeHtml(sub.name)}</button>`).join('');
  containerEl.querySelectorAll('.category-chip').forEach(btn => {
    btn.addEventListener('click', () => onToggle(btn.dataset.sub, btn));
  });
}

function toggleCategoryGeneric({ cat, chip, categories, subs, containerId, onUpdate }) {
  if (cat === 'all') {
    categories.length = 0; categories.push('all');
    subs.length = 0;
    document.querySelectorAll(`#${containerId} .category-chip`).forEach(c => { c.classList.toggle('active', c.dataset.cat === 'all'); });
  } else {
    const ai = categories.indexOf('all');
    if (ai > -1) categories.splice(ai, 1);
    document.querySelector(`#${containerId} .category-chip[data-cat="all"]`)?.classList.remove('active');
    const idx = categories.indexOf(cat);
    if (idx > -1) { categories.splice(idx, 1); chip.classList.remove('active'); }
    else { categories.push(cat); chip.classList.add('active'); }
    if (categories.length === 0) {
      categories.push('all');
      document.querySelector(`#${containerId} .category-chip[data-cat="all"]`)?.classList.add('active');
    }
  }
  onUpdate();
}

function renderHomeSubCategories() {
  renderSubCategoriesGeneric({
    categories: homeCategories, subs: homeSubCategories, wrapperEl: $('homeSubWrapper'), containerEl: $('homeSubCategories'),
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
    categories: offersCategories, subs: offersSubCategories, wrapperEl: $('offersSubWrapper'), containerEl: $('offersSubCategories'),
    onToggle: (id, btn) => {
      const i = offersSubCategories.indexOf(id);
      if (i > -1) { offersSubCategories.splice(i, 1); btn.classList.remove('active'); }
      else { offersSubCategories.push(id); btn.classList.add('active'); }
      if (window.resetOffersLimit) window.resetOffersLimit();
      renderOffersGrid();
    }
  });
}

window.onOfferCategoryChange = function(category) {
  const subWrap = $('offerSubCategoryWrap');
  const subSelect = $('offerSubCategory');
  if (!category) { subWrap.style.display = 'none'; subSelect.innerHTML = '<option value="">اختار التصنيف الفرعي</option>'; return; }
  const subs = SUB_CATEGORIES[category] || [];
  if (subs.length === 0) { subWrap.style.display = 'none'; subSelect.innerHTML = '<option value="">اختار التصنيف الفرعي</option>'; return; }
  subSelect.innerHTML = '<option value="">اختار التصنيف الفرعي</option>' + subs.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join('');
  subWrap.style.display = 'block';
};

window.onEditOfferCategoryChange = function(category) {
  const subWrap = $('editOfferSubCategoryWrap');
  const subSelect = $('editOfferSubCategory');
  if (!category) { subWrap.style.display = 'none'; subSelect.innerHTML = '<option value="">اختار التصنيف الفرعي</option>'; return; }
  const subs = SUB_CATEGORIES[category] || [];
  if (subs.length === 0) { subWrap.style.display = 'none'; subSelect.innerHTML = '<option value="">اختار التصنيف الفرعي</option>'; return; }
  subSelect.innerHTML = '<option value="">اختار التصنيف الفرعي</option>' + subs.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join('');
  subWrap.style.display = 'block';
};

// ============================================================
// ✅ Open Merchant Modal
// ============================================================
async function openMerchant(bankCode) {
  const m = allMerchants.find(x => x.bank_code === bankCode);
  if (!m) return;
  currentModalMerchant = m;
  trackOfferEvent({ offerId: null, merchantId: m.id, eventType: 'click' });

  const rate = m.cashback_rate || 15;
  const tier = getTier(rate);
  const isWarehouse = m.merchant_type === 'warehouse';
  const logoHtml = m.logo_url ? `<img src="${escapeHtml(m.logo_url)}" style="width:70px;height:70px;object-fit:cover;border-radius:16px;margin:0 auto 10px;display:block">` : `<div style="font-size:60px;text-align:center">${escapeHtml(m.icon || '🏪')}</div>`;

  $('modalMerchantName').innerHTML = `${logoHtml}<div style="text-align:center;margin-top:6px">${escapeHtml(m.name)}</div>`;
  $('modalMerchantInfo').innerHTML = `${escapeHtml(m.icon || '🏪')} • ${(m.offers || []).length} عرض • <span class="tier-chip ${tier.cls}">${tier.icon} ${tier.name}</span> • كاش باك <strong>${rate}%</strong>${m.delivery_available ? ' • 🛵 توصيل متاح' : ''}${isWarehouse ? ' • 📦 مخزن' : ''}`;

  const offerViews = await getMerchantOffersViews(m.id).catch(() => ({}));
  const sortedOffers = [...(m.offers || [])].sort((a, b) => (offerViews[b.id] || 0) - (offerViews[a.id] || 0));
  const topOfferId = sortedOffers.length > 0 && (offerViews[sortedOffers[0].id] || 0) > 0 ? sortedOffers[0].id : null;

  $('modalOffersList').innerHTML = (sortedOffers || []).length
    ? sortedOffers.map((o, i) => {
        const imgHtml = o.image_url ? `<img src="${escapeHtml(o.image_url)}" onclick="event.stopPropagation(); window.openImageLightbox('${escapeJs(o.image_url)}')" style="width:100%;max-width:220px;height:140px;object-fit:cover;border-radius:10px;margin-bottom:8px;cursor:zoom-in;display:block">` : '';
        const descHtml = o.description ? `<p style="font-size:13px;color:#4b5563;margin-top:6px">${escapeHtml(o.description)}</p>` : '';
        const priceHtml = o.price ? `<div style="font-size:15px;color:#10b981;font-weight:700;margin-bottom:4px">💰 ${parseFloat(o.price).toFixed(2)} ج</div>` : '';
        const viewsCount = offerViews[o.id] || 0;
        const viewsHtml = viewsCount > 0 ? `<span style="font-size:11px;color:#f59e0b;margin-right:8px">👁️ ${viewsCount} مشاهدة</span>` : '';
        const hotBadge = o.id === topOfferId ? `<div style="background:#ff6b35;color:#fff;font-size:11px;padding:3px 10px;border-radius:20px;font-weight:700;display:inline-block;margin-bottom:6px">🔥 الأكثر مشاهدة</div>` : '';

        return `
          <div onclick="window.openOfferFull('${escapeJs(o.id)}','${escapeJs(m.id)}')" style="background:#f9fafb;padding:16px;border-radius:14px;margin-bottom:14px;border-right:4px solid #ff6b35;cursor:pointer;transition:all 0.2s;box-shadow:0 2px 6px rgba(0,0,0,0.05)" onmouseover="this.style.background='#f0f4ff'" onmouseout="this.style.background='#f9fafb'">
            ${hotBadge}${imgHtml}
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
              <div style="flex:1">
                <h5 style="font-size:16px;margin-bottom:6px;color:var(--primary);font-weight:700">${escapeHtml(o.title)}</h5>
                ${priceHtml}${descHtml}
                <p style="font-size:11px;color:#9ca3af;margin-top:6px">عرض ${i + 1} من ${m.offers.length} • ${viewsHtml}</p>
              </div>
              <div style="background:#1a2a6c;color:#fff;padding:8px 16px;border-radius:30px;font-weight:700;font-size:15px;white-space:nowrap">${escapeHtml(o.discount)}</div>
            </div>
          </div>`;
      }).join('')
    : '<p style="text-align:center;color:#6b7280;padding:20px">لا توجد عروض حالياً</p>';

  const modal = $('merchantModal');
  modal.classList.add('active');
  modal.style.display = 'flex';

  const oldActions = modal.querySelector('.modal-actions-bar');
  if (oldActions) oldActions.remove();

  const actionsBar = document.createElement('div');
  actionsBar.className = 'modal-actions-bar';
  actionsBar.style.cssText = 'margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid #eee;padding-top:14px';

  if (m.lat && m.lng && m.merchant_type !== 'warehouse') {
    actionsBar.innerHTML = `
      <button onclick="window.openMerchantMap('${escapeJs(m.lat)}','${escapeJs(m.lng)}','${escapeJs(m.id)}')" style="flex:1;background:#1a2a6c;color:#fff;border:none;padding:12px;border-radius:30px;font-weight:600;cursor:pointer">📍 الموقع على الخريطة</button>
      ${m.delivery_available ? `<button onclick="window.contactDelivery('${escapeJs(m.delivery_phone || m.phone)}','${escapeJs(m.id)}')" style="flex:1;background:#ff6b35;color:#fff;border:none;padding:12px;border-radius:30px;font-weight:600;cursor:pointer">🛵 اتصل للتوصيل</button>` : ''}
    `;
  } else if (m.delivery_available) {
    actionsBar.innerHTML = `<button onclick="window.contactDelivery('${escapeJs(m.delivery_phone || m.phone)}','${escapeJs(m.id)}')" style="flex:1;background:#ff6b35;color:#fff;border:none;padding:12px;border-radius:30px;font-weight:600;cursor:pointer">🛵 اتصل للتوصيل</button>`;
  }
  if (actionsBar.innerHTML.trim()) modal.querySelector('.modal-box').appendChild(actionsBar);

  $('modalRatingsContent').innerHTML = '<p style="color:#9ca3af;font-size:13px;text-align:center">جاري التحميل...</p>';
  getMerchantRatings(m.id).then(ratings => {
    if (!ratings.length) {
      $('modalRatingsContent').innerHTML = '<p style="color:#9ca3af;font-size:13px;text-align:center">لا توجد تقييمات بعد</p>';
    } else {
      $('modalRatingsContent').innerHTML = ratings.slice(0, 10).map(r => {
        const name = r.profiles?.name || 'عميل';
        return `<div class="rating-item"><div class="name">👤 ${escapeHtml(name)}</div><div class="stars-row">${'⭐'.repeat(r.stars)}</div>${r.comment ? `<div class="comment">${escapeHtml(r.comment)}</div>` : ''}<div class="date">${new Date(r.created_at).toLocaleDateString('ar-EG')}</div></div>`;
      }).join('');
    }
  }).catch(() => { $('modalRatingsContent').innerHTML = '<p style="color:#ef4444;font-size:12px">تعذر تحميل التقييمات</p>'; });
}

function closeMerchantModal() {
  const modal = $('merchantModal');
  if (!modal) return;
  modal.classList.remove('active');
  modal.style.display = 'none';
  currentModalMerchant = null;
}
window.closeMerchantModal = closeMerchantModal;
function closeModal(e) { if (e && e.target && e.target.classList.contains('modal-overlay')) closeMerchantModal(); }

// ============================================================
// ✅ Offer Full View (Fixed)
// ============================================================
window.openOfferFull = async function(offerId, merchantId) {
  const o = allOffers.find(x => x.id === offerId);
  if (!o) { toast('❌ العرض غير موجود', 'error'); return; }
  let m = allMerchants.find(x => x.id === merchantId) || o.merchants;
  if (!m) { toast('❌ التاجر غير موجود', 'error'); return; }

  currentOfferFullData = { offer: o, merchant: m };
  trackOfferEvent({ offerId: o.id, merchantId: m.id, eventType: 'view' });

  let viewsCount = 0;
  try { const views = await getMerchantOffersViews(m.id); viewsCount = views[o.id] || 0; } catch (e) { console.error(e); }

  const logoHtml = m.logo_url ? `<img src="${escapeHtml(m.logo_url)}" alt="${escapeHtml(m.name)}">` : `<span style="font-size:20px">${escapeHtml(m.icon || '🏪')}</span>`;
  $('offerFullMerchant').innerHTML = `${logoHtml}<span>${escapeHtml(m.name)}</span>`;

  if (o.image_url) { $('offerFullImage').src = o.image_url; $('offerFullImageWrap').style.display = 'block'; }
  else { $('offerFullImageWrap').style.display = 'none'; }

  $('offerFullDiscount').innerText = o.discount || '---';
  $('offerFullTitle').innerText = o.title || 'عرض';
  if (o.price) { $('offerFullPrice').innerText = `💰 ${parseFloat(o.price).toFixed(2)} ج`; $('offerFullPrice').style.display = 'block'; }
  else { $('offerFullPrice').style.display = 'none'; }
  if (o.description) { $('offerFullDesc').innerText = o.description; $('offerFullDesc').style.display = 'block'; }
  else { $('offerFullDesc').style.display = 'none'; }

  $('offerFullStats').innerHTML = `<span>👁️ ${viewsCount} مشاهدة</span><span>🏪 ${escapeHtml(m.name)}</span>${m.delivery_available ? '<span>🛵 التوصيل متاح</span>' : ''}`;

  const safeTitle = escapeJs(o.title || '');
  const requestBtnHtml = `<button onclick="window.openRequestOfferModal('${escapeJs(o.id)}','${escapeJs(m.id || merchantId)}','${safeTitle}')" style="width:100%;background:linear-gradient(135deg,#ff6b35,#f7931e);color:#fff;border:none;padding:16px;border-radius:30px;font-weight:800;font-size:16px;cursor:pointer;margin-bottom:10px;box-shadow:0 4px 12px rgba(255,107,53,0.4)">📩 اطلب العرض ده</button>`;

  let actionsHtml = '';
  if (m.lat && m.lng && m.merchant_type !== 'warehouse') actionsHtml += `<button onclick="window.openMerchantMap('${escapeJs(m.lat)}','${escapeJs(m.lng)}','${escapeJs(m.id || merchantId)}')" style="background:#1a2a6c">📍 الموقع على الخريطة</button>`;
  $('offerFullActions').innerHTML = requestBtnHtml + (actionsHtml || '');

  const typeLabel = m.merchant_type === 'warehouse' ? '📦 مخزن' : (m.merchant_type === 'both' ? '🔄 محل ومخزن' : '🏪 محل');
  $('offerFullMerchantInfo').innerHTML = `<div><strong>🏪 ${escapeHtml(m.name)}</strong> ${typeLabel}</div>${m.category ? `<div>📂 التصنيف: ${escapeHtml(m.category)}</div>` : ''}${m.lat && m.lng && m.merchant_type !== 'warehouse' ? `<div>📍 ${m.lat.toFixed(4)}, ${m.lng.toFixed(4)}</div>` : ''}<div>💰 نسبة الكاش باك: ${m.cashback_rate || 15}%</div>`;

  const modal = $('offerFullModal');
  modal.style.display = 'flex';
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
};

window.closeOfferFull = function(e) {
  if (e && e.target && !e.target.classList.contains('modal-overlay')) return;
  const modal = $('offerFullModal');
  if (!modal) return;
  modal.classList.remove('active');
  modal.style.display = 'none';
  document.body.style.overflow = '';
};

// ============================================================
// ✅ Request Offer Modal
// ============================================================
window.openRequestOfferModal = function(offerId, merchantId, offerTitle) {
  $('reqOfferId').value = offerId;
  $('reqOfferMerchantId').value = merchantId;
  $('reqOfferTitle').innerText = offerTitle;
  $('reqOfferNote').value = '';
  $('reqOfferResult').innerText = '';
  const modal = $('requestOfferModal');
  modal.style.display = 'flex';
  modal.classList.add('active');
};

window.closeRequestOfferModal = function(e) {
  if (e && e.target && !e.target.classList.contains('modal-overlay')) return;
  const modal = $('requestOfferModal');
  if (!modal) return;
  modal.classList.remove('active');
  modal.style.display = 'none';
};

async function handleSendOfferRequest() {
  const offerId = $('reqOfferId').value;
  const merchantId = $('reqOfferMerchantId').value;
  const offerTitle = $('reqOfferTitle').innerText;
  const note = $('reqOfferNote').value.trim();
  const res = $('reqOfferResult');

  if (!currentProfile || currentProfile.role !== 'customer') { res.style.color = '#ef4444'; res.innerText = '❌ لازم تسجل دخول كعميل'; return; }

  const btn = $('sendOfferRequestBtn');
  btn.disabled = true; btn.innerText = '⏳ جاري الإرسال...';

  try {
    await requestSpecificOffer({ offerId, merchantId, offerTitle, note });
    res.style.color = '#10b981'; res.innerText = '✅ تم إرسال طلبك للتاجر';
    setTimeout(() => {
      window.closeRequestOfferModal();
      btn.disabled = false; btn.innerText = '📩 إرسال الطلب';
      if (currentProfile.role === 'customer') renderRequestsTab('offer');
    }, 1500);
  } catch (e) { res.style.color = '#ef4444'; res.innerText = '❌ ' + e.message; btn.disabled = false; btn.innerText = '📩 إرسال الطلب'; }
}

// ============================================================
// ✅ Tabs
// ============================================================
function updateTabsVisibility() {
  if (!currentProfile) return;
  const role = currentProfile.role;
  document.querySelectorAll('#mainTabs .tab-btn').forEach(btn => {
    const r = btn.dataset.role;
    if (r === 'all') btn.style.display = 'block';
    else if (r === 'customer') btn.style.display = role === 'customer' ? 'block' : 'none';
    else if (r === 'merchant') btn.style.display = role === 'merchant' ? 'block' : 'none';
    else if (r === 'admin') btn.style.display = role === 'admin' ? 'block' : 'none';
  });
}

function switchTab(name) {
  document.querySelectorAll('#mainTabs .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(c => {
    const isTarget = c.id === 'tab-' + name;
    c.classList.toggle('active', isTarget);
    c.style.display = isTarget ? 'block' : 'none';
  });
  
  if (name === 'offers') { offersDisplayCount = 20; renderOffersGrid(); renderOffersSubCategories(); }
  if (name === 'invoice') renderInvoiceTab();
  if (name === 'special_requests') renderRequestsTab('special');
  if (name === 'offer_requests') renderRequestsTab('offer');
  if (name === 'dashboard' && currentMerchant) renderDashboard();
  if (name === 'reports' && currentMerchant) renderReports('all');
  if (name === 'analytics' && currentMerchant) renderAnalyticsTab();
  if (name === 'admin') renderAdminSection('dashboard');
  if (name === 'account') setTimeout(initAccountMapUI, 300);
}

// ============================================================
// ✅ INVOICE
// ============================================================
async function renderInvoiceTab() {
  if (!currentProfile) return;
  if (currentProfile.role === 'merchant' && currentMerchant) {
    $('invBankCodeGroup').style.display = 'none';
    await renderMerchantInvoiceExtras();
  } else {
    $('invBankCodeGroup').style.display = 'block';
    $('merchantCashbackCard').style.display = 'none';
    $('merchantWalletsCard').style.display = 'none';
    $('merchantInvoicesCard').style.display = 'none';
  }
  if (currentProfile.role === 'customer') await renderMyPendingInvoices();
  await renderMyWalletAndInvoices();
}

async function renderMyPendingInvoices() {
  const el = $('customerPendingInvoicesList');
  const card = $('customerPendingInvoicesCard');
  if (!el || !card) return;

  try {
    myPendingInvoicesCache = await getMyPendingInvoices(currentProfile.phone);
    if (!myPendingInvoicesCache.length) { card.style.display = 'none'; return; }
    card.style.display = 'block';
    el.innerHTML = myPendingInvoicesCache.map(inv => {
      const m = inv.merchants || {};
      return `<div style="background:#fffbeb;padding:12px;border-radius:12px;margin-bottom:8px;border-right:4px solid #f59e0b">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">
          <strong style="color:#92400e">📄 #${escapeHtml(inv.number)}</strong>
          <span style="color:#ff6b35;font-weight:700">${parseFloat(inv.amount).toFixed(2)} ج</span>
        </div>
        <div style="font-size:13px;color:#6b7280;margin-top:4px">🏪 ${escapeHtml(m.icon || '🏪')} ${escapeHtml(m.name || '')}</div>
        <div style="font-size:13px;color:#10b981;font-weight:700;margin-top:4px">💰 كاش باك متوقع: ${parseFloat(inv.cashback || 0).toFixed(2)} ج</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:2px">🕒 ${new Date(inv.created_at).toLocaleString('ar-EG')}</div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
          <button class="admin-btn success" onclick="window.confirmInvoiceClick('${escapeJs(inv.id)}')">✅ استلمت البضاعة</button>
          <button class="admin-btn danger" onclick="window.rejectInvoiceClick('${escapeJs(inv.id)}')">❌ مش استلمت</button>
        </div>
      </div>`;
    }).join('');
    updateInvoiceBadge();
  } catch (e) {
    console.error('Pending invoices error:', e);
    card.style.display = 'none';
  }
}

window.confirmInvoiceClick = async function(invoiceId) {
  if (!confirm('متأكد إنك استلمت البضاعة؟')) return;
  try {
    await confirmInvoice(invoiceId);
    toast('✅ تم تأكيد الفاتورة - الكاش باك اتضاف', 'success');
    await renderInvoiceTab();
  } catch (e) { toast('❌ ' + e.message, 'error'); }
};

window.rejectInvoiceClick = async function(invoiceId) {
  const reason = prompt('اكتب سبب الرفض (اختياري):');
  if (reason === null) return;
  try {
    await rejectInvoice(invoiceId, reason);
    toast('❌ تم رفض الفاتورة', 'success');
    await renderInvoiceTab();
  } catch (e) { toast('❌ ' + e.message, 'error'); }
};

function updateInvoiceBadge() {
  const badge = $('invoiceBadge');
  if (!badge) return;
  if (myPendingInvoicesCache.length > 0) {
    badge.innerText = myPendingInvoicesCache.length > 9 ? '9+' : myPendingInvoicesCache.length;
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
}

async function renderMerchantInvoiceExtras() {
  $('merchantCashbackCard').style.display = 'block';
  $('merchantWalletsCard').style.display = 'block';
  $('merchantInvoicesCard').style.display = 'block';

  try {
    const s = await getMerchantCashbackSummary(currentMerchant.id);
    $('merCbGiven').innerText = s.cashbackGiven.toFixed(2) + ' ج';
    $('merCbSpent').innerText = s.cashbackSpent.toFixed(2) + ' ج';
    $('merCbRemaining').innerText = s.cashbackRemaining.toFixed(2) + ' ج';
    $('merNetSales').innerText = s.netSales.toFixed(2) + ' ج';
  } catch (e) { console.error(e); }

  try {
    const wallets = await getMerchantCustomerWallets(currentMerchant.id);
    const el = $('merchantWalletsList');
    if (!wallets.length) el.innerHTML = '<p style="color:#6b7280;font-size:14px">لا يوجد أرصدة</p>';
    else el.innerHTML = wallets.map(w => `
      <div style="background:#f9fafb;padding:10px 14px;border-radius:10px;margin-bottom:6px;border-right:4px solid #10b981">
        <div style="font-weight:600">${escapeHtml(w.profiles?.name || 'عميل')} (${escapeHtml(w.profiles?.phone || '?')})</div>
        <div style="font-size:13px;color:#10b981;font-weight:600;margin-top:4px">💰 ${parseFloat(w.balance).toFixed(2)} ج</div>
      </div>`).join('');
  } catch (e) { console.error(e); }

  try {
    const invoices = await getMerchantInvoices(currentMerchant.id);
    const el = $('merchantInvoicesList');
    if (!invoices.length) el.innerHTML = '<p style="color:#6b7280;font-size:14px">لا توجد فواتير</p>';
    else el.innerHTML = invoices.map(inv => {
      const statusBadge = inv.confirmation_status === 'confirmed' ? '<span style="background:#d1fae5;color:#065f46;font-size:11px;padding:2px 8px;border-radius:20px">✅ مؤكد</span>' : inv.confirmation_status === 'rejected' ? '<span style="background:#fee2e2;color:#991b1b;font-size:11px;padding:2px 8px;border-radius:20px">❌ مرفوض</span>' : inv.confirmation_status === 'expired' ? '<span style="background:#f3f4f6;color:#6b7280;font-size:11px;padding:2px 8px;border-radius:20px">⏰ ملغي</span>' : '<span style="background:#fef3c7;color:#92400e;font-size:11px;padding:2px 8px;border-radius:20px">⏳ في الانتظار</span>';
      return `<div style="background:#f9fafb;padding:10px 14px;border-radius:10px;margin-bottom:6px;border-right:4px solid #1a2a6c;font-size:13px">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">
          <strong>📄 #${escapeHtml(inv.number)}</strong>
          <span style="color:#ff6b35;font-weight:700">${parseFloat(inv.amount).toFixed(2)} ج</span>
        </div>
        <div style="color:#6b7280;margin-top:2px">📱 ${escapeHtml(inv.customer_phone || '')} • 💵 ${parseFloat(inv.cashback).toFixed(2)} ج ${statusBadge}</div>
      </div>`;
    }).join('');
  } catch (e) { console.error(e); }
}

async function renderMyWalletAndInvoices() {
  try {
    const wallets = await getMyWallets(currentProfile.id);
    const total = wallets.reduce((s, w) => s + parseFloat(w.balance || 0), 0);
    const shops = wallets.filter(w => parseFloat(w.balance) > 0).length;

    if (total > 0 || wallets.length > 0) {
      $('customerBalanceBanner').style.display = 'block';
      $('customerWalletsCard').style.display = 'block';
      $('customerRedeemCard').style.display = 'block';
      $('totalBalanceValue').innerText = total.toFixed(2) + ' ج';
      $('balanceShopsCount').innerText = shops;

      const active = wallets.filter(w => parseFloat(w.balance) > 0 || parseFloat(w.earned) > 0);
      const el = $('customerWalletsList');
      el.innerHTML = active.length ? active.map(w => {
        const m = w.merchants || {};
        return `<div style="background:#f9fafb;padding:10px 14px;border-radius:10px;margin-bottom:6px;border-right:4px solid #10b981">
          <div style="font-weight:600">${escapeHtml(m.icon || '🏪')} ${escapeHtml(m.name || '')}</div>
          <div style="font-size:14px;color:#10b981;font-weight:700;margin-top:4px">💰 ${parseFloat(w.balance).toFixed(2)} ج</div>
        </div>`;
      }).join('') : '<p style="color:#6b7280;font-size:14px">لا توجد أرصدة</p>';

      const sel = $('redeemMerchant');
      sel.innerHTML = '<option value="">اختار المتجر</option>' + active.filter(w => parseFloat(w.balance) > 0).map(w => {
        const m = w.merchants || {};
        return `<option value="${escapeHtml(w.merchant_id)}">${escapeHtml(m.icon || '')} ${escapeHtml(m.name || '')} - ${parseFloat(w.balance).toFixed(2)} ج</option>`;
      }).join('');
    } else {
      $('customerBalanceBanner').style.display = 'none';
      $('customerWalletsCard').style.display = 'none';
      $('customerRedeemCard').style.display = 'none';
    }
  } catch (e) { console.error(e); }

  try {
    const invoices = await getMyInvoices(currentProfile.phone);
    if (invoices.length) {
      $('customerInvoicesCard').style.display = 'block';
      $('customerInvoicesList').innerHTML = invoices.map(inv => {
        const m = inv.merchants || {};
        return `<div style="background:#f9fafb;padding:10px 14px;border-radius:10px;margin-bottom:6px;border-right:4px solid #1a2a6c;font-size:13px">
          <div><strong>📄 #${escapeHtml(inv.number)}</strong> • ${escapeHtml(m.icon || '')} ${escapeHtml(m.name || '')}</div>
          <div style="color:#6b7280;margin-top:2px">💰 ${parseFloat(inv.amount).toFixed(2)} ج • كاش باك ${parseFloat(inv.cashback).toFixed(2)} ج</div>
        </div>`;
      }).join('');
    } else $('customerInvoicesCard').style.display = 'none';
  } catch (e) { console.error(e); }
}

async function handleSubmitInvoice() {
  const num = $('invNumber').value.trim();
  const phone = $('invCustomerPhone').value.trim();
  const amount = parseFloat($('invAmount').value);
  const usedCashback = parseFloat($('invUsedCashback')?.value) || 0;
  const bankCode = $('invBankCode') ? getRealValue('invBankCode') : '';
  const res = $('invoiceResult');

  if (!num || !phone || !amount || amount <= 0) { res.style.color = '#ef4444'; res.innerText = '❌ املأ البيانات'; return; }
  if (usedCashback > amount) { res.style.color = '#ef4444'; res.innerText = '❌ رصيد الكاش باك أكبر من مبلغ الفاتورة'; return; }

  try {
    const check = await checkCustomerPhone(phone);
    if (!check || !check.ok) { res.style.color = '#ef4444'; res.innerText = '❌ ' + (check?.error || 'الرقم ده مش مسجل كعميل'); return; }
  } catch (err) { res.style.color = '#ef4444'; res.innerText = '❌ فشل التحقق من الرقم'; return; }

  const isMerchant = currentProfile.role === 'merchant' && currentMerchant;
  if (!isMerchant && !bankCode) { res.style.color = '#ef4444'; res.innerText = '❌ ادخل البنكود'; return; }

  try {
    let merchantId = null;
    let merchantName = '';
    if (isMerchant) {
      await createInvoice({ number: num, customerPhone: phone, amount, merchantId: currentMerchant.id, usedCashback });
      merchantId = currentMerchant.id;
      merchantName = currentMerchant.name;
      res.style.color = '#10b981'; res.innerText = `✅ تم رفع الفاتورة - في انتظار تأكيد العميل`;
    } else {
      await createInvoiceByBankCode({ number: num, customerPhone: phone, amount, bankCode, usedCashback });
      res.style.color = '#10b981'; res.innerText = `✅ تم رفع الفاتورة - في انتظار تأكيد العميل`;
      const m = allMerchants.find(x => (x.bank_code || '').toUpperCase() === bankCode.toUpperCase());
      if (m) { merchantId = m.id; merchantName = m.name; }
    }

    if (merchantId && currentProfile.role === 'customer') {
      lastRatedMerchantId = merchantId;
      lastRatedMerchantName = merchantName;
      selectedRating = 0;
      $('ratedMerchantName').innerText = merchantName;
      $('ratingSection').style.display = 'block';
      $('ratingResult').innerText = '';
      $('reviewComment').value = '';
      document.querySelectorAll('#starContainer .star').forEach(el => el.classList.remove('active'));
    }

    $('invNumber').value = ''; $('invCustomerPhone').value = ''; $('invAmount').value = '';
    if ($('invUsedCashback')) $('invUsedCashback').value = '';
    if ($('invBankCode')) { $('invBankCode').value = ''; $('invBankCode').dataset.realValue = ''; }
    setTimeout(() => renderInvoiceTab(), 1500);
  } catch (e) { res.style.color = '#ef4444'; res.innerText = '❌ ' + e.message; }
}

async function handleRedeem() {
  const merchantId = $('redeemMerchant').value;
  const original = parseFloat($('redeemOriginal').value);
  const amount = parseFloat($('redeemAmount').value);
  const res = $('redeemResult');
  if (!merchantId || !original || !amount || amount <= 0) { res.style.color = '#ef4444'; res.innerText = '❌ املأ البيانات'; return; }

  try {
    await redeemCashback({ merchantId, amount, originalAmount: original });
    res.style.color = '#10b981'; res.innerText = `✅ المطلوب ${(original - amount).toFixed(2)} ج`;
    $('redeemOriginal').value = ''; $('redeemAmount').value = '';
    setTimeout(() => renderInvoiceTab(), 1200);
  } catch (e) { res.style.color = '#ef4444'; res.innerText = '❌ ' + e.message; }
}

// ============================================================
// ✅ RATINGS
// ============================================================
async function handleSubmitRating() {
  const res = $('ratingResult');
  if (!selectedRating || selectedRating < 1) { res.style.color = '#ef4444'; res.innerText = '⚠️ اختر عدد النجوم'; return; }
  if (!lastRatedMerchantId) { res.style.color = '#ef4444'; res.innerText = '⚠️ التاجر غير معروف'; return; }

  const comment = $('reviewComment').value.trim();
  try {
    await rateMerchant({ merchantId: lastRatedMerchantId, stars: selectedRating, comment });
    res.style.color = '#10b981'; res.innerText = '✅ شكراً لتقييمك!';
    await refreshData();
    setTimeout(() => {
      $('ratingSection').style.display = 'none';
      $('ratingResult').innerText = '';
      $('reviewComment').value = '';
      selectedRating = 0;
      document.querySelectorAll('#starContainer .star').forEach(el => el.classList.remove('active'));
    }, 2000);
  } catch (e) { res.style.color = '#ef4444'; res.innerText = '❌ ' + e.message; }
}

// ============================================================
// ✅ REQUESTS (SPLIT INTO special / offer)
// ============================================================
function handleReqImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    uploadedReqImage = ev.target.result;
    $('reqFileName').innerText = '📎 ' + file.name;
    const prev = $('reqImagePreview');
    prev.src = ev.target.result; prev.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

async function handleSendRequest() {
  const category = $('reqCategory').value;
  const product = $('reqProduct').value.trim();
  const details = $('reqDetails').value.trim();
  const res = $('requestSendResult');

  if (!product) { res.style.color = '#ef4444'; res.innerText = '❌ اكتب اسم المنتج'; return; }

  try {
    await sendRequest({ category, product, details, imageBase64: uploadedReqImage });
    res.style.color = '#10b981'; res.innerText = '✅ تم إرسال الطلب';
    $('reqProduct').value = ''; $('reqDetails').value = '';
    $('reqFileName').innerText = 'لم يتم اختيار ملف';
    $('reqImagePreview').style.display = 'none'; uploadedReqImage = null;
    setTimeout(() => renderRequestsTab('special'), 1000);
  } catch (e) { res.style.color = '#ef4444'; res.innerText = '❌ ' + e.message; }
}

async function renderRequestsTab(type) {
  if (!currentProfile) return;
  if (type !== 'special' && type !== 'offer') type = 'special';

  if (currentProfile.role === 'merchant' && currentMerchant) {
    $('requestFormCard').style.display = 'none';
    $('reqStatsWrapper').style.display = 'none';
    $('myRequestsList').innerHTML = '';
    $('myOfferRequestsWrapper').style.display = 'none';
    $('merchantRequestsWrapper').style.display = 'block';
    $('offerRequestsWrapper').style.display = 'block';

    if (type === 'special') { try { await renderMerchantRequestsList(); } catch (e) { console.error(e); } }
    else { try { await renderMerchantOfferRequestsList(); } catch (e) { console.error(e); } }
  } else if (currentProfile.role === 'customer') {
    $('requestFormCard').style.display = 'block';
    $('reqStatsWrapper').style.display = 'block';
    $('merchantRequestsWrapper').style.display = 'none';
    $('offerRequestsWrapper').style.display = 'none';
    $('myOfferRequestsWrapper').style.display = 'block';

    if (type === 'special') { try { await renderMyRequests(); } catch (e) { console.error(e); } }
    else { try { await renderMyOfferRequests(); } catch (e) { console.error(e); } }
  } else {
    $('requestFormCard').style.display = 'none';
    $('reqStatsWrapper').style.display = 'none';
    $('merchantRequestsWrapper').style.display = 'none';
    $('offerRequestsWrapper').style.display = 'none';
    $('myOfferRequestsWrapper').style.display = 'none';
    $('myRequestsList').innerHTML = '<div class="no-requests">مش مسجل كعميل أو تاجر</div>';
  }

  setTimeout(updateOfferReqBadge, 300);
}

async function renderMyRequests() {
  myRequestsCache = await getMyRequests();
  const total = myRequestsCache.length;
  const pending = myRequestsCache.filter(r => r.status === 'pending').length;
  const responded = myRequestsCache.filter(r => r.status === 'responded').length;
  const accepted = myRequestsCache.filter(r => r.status === 'accepted').length;

  $('statTotal').innerText = total;
  $('statPending').innerText = pending;
  $('statResponded').innerText = responded;
  $('statAccepted').innerText = accepted;

  let list = myRequestsCache;
  if (currentReqFilter !== 'all') list = list.filter(r => r.status === currentReqFilter);

  const el = $('myRequestsList');
  if (!list.length) { el.innerHTML = '<div class="no-requests">لا توجد طلبات</div>'; return; }

  el.innerHTML = list.map(req => {
    const statusBadge = getStatusBadge(req.status);
    const responses = req.request_responses || [];
    const respHtml = responses.length ? responses.map(r => {
      const m = r.merchants || {};
      const isAccepted = req.accepted_response_id === r.id;
      const imageHtml = r.image_url ? `<img src="${escapeHtml(r.image_url)}" style="width:100%;max-width:150px;border-radius:10px;margin:6px 0;border:2px solid #eee" onerror="this.style.display='none'">` : '';
      const acceptBtn = isAccepted ? `<button class="accept-btn" style="background:#94a3b8;cursor:not-allowed">✅ مقبول</button>` : (req.status === 'accepted' ? '' : `<button class="accept-btn" onclick="window.acceptOfferClick('${escapeJs(req.id)}','${escapeJs(r.id)}')">قبول</button>`);
      const msgs = (r.customer_messages || []).map(msg => `<div style="background:#dbeafe;padding:6px 10px;border-radius:8px;margin:4px 0;font-size:12px"><strong>👤 أنت:</strong> ${escapeHtml(msg.text)}</div>`).join('');
      const replyHtml = r.merchant_reply ? `<div style="background:#fef3c7;padding:6px 10px;border-radius:8px;margin:4px 0;font-size:12px"><strong>🏪 ${escapeHtml(m.name || '')}:</strong> ${escapeHtml(r.merchant_reply)}</div>` : '';

      return `<div style="background:#f9fafb;padding:10px 14px;border-radius:10px;margin-top:8px;border-right:4px solid var(--primary)">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">
          <strong style="color:var(--primary)">🏪 ${escapeHtml(m.name || '')}</strong>
          <span style="color:#ff6b35;font-weight:700">💰 ${parseFloat(r.price || 0).toFixed(0)} ج</span>
        </div>
        ${imageHtml}
        <div style="font-size:13px;color:#4b5563;margin-top:4px">${escapeHtml(r.message || '')}</div>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
          ${m.lat && m.lng ? `<button class="admin-btn primary" onclick="window.open('https://www.google.com/maps?q=${m.lat},${m.lng}','_blank')">📍</button>` : ''}
          ${acceptBtn}
          <button class="admin-btn purple" onclick="window.askImageClick('${escapeJs(r.id)}')">📸 اسأل عن صورة</button>
        </div>
        ${msgs}${replyHtml}
      </div>`;
    }).join('') : '<div style="color:#92400e;text-align:center;padding:10px">⏳ جاري انتظار رد التجار...</div>';

    const custImg = req.image_url ? `<img src="${escapeHtml(req.image_url)}" style="width:100%;max-width:200px;border-radius:10px;margin:6px 0;border:2px solid #ddd">` : '';

    let actions = '';
    if (req.status === 'pending' || req.status === 'responded') {
      actions = `<button class="admin-btn danger" onclick="window.cancelReqClick('${escapeJs(req.id)}')" style="margin-top:8px">🚫 إلغاء</button>`;
    } else if (req.status === 'accepted' || req.status === 'cancelled') {
      actions = `<button class="admin-btn danger" onclick="window.deleteReqClick('${escapeJs(req.id)}')" style="margin-top:8px">🗑️ حذف</button>`;
    }

    return `<div class="card" style="padding:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <h4 style="margin:0">📦 ${escapeHtml(req.product)}</h4>${statusBadge}
      </div>
      ${custImg}
      <div style="color:#4b5563;font-size:14px;margin:6px 0">${escapeHtml(req.details || '')}</div>
      <div style="font-size:12px;color:#6b7280">🕒 ${new Date(req.created_at).toLocaleString('ar-EG')}</div>
      ${responses.length ? `<div style="font-size:12px;color:#6b7280;margin-top:6px">💬 ${responses.length} تاجر رد</div>` : ''}
      ${respHtml}${actions}
    </div>`;
  }).join('');
}

async function renderMyOfferRequests() {
  const el = $('myOfferRequestsList');
  if (!el) return;
  el.innerHTML = '<p style="color:#6b7280;text-align:center;padding:20px">⏳ جاري التحميل...</p>';

  try {
    myOfferRequestsCache = await getMyOfferRequests();
    if (!myOfferRequestsCache.length) { el.innerHTML = '<div class="no-requests">لا توجد طلبات عروض</div>'; return; }

    el.innerHTML = myOfferRequestsCache.map(req => {
      const m = req.merchants || {};
      const statusBadge = getStatusBadge(req.status);

      let responseHtml = '';
      if (req.offer_response === 'available') {
        responseHtml = `<div style="background:#d1fae5;padding:10px;border-radius:10px;margin-top:8px;border-right:4px solid #10b981">
          <div style="font-size:13px;color:#065f46;font-weight:700">✅ التاجر رد: متاح</div>
          ${req.offer_reply ? `<div style="font-size:13px;color:#065f46;margin-top:4px">💬 ${escapeHtml(req.offer_reply)}</div>` : ''}
          ${m.phone ? `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
            <a href="tel:${escapeHtml(m.phone)}" style="background:#10b981;color:#fff;text-decoration:none;padding:8px 14px;border-radius:20px;font-size:12px;font-weight:700">📞 اتصل</a>
            ${m.whatsapp ? `<a href="https://wa.me/${escapeHtml(m.whatsapp)}" target="_blank" style="background:#25D366;color:#fff;text-decoration:none;padding:8px 14px;border-radius:20px;font-size:12px;font-weight:700">💬 واتساب</a>` : ''}
          </div>` : ''}
        </div>`;
      } else if (req.offer_response === 'unavailable') {
        responseHtml = `<div style="background:#fee2e2;padding:10px;border-radius:10px;margin-top:8px;border-right:4px solid #ef4444">
          <div style="font-size:13px;color:#991b1b;font-weight:700">❌ التاجر رد: مش متاح حالياً</div>
          ${req.offer_reply ? `<div style="font-size:13px;color:#991b1b;margin-top:4px">💬 ${escapeHtml(req.offer_reply)}</div>` : ''}
        </div>`;
      } else {
        responseHtml = `<div style="color:#92400e;text-align:center;padding:10px;font-size:13px">⏳ في انتظار رد التاجر...</div>`;
      }

      let actions = '';
      if (req.status === 'pending') {
        actions = `<button class="admin-btn danger" onclick="window.cancelOfferReqClick('${escapeJs(req.id)}')" style="margin-top:8px">🚫 إلغاء</button>`;
      } else if (req.status === 'responded' || req.status === 'cancelled') {
        actions = `<button class="admin-btn danger" onclick="window.deleteOfferReqClick('${escapeJs(req.id)}')" style="margin-top:8px">🗑️ حذف</button>`;
      }

      return `<div class="card" style="padding:14px;border-right:4px solid #ff6b35">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
          <h4 style="margin:0">🎁 ${escapeHtml(req.product)}</h4>${statusBadge}
        </div>
        <div style="font-size:13px;color:#6b7280;margin-top:6px">🏪 التاجر: ${escapeHtml(m.name || '')}</div>
        ${req.details ? `<div style="font-size:13px;color:#4b5563;margin-top:6px">📝 ${escapeHtml(req.details)}</div>` : ''}
        <div style="font-size:12px;color:#9ca3af;margin-top:4px">🕒 ${new Date(req.created_at).toLocaleString('ar-EG')}</div>
        ${responseHtml}${actions}
      </div>`;
    }).join('');
  } catch (e) { el.innerHTML = '<p style="color:#ef4444;text-align:center;padding:20px">❌ ' + e.message + '</p>'; }
}

async function renderMerchantRequestsList() {
  const el = $('merchantRequestsList');
  if (!el) return;
  try {
    const requests = await getMerchantRequests(currentMerchant.id, currentMerchant.category);
    if (!requests.length) { el.innerHTML = '<p style="color:#6b7280;font-size:14px;text-align:center;padding:20px">مفيش طلبات 😴</p>'; return; }
    
    el.innerHTML = requests.map(req => {
      const myReply = (req.request_responses || []).find(r => r.merchant_id === currentMerchant.id);
      const statusBadge = getStatusBadge(req.status);
      const imageHtml = req.image_url ? `<img src="${escapeHtml(req.image_url)}" style="width:100%;max-width:180px;border-radius:10px;margin:8px 0;border:2px solid #ddd">` : '';

      const customerMsgs = myReply && myReply.customer_messages && myReply.customer_messages.length
        ? `<div style="background:#dbeafe;padding:8px;border-radius:8px;margin-top:8px">
            <div style="font-size:11px;color:#1e40af;font-weight:700">👤 رسائل العميل:</div>
            ${myReply.customer_messages.map(m => `<div style="font-size:12px;color:#1e40af">• ${escapeHtml(m.text)}</div>`).join('')}
          </div>` : '';

      let replyHtml = '';
      if (myReply) {
        replyHtml = `<div style="background:#d1fae5;padding:10px;border-radius:10px;margin-top:8px">
          <div style="font-size:12px;color:#065f46;font-weight:700">✅ ردك:</div>
          <div style="font-size:14px;color:#065f46;margin-top:4px">💰 ${parseFloat(myReply.price).toFixed(0)} ج</div>
          <div style="font-size:13px;color:#065f46">${escapeHtml(myReply.message)}</div>
          ${myReply.image_url ? `<img src="${escapeHtml(myReply.image_url)}" style="width:100%;max-width:140px;border-radius:8px;margin-top:6px">` : ''}
        </div>`;
      }

      return `<div style="background:#f9fafb;padding:14px;border-radius:12px;margin-bottom:12px;border-right:4px solid var(--success)">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">
          <h5 style="color:var(--primary);margin:0">📦 ${escapeHtml(req.product)}</h5>${statusBadge}
        </div>
        <div style="font-size:13px;color:#4b5563;margin-top:6px">${escapeHtml(req.details || '')}</div>
        ${imageHtml}
        <div style="font-size:12px;color:#6b7280;margin-top:4px">🕒 ${new Date(req.created_at).toLocaleString('ar-EG')}</div>
        ${customerMsgs}${replyHtml}
        <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
          ${!myReply ? `<button class="admin-btn primary" onclick="window.replyToReq('${escapeJs(req.id)}')">📩 الرد</button>` : ''}
          ${myReply ? `<button class="admin-btn purple" onclick="window.sendExtraImage('${escapeJs(myReply.id)}')">📸 صورة إضافية</button>` : ''}
          <button class="admin-btn danger" onclick="window.hideReq('${escapeJs(req.id)}')">🗑️ مسح</button>
        </div>
      </div>`;
    }).join('');
  } catch (e) { el.innerHTML = '<p style="color:#ef4444;font-size:14px">❌ ' + e.message + '</p>'; }
}

async function renderMerchantOfferRequestsList() {
  const el = $('merchantOfferRequestsList');
  if (!el) return;
  el.innerHTML = '<p style="color:#6b7280;text-align:center;padding:20px">⏳ جاري التحميل...</p>';

  try {
    const requests = await getMerchantOfferRequests(currentMerchant.id);
    if (!requests.length) { el.innerHTML = '<p style="color:#6b7280;font-size:14px;text-align:center;padding:20px">مفيش طلبات عروض 😴</p>'; return; }

    const pending = requests.filter(r => !r.offer_response);
    const answered = requests.filter(r => r.offer_response);

    let html = '';
    if (pending.length) {
      html += `<h5 style="color:#ff6b35;margin:10px 0 8px">📥 طلبات جديدة (${pending.length})</h5>`;
      html += pending.map(req => renderOfferRequestCard(req)).join('');
    }
    if (answered.length) {
      html += `<h5 style="color:#10b981;margin:20px 0 8px">✅ تم الرد عليها (${answered.length})</h5>`;
      html += answered.map(req => renderOfferRequestCard(req)).join('');
    }
    el.innerHTML = html;
  } catch (e) { el.innerHTML = '<p style="color:#ef4444;text-align:center;padding:20px">❌ ' + e.message + '</p>'; }
  updateOfferReqBadge();
}

function renderOfferRequestCard(req) {
  const statusBadge = getStatusBadge(req.status);
  const custName = req.customer_name || 'عميل';
  const custPhone = req.customer_phone || '';

  let responseHtml = '';
  if (req.offer_response) {
    const isAvail = req.offer_response === 'available';
    responseHtml = `<div style="background:${isAvail ? '#d1fae5' : '#fee2e2'};padding:10px;border-radius:10px;margin-top:8px">
      <div style="font-size:13px;color:${isAvail ? '#065f46' : '#991b1b'};font-weight:700">${isAvail ? '✅ رديت: متاح' : '❌ رديت: مش متاح'}</div>
      ${req.offer_reply ? `<div style="font-size:13px;color:${isAvail ? '#065f46' : '#991b1b'};margin-top:4px">💬 ${escapeHtml(req.offer_reply)}</div>` : ''}
    </div>`;
  }

  let actionsHtml = '';
  if (!req.offer_response) {
    actionsHtml = `<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
        <button class="admin-btn success" onclick="window.replyOfferReqClick('${escapeJs(req.id)}', true)">✅ متاح</button>
        <button class="admin-btn danger" onclick="window.replyOfferReqClick('${escapeJs(req.id)}', false)">❌ مش متاح</button>
      </div>`;
  }

  const phoneHtml = custPhone
    ? `<div style="margin-top:4px">📱 <a href="tel:${escapeHtml(custPhone)}" style="color:var(--primary);font-weight:700">${escapeHtml(custPhone)}</a></div>`
    : `<div style="margin-top:4px;color:#9ca3af;font-size:12px">🔒 رقم العميل هيظهر بعد ما ترد "متاح"</div>`;

  return `<div style="background:#f9fafb;padding:14px;border-radius:12px;margin-bottom:12px;border-right:4px solid ${req.offer_response ? '#10b981' : '#ff6b35'}">
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">
      <h5 style="color:var(--primary);margin:0">🎁 ${escapeHtml(req.product)}</h5>${statusBadge}
    </div>
    <div style="background:#fff;padding:10px;border-radius:8px;margin-top:8px;font-size:13px">
      <div><strong>👤 ${escapeHtml(custName)}</strong></div>
      ${phoneHtml}
    </div>
    ${req.details ? `<div style="font-size:13px;color:#4b5563;margin-top:8px;background:#fef3c7;padding:8px;border-radius:8px">📝 ${escapeHtml(req.details)}</div>` : ''}
    <div style="font-size:12px;color:#9ca3af;margin-top:6px">🕒 ${new Date(req.created_at).toLocaleString('ar-EG')}</div>
    ${responseHtml}${actionsHtml}
  </div>`;
}

window.replyOfferReqClick = async function(requestId, available) {
  const replyText = prompt(available ? 'اكتب رسالة للعميل (اختياري):' : 'اكتب سبب عدم التوفر (اختياري):', available ? 'متوفر، تعالى خده' : 'مش متاح حالياً');
  if (replyText === null) return;

  try {
    await replyToOfferRequest({ requestId, available, replyText });
    toast(available ? '✅ تم إرسال الرد' : '❌ تم إرسال الرد', 'success');
    await new Promise(r => setTimeout(r, 500));
    await renderMerchantOfferRequestsList();
  } catch (e) { toast('❌ ' + e.message, 'error'); }
};

window.cancelOfferReqClick = async function(requestId) {
  if (!confirm('متأكد من إلغاء الطلب؟')) return;
  try {
    await cancelOfferRequest(requestId);
    toast('✅ تم الإلغاء', 'success');
    renderMyOfferRequests();
  } catch (e) { toast('❌ ' + e.message, 'error'); }
};

window.deleteOfferReqClick = async function(requestId) {
  if (!confirm('متأكد من الحذف؟')) return;
  try {
    await deleteOfferRequest(requestId);
    toast('✅ تم الحذف', 'success');
    renderMyOfferRequests();
  } catch (e) { toast('❌ ' + e.message, 'error'); }
};

function getStatusBadge(status) {
  const map = {
    pending: '<span style="background:#fef3c7;color:#92400e;font-size:12px;padding:3px 12px;border-radius:20px;font-weight:700">⏳ انتظار</span>',
    responded: '<span style="background:#dbeafe;color:#1e40af;font-size:12px;padding:3px 12px;border-radius:20px;font-weight:700">💬 تم الرد</span>',
    accepted: '<span style="background:#d1fae5;color:#065f46;font-size:12px;padding:3px 12px;border-radius:20px;font-weight:700">✅ مقبول</span>',
    cancelled: '<span style="background:#fee2e2;color:#991b1b;font-size:12px;padding:3px 12px;border-radius:20px;font-weight:700">🚫 ملغي</span>'
  };
  return map[status] || map.pending;
}

async function acceptOfferClick(reqId, respId) {
  if (!confirm('متأكد من قبول العرض؟')) return;
  try { await acceptOffer({ requestId: reqId, responseId: respId }); toast('✅ تم قبول العرض', 'success'); renderRequestsTab('special'); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
}

async function cancelReqClick(reqId) {
  if (!confirm('متأكد من الإلغاء؟')) return;
  try { await cancelRequest(reqId); renderRequestsTab('special'); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
}

async function deleteReqClick(reqId) {
  if (!confirm('متأكد من الحذف؟')) return;
  try { await deleteRequest(reqId); renderRequestsTab('special'); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
}

async function askImageClick(respId) {
  const msg = prompt('اكتب رسالتك للتاجر:');
  if (!msg) return;
  const req = myRequestsCache.find(r => (r.request_responses || []).some(x => x.id === respId));
  const resp = req?.request_responses.find(x => x.id === respId);
  if (!resp) return;
  try {
    await askMerchantForImage({ responseId: respId, message: msg, existingMessages: resp.customer_messages || [] });
    toast('✅ تم إرسال الرسالة', 'success');
    renderRequestsTab('special');
  } catch (e) { toast('❌ ' + e.message, 'error'); }
}

async function replyToReq(reqId) {
  const price = prompt('اكتب السعر:'); if (price === null) return;
  const p = parseFloat(price); if (isNaN(p) || p <= 0) { toast('❌ سعر غير صحيح', 'error'); return; }
  const message = prompt('رسالة للعميل:', 'متوفر بسعر ممتاز'); if (message === null) return;
  const hasImage = confirm('تحب ترفق صورة؟');
  let imageBase64 = null;
  if (hasImage) imageBase64 = await pickImage();

  try {
    await replyToRequest({ requestId: reqId, merchantId: currentMerchant.id, price: p, message, imageBase64 });
    toast('✅ تم إرسال ردك', 'success');
    renderRequestsTab('special');
  } catch (e) { toast('❌ ' + e.message, 'error'); }
}

async function sendExtraImage(responseId) {
  const imageBase64 = await pickImage();
  if (!imageBase64) return;
  const message = prompt('رسالة (اختياري):', 'دي صورة إضافية');
  try {
    await merchantSendExtraImage({ responseId, imageBase64, message });
    toast('✅ تم إرسال الصورة', 'success');
    renderRequestsTab('special');
  } catch (e) { toast('❌ ' + e.message, 'error'); }
}

function pickImage() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target.result);
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

async function hideReq(reqId) {
  if (!confirm('مسح الطلب من عندك؟')) return;
  try { await hideRequestForMerchant(reqId, currentMerchant.id); renderRequestsTab('special'); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
}

// ============================================================
// ✅ Badge Update
// ============================================================
async function updateOfferReqBadge() {
  const mainBadge = $('mainReqBadge');
  const subBadge = $('offerReqBadge');

  if (!currentProfile || currentProfile.role !== 'merchant' || !currentMerchant) {
    if (mainBadge) mainBadge.style.display = 'none';
    if (subBadge) subBadge.style.display = 'none';
    return;
  }

  try {
    const offerReqs = await getMerchantOfferRequests(currentMerchant.id);
    const pendingOffers = offerReqs.filter(r => !r.offer_response).length;

    const specialReqs = await getMerchantRequests(currentMerchant.id, currentMerchant.category);
    const pendingSpecial = specialReqs.filter(r => {
      const myReply = (r.request_responses || []).find(x => x.merchant_id === currentMerchant.id);
      return !myReply;
    }).length;

    if (mainBadge) {
      if (pendingSpecial > 0) {
        mainBadge.innerText = pendingSpecial > 9 ? '9+' : pendingSpecial;
        mainBadge.style.display = 'block';
      } else { mainBadge.style.display = 'none'; }
    }

    if (subBadge) {
      if (pendingOffers > 0) {
        subBadge.innerText = pendingOffers > 9 ? '9+' : pendingOffers;
        subBadge.style.display = 'block';
      } else { subBadge.style.display = 'none'; }
    }
  } catch (e) {
    console.error('Badge error:', e);
    if (mainBadge) mainBadge.style.display = 'none';
    if (subBadge) subBadge.style.display = 'none';
  }
}

// ============================================================
// ✅ Merchant Report
// ============================================================
window.openMerchantReport = async function(merchantId) {
  const m = adminData.merchants.find(x => x.id === merchantId);
  if (!m) { toast('❌ التاجر غير موجود', 'error'); return; }

  const logoHtml = m.logo_url
    ? `<img src="${escapeHtml(m.logo_url)}" style="width:50px;height:50px;object-fit:cover;border-radius:12px;display:block;margin:0 auto 8px">`
    : `<div style="font-size:40px;text-align:center">${escapeHtml(m.icon || '🏪')}</div>`;

  $('reportMerchantName').innerHTML = `
    ${logoHtml}
    <div style="text-align:center;font-weight:700;color:var(--primary);margin-top:6px">${escapeHtml(m.name)}</div>
    <div style="text-align:center;font-size:12px;color:#6b7280;margin-top:4px">🔑 ${escapeHtml(m.bank_code || '-')} | 📱 ${escapeHtml(m.phone || '-')}</div>
  `;

  $('reportMerchantContent').innerHTML = '<p style="text-align:center;padding:20px;color:#6b7280">⏳ جاري التحميل...</p>';
  const modal = $('merchantReportModal');
  modal.style.display = 'flex';
  modal.classList.add('active');

  try {
    const r = await getMerchantFullReport(merchantId);
    $('reportMerchantContent').innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
        <div style="background:#dbeafe;padding:12px;border-radius:10px;text-align:center;grid-column:span 2">
          <div style="font-size:11px;color:#1e40af">💰 إجمالي المبيعات</div>
          <div style="font-size:24px;font-weight:800;color:#1e40af;margin-top:4px">${r.totalSales.toFixed(2)} ج</div>
        </div>
        <div style="background:#f0f9ff;padding:12px;border-radius:10px;text-align:center">
          <div style="font-size:11px;color:#0c4a6e">📄 فواتير نشطة</div>
          <div style="font-size:18px;font-weight:700;color:#0c4a6e;margin-top:4px">${r.invoicesCount}</div>
        </div>
        <div style="background:#fef3c7;padding:12px;border-radius:10px;text-align:center">
          <div style="font-size:11px;color:#92400e">🔄 مرتجعات</div>
          <div style="font-size:18px;font-weight:700;color:#92400e;margin-top:4px">${r.returnedCount}</div>
        </div>
        <div style="background:#d1fae5;padding:12px;border-radius:10px;text-align:center">
          <div style="font-size:11px;color:#065f46">💵 كاش باك ممنوح</div>
          <div style="font-size:16px;font-weight:700;color:#065f46;margin-top:4px">${r.totalCashbackGiven.toFixed(2)} ج</div>
        </div>
        <div style="background:#fee2e2;padding:12px;border-radius:10px;text-align:center">
          <div style="font-size:11px;color:#991b1b">💸 كاش باك مصروف</div>
          <div style="font-size:16px;font-weight:700;color:#991b1b;margin-top:4px">${r.totalCashbackSpent.toFixed(2)} ج</div>
        </div>
        <div style="background:#ede9fe;padding:12px;border-radius:10px;text-align:center">
          <div style="font-size:11px;color:#5b21b6">💰 متبقي</div>
          <div style="font-size:16px;font-weight:700;color:#5b21b6;margin-top:4px">${r.totalCashbackRemaining.toFixed(2)} ج</div>
        </div>
        <div style="background:#f3f4f6;padding:12px;border-radius:10px;text-align:center">
          <div style="font-size:11px;color:#374151">👥 عملاء فريدين</div>
          <div style="font-size:18px;font-weight:700;color:#374151;margin-top:4px">${r.uniqueCustomers}</div>
        </div>
        <div style="background:#f0fdf4;padding:12px;border-radius:10px;text-align:center">
          <div style="font-size:11px;color:#166534">💰 متوسط الفاتورة</div>
          <div style="font-size:16px;font-weight:700;color:#166534;margin-top:4px">${r.avgInvoice.toFixed(2)} ج</div>
        </div>
        <div style="background:#fff7ed;padding:12px;border-radius:10px;text-align:center">
          <div style="font-size:11px;color:#9a3412">🎁 عدد العروض</div>
          <div style="font-size:18px;font-weight:700;color:#9a3412;margin-top:4px">${r.offersCount}</div>
        </div>
      </div>
      <div style="margin-top:16px;padding-top:12px;border-top:1px solid #eee;text-align:center">
        <p style="font-size:12px;color:#9ca3af">📅 التقرير ده بيعرض الفواتير الحالية بس</p>
      </div>
    `;
  } catch (e) {
    $('reportMerchantContent').innerHTML = `<p style="color:#ef4444;text-align:center;padding:20px">❌ ${e.message}</p>`;
  }
};

window.closeMerchantReport = function(e) {
  if (e && e.target && !e.target.classList.contains('modal-overlay')) return;
  const modal = $('merchantReportModal');
  if (!modal) return;
  modal.classList.remove('active');
  modal.style.display = 'none';
};

// ============================================================
// ✅ Merchant Logo
// ============================================================
function renderLogoPreview() {
  if (!currentMerchant) return;
  const img = $('logoPreviewImg');
  const emoji = $('logoPreviewEmoji');
  if (!img || !emoji) return;

  if (currentMerchant.logo_url) {
    img.src = currentMerchant.logo_url;
    img.style.display = 'block';
    emoji.style.display = 'none';
  } else {
    img.style.display = 'none';
    emoji.style.display = 'inline';
    emoji.innerText = currentMerchant.icon || '🏪';
  }
}

async function handleUploadLogo() {
  if (!currentMerchant) return;
  const res = $('logoUploadResult');
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    res.style.color = '#6b7280';
    res.innerText = '⏳ جاري الرفع...';
    try {
      const url = await uploadMerchantLogo(currentMerchant.id, file);
      currentMerchant.logo_url = url;
      renderLogoPreview();
      res.style.color = '#10b981';
      res.innerText = '✅ تم رفع الشعار';
      await refreshData();
      setTimeout(() => res.innerText = '', 3000);
    } catch (e) {
      res.style.color = '#ef4444';
      res.innerText = '❌ ' + e.message;
    }
  };
  input.click();
}

async function handleDeleteLogo() {
  if (!currentMerchant) return;
  if (!confirm('متأكد من حذف الشعار؟')) return;
  const res = $('logoUploadResult');
  try {
    await deleteMerchantLogo(currentMerchant.id);
    currentMerchant.logo_url = null;
    renderLogoPreview();
    res.style.color = '#10b981';
    res.innerText = '✅ تم حذف الشعار';
    await refreshData();
    setTimeout(() => res.innerText = '', 3000);
  } catch (e) {
    res.style.color = '#ef4444';
    res.innerText = '❌ ' + e.message;
  }
}

// ============================================================
// ✅ Dashboard
// ============================================================
async function renderDashboard() {
  if (!currentMerchant) return;
  renderLogoPreview();

  try {
    const s = await getMerchantStats(currentMerchant.id);
    $('dashCust').innerText = s.customersCount;
    $('dashSales').innerText = s.sales.toFixed(2) + ' ج';
    $('dashOffers').innerText = s.offersCount;
    $('dashGiven').innerText = s.cashbackGiven.toFixed(2) + ' ج';
    $('dashSpent').innerText = s.cashbackSpent.toFixed(2) + ' ج';
    $('dashRemaining').innerText = s.cashbackRemaining.toFixed(2) + ' ج';
    $('dashNetSales').innerText = s.netSales.toFixed(2) + ' ج';
  } catch (e) { console.error(e); }

  const rate = currentMerchant.cashback_rate || 15;
  $('rateSlider').value = rate;
  $('rateValueDisplay').innerText = rate;
  const tier = getTier(rate);
  $('rateTierDisplay').innerHTML = `${tier.icon} ${tier.name}`;

  try {
    const offers = await getMerchantOffers(currentMerchant.id);
    const el = $('myOffersList');
    el.innerHTML = offers.length ? offers.map(o => {
      const imgHtml = o.image_url ? `<img src="${escapeHtml(o.image_url)}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;flex-shrink:0">` : '';
      return `<div class="merchant-offer-card" style="background:#f9fafb;padding:10px;border-radius:12px;margin-bottom:8px;border-right:4px solid #ff6b35;display:flex;align-items:center;gap:10px">
        ${imgHtml}
        <div style="flex:1">
          <span style="font-weight:600">${escapeHtml(o.title)}</span><br>
          <span style="color:#ff6b35;font-weight:700">${escapeHtml(o.discount)}</span>
          ${o.price ? `<div style="font-size:12px;color:#10b981;font-weight:700;margin-top:2px">💰 ${parseFloat(o.price).toFixed(2)} ج</div>` : ''}
          ${o.description ? `<div style="font-size:11px;color:#6b7280;margin-top:2px">${escapeHtml(o.description)}</div>` : ''}
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          <button onclick="window.openEditOffer('${escapeJs(o.id)}')" style="background:#3b82f6;color:#fff;border:none;border-radius:30px;padding:2px 10px;cursor:pointer">✏️</button>
          <button class="del-btn" onclick="window.deleteOfferClick('${escapeJs(o.id)}')" style="background:#ef4444;color:#fff;border:none;border-radius:30px;padding:2px 10px;cursor:pointer">🗑️</button>
        </div>
      </div>`;
    }).join('') : '<p style="color:#6b7280">لا توجد عروض</p>';
  } catch (e) { console.error(e); }

  try {
    const topOffers = await getMerchantTopOffers(currentMerchant.id);
    const el = $('myTopOffersList');
    if (el) {
      if (!topOffers.length) {
        el.innerHTML = '<p style="color:#6b7280;font-size:14px">لا توجد بيانات</p>';
      } else {
        el.innerHTML = topOffers.slice(0, 5).map((o, i) => `
          <div style="background:#f9fafb;padding:10px 14px;border-radius:10px;margin-bottom:8px;border-right:4px solid #f59e0b;display:flex;align-items:center;gap:10px">
            <div style="font-size:20px;font-weight:700;color:#f59e0b;min-width:30px">#${i + 1}</div>
            <div style="flex:1">
              <div style="font-weight:600;font-size:14px">${escapeHtml(o.title)}</div>
              <div style="display:flex;gap:12px;margin-top:4px;font-size:12px;color:#6b7280;flex-wrap:wrap">
                <span>👁️ ${o.views}</span><span>👆 ${o.clicks}</span>
                <span>📞 ${o.contacts}</span><span>📍 ${o.maps}</span>
              </div>
            </div>
            <div style="background:#1a2a6c;color:#fff;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700">${escapeHtml(o.discount)}</div>
          </div>
        `).join('');
      }
    }
  } catch (e) { console.error(e); }

  try {
    const customers = await getMerchantCustomers(currentMerchant.id);
    const el = $('myCustomersList');
    el.innerHTML = customers.length ? customers.map(c => `
      <div style="background:#f9fafb;padding:10px 14px;border-radius:10px;margin-bottom:6px;border-right:4px solid #1a2a6c;font-size:13px">
        <strong>📱 ${escapeHtml(c.phone)}</strong>
        <div style="color:#6b7280;margin-top:2px">${c.count} فاتورة • ${c.total.toFixed(2)} ج</div>
      </div>`).join('') : '<p style="color:#6b7280">لا يوجد عملاء</p>';
  } catch (e) { console.error(e); }

  try {
    const invoices = await getMerchantInvoicesList(currentMerchant.id);
    const el = $('dashInvoicesList');
    el.innerHTML = invoices.length ? invoices.slice(0, 30).map(inv => {
      const statusBadge = inv.confirmation_status === 'confirmed' ? '<span class="active-badge">✅ مؤكدة</span>' : inv.confirmation_status === 'rejected' ? '<span class="blocked-badge">❌ مرفوضة</span>' : inv.confirmation_status === 'expired' ? '<span style="background:#f3f4f6;color:#6b7280;padding:3px 10px;border-radius:20px;font-size:11px">⏰ ملغية</span>' : '<span style="background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:20px;font-size:11px">⏳ معلقة</span>';
      return `<div style="background:#f9fafb;padding:10px 14px;border-radius:10px;margin-bottom:6px;border-right:4px solid #1a2a6c;font-size:13px">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">
          <strong>📄 #${escapeHtml(inv.number)}</strong>
          <span style="color:#ff6b35;font-weight:700">${parseFloat(inv.amount).toFixed(2)} ج</span>
        </div>
        <div style="color:#6b7280;margin-top:2px">📱 ${escapeHtml(inv.customer_phone || '-')} • 💵 ${parseFloat(inv.cashback).toFixed(2)} ج ${statusBadge}</div>
        ${inv.confirmation_status === 'confirmed' && inv.status === 'active' ? `<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
          <button class="admin-btn primary" onclick="window.editInvClick('${escapeJs(inv.id)}')">✏️ تعديل</button>
          <button class="admin-btn danger" onclick="window.returnInvClick('${escapeJs(inv.id)}')">🔄 مرتجع</button>
        </div>` : ''}
      </div>`;
    }).join('') : '<p style="color:#6b7280">لا توجد فواتير</p>';
  } catch (e) { console.error(e); }

  try {
    const wallets = await getMerchantWallets(currentMerchant.id);
    const el = $('dashWalletsList');
    el.innerHTML = wallets.length ? wallets.map(w => `
      <div style="background:#f9fafb;padding:10px 14px;border-radius:10px;margin-bottom:6px;border-right:4px solid #10b981">
        <div style="font-weight:600">📱 ${escapeHtml(w.profiles?.phone || '?')} ${w.profiles?.name ? '(' + escapeHtml(w.profiles.name) + ')' : ''}</div>
        <div style="font-size:13px;color:#10b981;font-weight:600;margin-top:4px">💰 ${parseFloat(w.balance).toFixed(2)} ج</div>
      </div>`).join('') : '<p style="color:#6b7280">لا يوجد أرصدة</p>';
  } catch (e) { console.error(e); }
}

async function deleteOfferClick(offerId) {
  if (!confirm('حذف العرض؟')) return;
  try { await deleteOffer(offerId); renderDashboard(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
}

async function editInvClick(invId) {
  const inv = (await getMerchantInvoicesList(currentMerchant.id)).find(i => i.id === invId);
  if (!inv) return;
  const newAmount = prompt(`المبلغ الحالي: ${inv.amount} ج\nاكتب المبلغ الجديد:`, inv.amount);
  if (newAmount === null) return;
  const a = parseFloat(newAmount);
  if (isNaN(a) || a <= 0) { toast('❌ غير صحيح', 'error'); return; }
  if (a > parseFloat(inv.amount)) { toast('❌ لا يمكن الزيادة', 'error'); return; }
  try { await editInvoice(invId, a, null); toast('✅ تم', 'success'); renderDashboard(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
}

async function returnInvClick(invId) {
  const amount = prompt("مبلغ المرتجع (أو 'الكل'):");
  if (amount === null) return;
  const inv = (await getMerchantInvoicesList(currentMerchant.id)).find(i => i.id === invId);
  if (!inv) return;
  const r = amount === 'الكل' ? parseFloat(inv.amount) : parseFloat(amount);
  if (isNaN(r) || r <= 0) { toast('❌ غير صحيح', 'error'); return; }
  try { await processReturn(invId, r); toast('✅ تم', 'success'); renderDashboard(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
}

// ============================================================
// ✅ Offers Add/Edit
// ============================================================
async function handleAddOffer() {
  const title = $('offerTitle').value.trim();
  const category = $('offerCategory') ? $('offerCategory').value : '';
  const subCategory = $('offerSubCategory') ? $('offerSubCategory').value : '';
  const type = $('offerType') ? $('offerType').value : 'percent';
  const percent = parseInt($('offerPercent')?.value) || 0;
  const custom = $('offerCustom')?.value.trim() || '';
  const description = $('offerDescription')?.value.trim() || '';
  const price = parseFloat($('offerPrice')?.value) || null;
  const res = $('offerResult');

  if (!title) { res.style.color = 'red'; res.innerText = '❌ اكتب اسم العرض'; return; }
  if (!category) { res.style.color = 'red'; res.innerText = '❌ اختار التصنيف الرئيسي'; return; }
  if (!subCategory) { res.style.color = 'red'; res.innerText = '❌ اختار التصنيف الفرعي'; return; }

  let discountText = '';
  let discountValue = 0;

  if (type === 'percent') {
    if (!percent || percent < 1 || percent > 100) { res.style.color = 'red'; res.innerText = '❌ النسبة لازم بين 1 و 100'; return; }
    discountText = percent + '% OFF'; discountValue = percent;
  } else if (type === '1+1') { discountText = '1+1'; discountValue = 50; }
  else if (type === '2+1') { discountText = '2+1'; discountValue = 33; }
  else if (type === '3+1') { discountText = '3+1'; discountValue = 25; }
  else if (type === 'custom') {
    if (!custom) { res.style.color = 'red'; res.innerText = '❌ اكتب وصف الخصم'; return; }
    discountText = custom; discountValue = 0;
  }

  try {
    await addOffer({
      merchantId: currentMerchant.id,
      title, discount: discountText, discountValue, description,
      imageBase64: uploadedOfferImage,
      price, category, subCategory
    });
    res.style.color = 'green'; res.innerText = '✅ تم نشر العرض';
    $('offerTitle').value = '';
    if ($('offerPrice')) $('offerPrice').value = '';
    if ($('offerPercent')) $('offerPercent').value = '20';
    if ($('offerCustom')) $('offerCustom').value = '';
    if ($('offerDescription')) $('offerDescription').value = '';
    if ($('offerType')) $('offerType').value = 'percent';
    if ($('offerCategory')) $('offerCategory').value = '';
    if ($('offerSubCategory')) $('offerSubCategory').value = '';
    if ($('offerSubCategoryWrap')) $('offerSubCategoryWrap').style.display = 'none';
    
    if (window.onOfferTypeChange) window.onOfferTypeChange('percent');
    uploadedOfferImage = null;
    const p = $('offerImagePreview'); if (p) { p.style.display = 'none'; p.src = ''; }
    const f = $('offerFileName'); if (f) f.innerText = 'لم يتم اختيار ملف';
    setTimeout(() => { res.innerText = ''; renderDashboard(); refreshData(); }, 1000);
  } catch (e) { res.style.color = 'red'; res.innerText = '❌ ' + e.message; }
}

window.openEditOffer = async function(offerId) {
  const offers = await getMerchantOffers(currentMerchant.id);
  const o = offers.find(x => x.id === offerId);
  if (!o) return;

  $('editOfferId').value = o.id;
  $('editOfferTitle').value = o.title || '';
  $('editOfferPrice').value = o.price || '';
  $('editOfferDescription').value = o.description || '';

  if ($('editOfferCategory')) {
    $('editOfferCategory').value = o.category || '';
    window.onEditOfferCategoryChange(o.category || '');
    setTimeout(() => { if ($('editOfferSubCategory')) $('editOfferSubCategory').value = o.sub_category || ''; }, 50);
  }

  let type = 'percent'; let percent = 20; let custom = '';

  if (o.discount) {
    if (o.discount.includes('% OFF')) { type = 'percent'; percent = parseInt(o.discount) || 20; }
    else if (o.discount === '1+1') type = '1+1';
    else if (o.discount === '2+1') type = '2+1';
    else if (o.discount === '3+1') type = '3+1';
    else { type = 'custom'; custom = o.discount; }
  }

  $('editOfferType').value = type;
  $('editOfferPercent').value = percent;
  $('editOfferCustom').value = custom;
  window.onEditOfferTypeChange(type);

  uploadedEditOfferImage = null;
  const editImgInput = document.getElementById('editOfferImage');
  if (editImgInput) editImgInput.value = '';

  const currentImageWrap = $('editOfferCurrentImageWrap');
  const currentImage = $('editOfferCurrentImage');
  const preview = $('editOfferImagePreview');
  const fileName = $('editOfferFileName');

  preview.style.display = 'none';
  fileName.innerText = 'لم يتم اختيار ملف';

  if (o.image_url) {
    currentImage.src = o.image_url;
    currentImageWrap.style.display = 'block';
  } else {
    currentImageWrap.style.display = 'none';
  }

  $('editOfferResult').innerText = '';
  $('editOfferModal').classList.add('active');
  $('editOfferModal').style.display = 'flex';
};

window.closeEditOfferModal = function(e) {
  if (e && e.target && !e.target.classList.contains('modal-overlay')) return;
  const modal = $('editOfferModal');
  if (!modal) return;
  modal.classList.remove('active');
  modal.style.display = 'none';
  uploadedEditOfferImage = null;
};

window.onEditOfferTypeChange = function(value) {
  const percentWrap = $('editOfferPercentWrap');
  const customWrap = $('editOfferCustomWrap');
  if (!percentWrap || !customWrap) return;
  if (value === 'percent') { percentWrap.style.display = 'block'; customWrap.style.display = 'none'; }
  else if (value === 'custom') { percentWrap.style.display = 'none'; customWrap.style.display = 'block'; }
  else { percentWrap.style.display = 'none'; customWrap.style.display = 'none'; }
};

window.deleteOfferImage = function() {
  $('editOfferCurrentImageWrap').style.display = 'none';
  $('editOfferCurrentImage').src = '';
  uploadedEditOfferImage = 'DELETE';
};

async function handleSaveOfferEdit() {
  const id = $('editOfferId').value;
  const title = $('editOfferTitle').value.trim();
  const price = parseFloat($('editOfferPrice').value) || null;
  const description = $('editOfferDescription').value.trim();
  const type = $('editOfferType').value;
  const percent = parseInt($('editOfferPercent').value) || 0;
  const custom = $('editOfferCustom').value.trim();
  
  const category = $('editOfferCategory') ? $('editOfferCategory').value : '';
  const subCategory = $('editOfferSubCategory') ? $('editOfferSubCategory').value : '';

  const res = $('editOfferResult');

  if (!title) { res.style.color = 'red'; res.innerText = '❌ اكتب اسم العرض'; return; }
  if (!category) { res.style.color = 'red'; res.innerText = '❌ اختار التصنيف الرئيسي'; return; }
  if (!subCategory) { res.style.color = 'red'; res.innerText = '❌ اختار التصنيف الفرعي'; return; }

  let discountText = ''; let discountValue = 0;

  if (type === 'percent') {
    if (!percent || percent < 1 || percent > 100) { res.style.color = 'red'; res.innerText = '❌ النسبة لازم بين 1 و 100'; return; }
    discountText = percent + '% OFF'; discountValue = percent;
  } else if (type === '1+1') { discountText = '1+1'; discountValue = 50; }
  else if (type === '2+1') { discountText = '2+1'; discountValue = 33; }
  else if (type === '3+1') { discountText = '3+1'; discountValue = 25; }
  else if (type === 'custom') {
    if (!custom) { res.style.color = 'red'; res.innerText = '❌ اكتب وصف الخصم'; return; }
    discountText = custom; discountValue = 0;
  }

  const btn = document.getElementById('saveOfferEditBtn');
  if (btn) { btn.disabled = true; btn.innerText = '⏳ جاري الحفظ...'; }

  try {
    let imageBase64 = null; let keepImage = true;

    if (uploadedEditOfferImage === 'DELETE') keepImage = false;
    else if (uploadedEditOfferImage) imageBase64 = uploadedEditOfferImage;

    await updateOffer({
      offerId: id, title, discount: discountText, discountValue,
      description, imageBase64, price, keepImage, category, subCategory
    });

    const offerIndex = allOffers.findIndex(o => o.id === id);
    if (offerIndex > -1) {
      allOffers[offerIndex] = {
        ...allOffers[offerIndex],
        title, discount: discountText, discount_value: discountValue,
        description, price, category, sub_category: subCategory,
        image_url: imageBase64 ? imageBase64 : (keepImage ? allOffers[offerIndex].image_url : null)
      };
    }

    res.style.color = 'green'; res.innerText = '✅ تم حفظ التعديلات';
    
    setTimeout(() => {
      window.closeEditOfferModal();
      if (currentMerchant) renderDashboard();
      if (window.resetOffersLimit) window.resetOffersLimit();
      renderOffersGrid(); 
    }, 1000);

  } catch (e) { 
    res.style.color = 'red'; 
    res.innerText = '❌ ' + e.message; 
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = '💾 حفظ التعديلات'; }
  }
}

// ============================================================
// ✅ حفظ نسبة الكاش باك
// ============================================================
async function handleSaveRate() {
  const rate = parseInt($('rateSlider').value);
  const res = $('rateSaveResult');
  try {
    await updateCashbackRate(currentMerchant.id, rate);
    currentMerchant.cashback_rate = rate;
    res.style.color = 'green'; 
    res.innerText = '✅ تم الحفظ';
    setTimeout(() => res.innerText = '', 2000);
  } catch (e) { 
    res.style.color = 'red'; 
    res.innerText = '❌ ' + e.message; 
  }
}

function updateRateDisplay() {
  const v = parseInt($('rateSlider').value);
  $('rateValueDisplay').innerText = v;
  const tier = getTier(v);
  $('rateTierDisplay').innerHTML = `${tier.icon} ${tier.name}`;
}

function handleOfferImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    uploadedOfferImage = ev.target.result;
    const f = $('offerFileName'); if (f) f.innerText = '📎 ' + file.name;
    const p = $('offerImagePreview');
    if (p) { p.src = ev.target.result; p.style.display = 'block'; }
  };
  reader.readAsDataURL(file);
}

// ============================================================
// ✅ Reports & Analytics
// ============================================================
async function renderReports(period) {
  if (!currentMerchant) return;
  document.querySelectorAll('.report-period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === period));
  const r = await getReportData(currentMerchant.id, period);
  $('reportPeriodLabel').innerText = '📅 ' + r.periodLabel;
  $('repInvoices').innerText = r.invoicesCount;
  $('repSales').innerText = r.sales.toFixed(2) + ' ج';
  $('repGiven').innerText = r.cbGiven.toFixed(2) + ' ج';
  $('repSpent').innerText = r.cbSpent.toFixed(2) + ' ج';
  $('reportDetails').innerHTML = `
    <div style="border-top:1px solid #eee;margin-top:15px;padding-top:15px">
      <h5 style="margin-bottom:10px;color:var(--primary)">📋 تفاصيل إضافية</h5>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="report-detail-box"><span class="lbl">👥 عملاء فريدين</span><span class="val">${r.uniqueCustomers}</span></div>
        <div class="report-detail-box"><span class="lbl">💰 متوسط الفاتورة</span><span class="val">${r.avgInvoice} ج</span></div>
        <div class="report-detail-box" style="background:#d1fae5"><span class="lbl" style="color:#065f46">💵 المتبقي</span><span class="val" style="color:#065f46">${r.cbRemaining.toFixed(2)} ج</span></div>
      </div>
    </div>`;
}

function exportReportPDF() {
  if (typeof html2pdf === 'undefined') { toast('❌ المكتبة مش محملة', 'error'); return; }
  const element = document.getElementById('reportContent');
  const opt = { margin: 10, filename: `PAMIGO-Report-${Date.now()}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
  html2pdf().set(opt).from(element).save();
}

async function renderAnalyticsTab() {
  if (!currentMerchant) return;
  try {
    const offers = await getMerchantOffers(currentMerchant.id);
    const a = await getAnalytics(currentMerchant.id, currentMerchant.name, offers);
    $('anaTotalCustomers').innerText = a.totalCustomers;
    $('anaAvgSpend').innerText = a.avgSpend + ' ج';
    $('anaTopDay').innerText = a.topDay;
    $('anaTopHour').innerText = a.topHour;
    $('anaTopOffer').innerText = a.topOffer;
    $('anaAvgRating').innerText = a.avgRating;
    $('anaRepeatCustomers').innerText = a.repeatCount;
    $('anaGrowth').innerText = a.growth;
  } catch (e) { console.error(e); }
}

// ============================================================
// ✅ ADMIN
// ============================================================
async function renderAdminSection(section) {
  document.querySelectorAll('.admin-subtab').forEach(b => b.classList.toggle('active', b.dataset.admin === section));
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  const el = $('admin-' + section);
  if (el) el.classList.add('active');

  if (section === 'dashboard') await renderAdminDashboard();
  if (section === 'traders') await renderAdminTraders();
  if (section === 'customers') await renderAdminCustomers();
  if (section === 'invoices') await renderAdminInvoices();
  if (section === 'requests') await renderAdminRequests();
  if (section === 'notifications') await renderAdminNotifHistory();
  if (section === 'events') await renderOfferEventsTable();
}

async function renderAdminDashboard() {
  const s = await getAdminStats();
  $('admTraders').innerText = s.tradersCount;
  $('admCustomers').innerText = s.customersCount;
  $('admInvoices').innerText = s.invoicesCount;
  $('admSales').innerText = s.sales.toFixed(2) + ' ج';
  $('admGiven').innerText = s.cbGiven.toFixed(2) + ' ج';
  $('admSpent').innerText = s.cbSpent.toFixed(2) + ' ج';
  $('admRemaining').innerText = s.cbRemaining.toFixed(2) + ' ج';
  $('admOffers').innerText = s.offersCount;
}

async function renderAdminTraders() {
  adminData.merchants = await getAllMerchants();
  const el = $('adminTradersList');
  const search = ($('adminTraderSearch')?.value || '').trim().toLowerCase();
  let list = adminData.merchants;

  if (search) list = list.filter(m => (m.name || '').toLowerCase().includes(search) || (m.phone || '').includes(search) || (m.bank_code || '').toLowerCase().includes(search));
  if (!list.length) { el.innerHTML = `<p style="color:#6b7280;text-align:center;padding:20px">${search ? '🔍 مفيش نتائج مطابقة' : 'لا يوجد تجار'}</p>`; return; }

  el.innerHTML = list.map(m => {
    const rate = m.cashback_rate || 15;
    const logo = m.logo_url ? `<img src="${escapeHtml(m.logo_url)}" style="width:32px;height:32px;object-fit:cover;border-radius:8px;vertical-align:middle">` : escapeHtml(m.icon || '🏪');
    const typeBadge = m.merchant_type === 'warehouse' ? '📦' : (m.merchant_type === 'both' ? '🔄' : '🏪');
    return `<div class="admin-item">
      <div class="head">
        <span class="title">${logo} ${escapeHtml(m.name)} ${typeBadge}</span>
        ${m.frozen ? '<span class="frozen-badge">❄️ موقوف</span>' : '<span class="active-badge">✅ نشط</span>'}
      </div>
      <div class="info">🔑 ${escapeHtml(m.bank_code)} | 📱 ${escapeHtml(m.phone || '-')} | 💰 ${rate}%</div>
      <div class="info">📍 ${m.lat?.toFixed(4) || '-'} , ${m.lng?.toFixed(4) || '-'}</div>
      <div class="info">📂 ${escapeHtml(m.category)} | 🎁 ${(m.offers || []).length} عرض${m.delivery_available ? ' | 🛵 توصيل' : ''}</div>
      <div class="actions">
        <button class="admin-btn primary" onclick="window.adminEditMerchantFull('${escapeJs(m.id)}')">✏️ تعديل كامل</button>
        <button class="admin-btn success" onclick="window.openMerchantReport('${escapeJs(m.id)}')">📊 تقرير</button>
        <button class="admin-btn ${m.frozen ? 'success' : 'warning'}" onclick="window.toggleFreeze('${escapeJs(m.id)}')">${m.frozen ? '✅ إلغاء' : '❄️ إيقاف'}</button>
        <button class="admin-btn purple" onclick="window.adminChangePassMerchant('${escapeJs(m.id)}')">🔒 كلمة المرور</button>
        <button class="admin-btn danger" onclick="window.delTrader('${escapeJs(m.id)}')">🗑️ حذف</button>
      </div>
    </div>`;
  }).join('');
}

function adminEditMerchantFull(id) {
  const m = adminData.merchants.find(x => x.id === id);
  if (!m) return;

  $('editTraderId').value = m.id;
  $('editTraderName').value = m.name || '';
  $('editTraderBankCode').value = m.bank_code || '';
  $('editTraderPhone').value = m.phone || '';
  $('editTraderCategory').value = m.category || 'fashion';
  $('editTraderType').value = m.merchant_type || 'shop';
  $('editTraderWhatsapp').value = m.whatsapp || '';
  $('editTraderLat').value = m.lat || '';
  $('editTraderLng').value = m.lng || '';
  $('editTraderRate').value = m.cashback_rate || 15;
  $('editTraderDelivery').checked = m.delivery_available || false;
  $('editTraderDeliveryPhone').value = m.delivery_phone || '';

  renderEditTraderSubs(m.sub_categories || []);
  $('editTraderDeliveryWrap').style.display = m.delivery_available ? 'block' : 'none';

  $('addTraderForm').style.display = 'none';
  $('editTraderForm').style.display = 'block';
  $('editTraderForm').scrollIntoView({ behavior: 'smooth' });
}

async function adminChangePassMerchant(merchantId) {
  const m = adminData.merchants.find(x => x.id === merchantId);
  if (!m || !m.owner_id) { toast('❌ التاجر ده مش مرتبط بحساب', 'error'); return; }
  const newPass = prompt('اكتب كلمة المرور الجديدة (6+ أحرف):');
  if (!newPass || newPass.length < 6) { toast('❌ قصيرة', 'error'); return; }
  try { await adminChangePassword(m.owner_id, newPass); toast('✅ تم تغيير كلمة المرور', 'success'); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
}

async function toggleFreeze(id) {
  const m = adminData.merchants.find(x => x.id === id);
  if (!m) return;
  try { await freezeMerchant(id, !m.frozen); renderAdminTraders(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
}

async function delTrader(id) {
  if (!confirm('متأكد من الحذف؟')) return;
  try { await deleteMerchant(id); renderAdminTraders(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
}

async function renderAdminCustomers() {
  adminData.customers = await getAllCustomers();
  const el = $('adminCustomersList');
  const search = ($('adminCustomerSearch')?.value || '').trim().toLowerCase();
  let list = adminData.customers;

  if (search) list = list.filter(c => (c.name || '').toLowerCase().includes(search) || (c.phone || '').includes(search) || (c.email || '').toLowerCase().includes(search));
  if (!list.length) { el.innerHTML = `<p style="color:#6b7280;text-align:center;padding:20px">${search ? '🔍 مفيش نتائج مطابقة' : 'لا يوجد عملاء'}</p>`; return; }

  el.innerHTML = list.map(c => `
    <div class="admin-item">
      <div class="head">
        <span class="title">📱 ${escapeHtml(c.phone)}${c.name ? ' - ' + escapeHtml(c.name) : ''}</span>
        <span class="active-badge">✅ نشط</span>
      </div>
      <div class="info">🏪 ${c.shops} تاجر | 💰 كسب: ${c.earned.toFixed(2)} | 💵 صرف: ${c.spent.toFixed(2)}</div>
      <div class="info">📊 الرصيد: <strong>${c.balance.toFixed(2)} ج</strong>${c.email ? ' | 📧 ' + escapeHtml(c.email) : ''}</div>
      <div class="actions">
        <button class="admin-btn primary" onclick="window.adminEditCustomerFull('${escapeJs(c.phone)}')">✏️ تعديل بيانات</button>
        <button class="admin-btn purple" onclick="window.adminChangePassCustomer('${escapeJs(c.id)}')">🔒 كلمة المرور</button>
        <button class="admin-btn success" onclick="window.adminAdjustBal('${escapeJs(c.phone)}')">💰 رصيد</button>
        <button class="admin-btn warning" onclick="window.adminResetBal('${escapeJs(c.phone)}')">🔄 تصفير</button>
        <button class="admin-btn danger" onclick="window.adminDelCustomer('${escapeJs(c.phone)}')">🗑️ حذف</button>
      </div>
    </div>`).join('');
}

async function adminEditCustomerFull(phone) {
  const c = adminData.customers.find(x => x.phone === phone);
  if (!c) return;
  const newName = prompt(`الاسم الحالي: ${c.name || 'مش محدد'}\nالجديد:`, c.name || '');
  if (newName === null) return;
  const newPhone = prompt(`الموبايل الحالي: ${c.phone}\nالجديد:`, c.phone);
  if (newPhone === null) return;
  try { await adminUpdateCustomer(phone, newName.trim(), newPhone.trim()); toast('✅ تم التعديل', 'success'); renderAdminCustomers(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
}

async function adminChangePassCustomer(userId) {
  const newPass = prompt('اكتب كلمة المرور الجديدة (6+):');
  if (!newPass || newPass.length < 6) { toast('❌ قصيرة', 'error'); return; }
  try { await adminChangePassword(userId, newPass); toast('✅ تم', 'success'); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
}

async function adminAdjustBal(phone) {
  const merchants = adminData.merchants.length ? adminData.merchants : await getAllMerchants();
  const list = merchants.map((m, i) => `${i + 1} - ${m.name}`).join('\n');
  const idx = prompt(`اختار التاجر (رقم):\n${list}`);
  if (!idx) return;
  const m = merchants[parseInt(idx) - 1];
  if (!m) return;
  const amount = prompt('اكتب المبلغ (موجب للإضافة، سالب للخصم):');
  if (!amount) return;
  const a = parseFloat(amount);
  if (isNaN(a)) return;
  try { await adjustCustomerBalance(phone, m.id, a); toast('✅ تم', 'success'); renderAdminCustomers(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
}

async function adminResetBal(phone) {
  if (!confirm('تصفير كل الرصيد؟')) return;
  try { await resetCustomerBalance(phone); toast('✅ تم', 'success'); renderAdminCustomers(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
}

async function adminDelCustomer(phone) {
  if (!confirm(`حذف حساب العميل ${phone}؟`)) return;
  try { await deleteCustomer(phone); toast('✅ تم', 'success'); renderAdminCustomers(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
}

async function renderAdminInvoices() {
  const search = $('adminInvoiceSearch')?.value || '';
  adminData.invoices = await getAllInvoices(search);
  const el = $('adminInvoicesList');

  if (!adminData.invoices.length) { el.innerHTML = '<p style="color:#6b7280">لا توجد فواتير</p>'; return; }

  el.innerHTML = adminData.invoices.map(inv => {
    const statusBadge = inv.status === 'active' ? '<span class="active-badge">✅ نشطة</span>' : `<span class="blocked-badge">❌ ${inv.status === 'returned' ? 'مرتجع' : 'مرتجع جزئي'}</span>`;
    return `<div class="admin-item">
      <div class="head">
        <span class="title">📄 #${escapeHtml(inv.number)}</span>
        <span style="color:#ff6b35;font-weight:700">${parseFloat(inv.amount).toFixed(2)} ج</span>
      </div>
      <div class="info">🏪 ${escapeHtml(inv.merchants?.name || '')} | 📱 ${escapeHtml(inv.customer_phone || '-')} | 💵 كاش باك ${parseFloat(inv.cashback).toFixed(2)} ج</div>
      <div class="info">${statusBadge}</div>
      <div class="info" style="font-size:12px">🕒 ${new Date(inv.created_at).toLocaleString('ar-EG')}</div>
      <div class="actions">
        ${inv.status === 'active' ? `
          <button class="admin-btn primary" onclick="window.adminEditInv('${escapeJs(inv.id)}')">✏️ تعديل</button>
          <button class="admin-btn danger" onclick="window.adminReturnInv('${escapeJs(inv.id)}')">🔄 مرتجع</button>
        ` : ''}
        <button class="admin-btn danger" onclick="window.adminDeleteWithCashback('${escapeJs(inv.id)}')">🗑️ حذف + كاش باك</button>
        <button class="admin-btn warning" onclick="window.adminDeleteOnly('${escapeJs(inv.id)}')">🗑️ حذف فقط</button>
      </div>
    </div>`;
  }).join('');
}

async function adminEditInv(id) {
  const inv = adminData.invoices.find(i => i.id === id);
  if (!inv) return;
  const newAmount = prompt(`المبلغ الحالي: ${inv.amount} ج\nالجديد:`, inv.amount);
  if (newAmount === null) return;
  const a = parseFloat(newAmount);
  if (isNaN(a) || a <= 0) { toast('❌ غير صحيح', 'error'); return; }
  if (a > parseFloat(inv.amount)) { toast('❌ لا يمكن الزيادة', 'error'); return; }
  try { await editInvoiceAdmin(id, a, null); toast('✅ تم', 'success'); renderAdminInvoices(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
}

async function adminReturnInv(id) {
  const inv = adminData.invoices.find(i => i.id === id);
  if (!inv) return;
  const amount = prompt("مبلغ المرتجع (أو 'الكل'):");
  if (amount === null) return;
  const r = amount === 'الكل' ? parseFloat(inv.amount) : parseFloat(amount);
  if (isNaN(r) || r <= 0) { toast('❌ غير صحيح', 'error'); return; }
  try { await returnInvoiceAdmin(id, r); toast('✅ تم', 'success'); renderAdminInvoices(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
}

async function adminDeleteWithCashback(id) {
  if (!confirm('⚠️ حذف الفاتورة + الكاش باك من محفظة العميل؟\n\nده هيأثر على رصيد العميل.')) return;
  try { await deleteInvoice(id, true); toast('✅ تم حذف الفاتورة + الكاش باك', 'success'); renderAdminInvoices(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
}

async function adminDeleteOnly(id) {
  if (!confirm('حذف الفاتورة فقط؟\n\nالكاش باك هيفضل في محفظة العميل.')) return;
  try { await deleteInvoice(id, false); toast('✅ تم حذف الفاتورة فقط', 'success'); renderAdminInvoices(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
}

async function renderAdminRequests() {
  const el = $('adminRequestsList');
  try {
    const reqs = await adminGetAllRequests();
    if (!reqs.length) { el.innerHTML = '<p style="color:#6b7280">لا توجد طلبات</p>'; return; }
    el.innerHTML = reqs.map(r => {
      const responses = r.request_responses || [];
      const respHtml = responses.map(resp => {
        const m = resp.merchants || {};
        return `<div style="background:#f9fafb;padding:8px;border-radius:8px;margin-top:6px;border-right:3px solid var(--primary);font-size:12px">
          <strong>🏪 ${escapeHtml(m.name || '')}</strong> • 💰 ${parseFloat(resp.price || 0).toFixed(0)} ج
          <div style="color:#6b7280">${escapeHtml(resp.message || '')}</div>
        </div>`;
      }).join('');
      return `<div class="admin-item">
        <div class="head"><span class="title">📦 ${escapeHtml(r.product)}</span>${getStatusBadge(r.status)}</div>
        <div class="info">${escapeHtml(r.details || '')}</div>
        <div class="info" style="font-size:12px">🕒 ${new Date(r.created_at).toLocaleString('ar-EG')}</div>
        ${respHtml}
      </div>`;
    }).join('');
  } catch (e) { el.innerHTML = '<p style="color:#ef4444">' + e.message + '</p>'; }
}

async function renderAdminNotifHistory() {
  const notifs = await getNotifications();
  const el = $('adminNotifHistory');
  if (!notifs.length) { el.innerHTML = '<p style="color:#6b7280">لا توجد إشعارات</p>'; return; }
  el.innerHTML = notifs.map(n => `
    <div class="admin-item">
      <div class="head"><span class="title">📢 ${escapeHtml(n.title)}</span></div>
      <div class="info">${escapeHtml(n.message)}</div>
      <div class="info" style="font-size:12px">🕒 ${new Date(n.created_at).toLocaleString('ar-EG')}</div>
    </div>`).join('');
}

async function renderOfferEventsTable() {
  const container = $('adminOfferEventsList');
  if (!container) return;
  container.innerHTML = '<p style="text-align:center;padding:20px;color:#6b7280">جاري التحميل...</p>';
  const events = await getAdminOfferEventsStats();
  if (!events.length) { container.innerHTML = '<p style="text-align:center;padding:20px;color:#6b7280">مفيش تفاعل لحد دلوقتي</p>'; return; }
  container.innerHTML = events.map(e => `
    <div class="admin-item">
      <div class="head">
        <span class="title">${escapeHtml(e.merchant_icon)} ${escapeHtml(e.merchant_name)}</span>
        <span style="background:#dbeafe;color:#1e40af;font-size:12px;padding:3px 12px;border-radius:20px;font-weight:700">${e.total} تفاعل</span>
      </div>
      <div class="info">📦 ${escapeHtml(e.offer_title)} | 💰 ${escapeHtml(e.offer_discount)}</div>
      <div class="info" style="display:flex;gap:14px;flex-wrap:wrap;margin-top:8px">
        <span>👁️ مشاهدات: <strong>${e.views}</strong></span>
        <span>👆 ضغطات: <strong>${e.clicks}</strong></span>
        <span>📞 تواصل: <strong>${e.contacts}</strong></span>
        <span>📍 خرائط: <strong>${e.maps}</strong></span>
      </div>
    </div>`).join('');
}

async function handleSendNotif() {
  const title = $('notifTitle').value.trim();
  const message = $('notifMessage').value.trim();
  const target = $('notifTarget').value;
  const res = $('notifResult');
  if (!title || !message) { res.style.color = 'red'; res.innerText = '❌ املأ البيانات'; return; }
  try {
    await sendNotification({ title, message, target });
    res.style.color = 'green'; res.innerText = '✅ تم الإرسال';
    $('notifTitle').value = ''; $('notifMessage').value = '';
    setTimeout(() => { res.innerText = ''; renderAdminNotifHistory(); }, 1500);
  } catch (e) { res.style.color = 'red'; res.innerText = '❌ ' + e.message; }
}

function renderNewTraderSubs() {
  const cat = $('newTraderCategory').value;
  const subs = SUB_CATEGORIES[cat] || [];
  $('newTraderSubs').innerHTML = subs.map(s => `<button type="button" class="category-chip" data-sub="${escapeHtml(s.id)}">${escapeHtml(s.name)}</button>`).join('');
  $('newTraderSubs').querySelectorAll('.category-chip').forEach(btn => { btn.onclick = () => btn.classList.toggle('active'); });
}

function renderEditTraderSubs(selected = []) {
  const cat = $('editTraderCategory').value;
  const subs = SUB_CATEGORIES[cat] || [];
  $('editTraderSubs').innerHTML = subs.map(s => `<button type="button" class="category-chip ${selected.includes(s.id) ? 'active' : ''}" data-sub="${escapeHtml(s.id)}">${escapeHtml(s.name)}</button>`).join('');
  $('editTraderSubs').querySelectorAll('.category-chip').forEach(btn => { btn.onclick = () => btn.classList.toggle('active'); });
}

async function handleSaveTraderEdit() {
  const id = $('editTraderId').value;
  const res = $('editTraderResult');

  const name = $('editTraderName').value.trim();
  const bankCode = $('editTraderBankCode').value.trim();
  const phone = $('editTraderPhone').value.trim();
  const category = $('editTraderCategory').value;
  const merchantType = $('editTraderType').value;
  const whatsapp = $('editTraderWhatsapp').value.trim() || null;
  const lat = parseFloat($('editTraderLat').value);
  const lng = parseFloat($('editTraderLng').value);
  const rate = parseInt($('editTraderRate').value);
  const deliveryAvailable = $('editTraderDelivery').checked;
  const deliveryPhone = $('editTraderDeliveryPhone').value.trim() || null;

  if (!name || !bankCode || !phone) { res.style.color = 'red'; res.innerText = '❌ املأ الحقول الأساسية'; return; }
  if (isNaN(rate) || rate < 1 || rate > 50) { res.style.color = 'red'; res.innerText = '❌ نسبة غير صحيحة'; return; }

  const subs = [];
  $('editTraderSubs').querySelectorAll('.category-chip.active').forEach(b => subs.push(b.dataset.sub));
  if (!subs.length) { res.style.color = 'red'; res.innerText = '❌ اختار تصنيف فرعي'; return; }

  try {
    await adminUpdateMerchant(id, { name, phone, bankCode, category, subCategories: subs, lat: isNaN(lat) ? null : lat, lng: isNaN(lng) ? null : lng, rate, deliveryAvailable, deliveryPhone, merchantType, whatsapp });
    res.style.color = 'green'; res.innerText = '✅ تم الحفظ';
    setTimeout(() => { $('editTraderForm').style.display = 'none'; res.innerText = ''; renderAdminTraders(); }, 1500);
  } catch (e) { res.style.color = 'red'; res.innerText = '❌ ' + e.message; }
}

async function handleAddTrader() {
  const name = $('newTraderName').value.trim();
  const bankCode = $('newTraderBankCode').value.trim();
  const phone = $('newTraderPhone').value.trim();
  const category = $('newTraderCategory').value;
  const merchantType = $('newTraderType')?.value || 'shop';
  const whatsapp = $('newTraderWhatsapp')?.value.trim() || null;
  const lat = parseFloat($('newTraderLat').value);
  const lng = parseFloat($('newTraderLng').value);
  const rate = parseInt($('newTraderRate').value);
  const res = $('addTraderResult');

  const deliveryAvailable = $('newTraderDelivery')?.checked || false;
  const deliveryPhone = $('newTraderDeliveryPhone')?.value.trim() || null;

  if (!name || !bankCode || !phone) { res.style.color = 'red'; res.innerText = '❌ املأ الحقول'; return; }
  if (merchantType !== 'warehouse' && (isNaN(lat) || isNaN(lng))) { res.style.color = 'red'; res.innerText = '❌ إحداثيات'; return; }
  if (isNaN(rate) || rate < 1 || rate > 50) { res.style.color = 'red'; res.innerText = '❌ نسبة غير صحيحة'; return; }
  if (deliveryAvailable && !deliveryPhone) { res.style.color = 'red'; res.innerText = '❌ اكتب رقم التوصيل'; return; }

  const subs = [];
  $('newTraderSubs').querySelectorAll('.category-chip.active').forEach(b => subs.push(b.dataset.sub));
  if (!subs.length) { res.style.color = 'red'; res.innerText = '❌ اختار تصنيف فرعي'; return; }

  try {
    await addTrader({ bankCode, name, phone, category, subCategories: subs, icon: CATEGORY_ICONS[category] || '🏪', lat: isNaN(lat) ? null : lat, lng: isNaN(lng) ? null : lng, rate, deliveryAvailable, deliveryPhone, merchantType, whatsapp });
    res.style.color = 'green'; res.innerText = `✅ تم إضافة ${name}`;
    setTimeout(() => { $('addTraderForm').style.display = 'none'; res.innerText = ''; renderAdminTraders(); }, 1500);
  } catch (e) { res.style.color = 'red'; res.innerText = '❌ ' + e.message; }
}

async function handleGetLocation() {
  const btn = $('newTraderGetLocation');
  if (!btn) return;
  btn.innerText = '⏳ جاري التحديد...';
  const loc = await getUserLocation();
  if (loc) {
    $('newTraderLat').value = loc.lat.toFixed(4);
    $('newTraderLng').value = loc.lng.toFixed(4);
    btn.innerText = '✅ تم تحديد موقعك';
    setTimeout(() => btn.innerText = '📍 استخدم موقعي الحالي', 2000);
  } else {
    btn.innerText = '❌ تعذر التحديد';
    setTimeout(() => btn.innerText = '📍 استخدم موقعي الحالي', 2000);
  }
}

// ============================================================
// ✅ ACCOUNT
// ============================================================
async function initAccountMapUI() {
  if (!currentProfile) return;
  $('accName').innerText = currentProfile.name || '-';
  $('accPhone').innerText = currentProfile.phone || '-';
  $('accEmail').innerText = currentProfile.email || 'لم يتم إضافة إيميل';
  $('myEmail').value = currentProfile.email || '';

  try {
    const wallets = await getUserWalletsBreakdown(currentProfile.id);
    const total = wallets.reduce((s, w) => s + parseFloat(w.balance || 0), 0);
    $('accBalance').innerText = total.toFixed(2) + ' ج';
    $('accInvoicesCount').innerText = (await getMyInvoices(currentProfile.phone)).length;

    if (wallets.length) {
      $('myWalletsCard').style.display = 'block';
      $('customerWalletsBreakdown').innerHTML = wallets.map(w => {
        const m = w.merchants || {};
        return `<div style="background:#f9fafb;padding:10px 14px;border-radius:10px;margin-bottom:6px;border-right:4px solid #10b981">
          <div style="font-weight:600">${escapeHtml(m.icon || '🏪')} ${escapeHtml(m.name || '')}</div>
          <div style="font-size:14px;color:#10b981;font-weight:700;margin-top:4px">💰 ${parseFloat(w.balance).toFixed(2)} ج</div>
        </div>`;
      }).join('');
    } else { $('myWalletsCard').style.display = 'none'; }
  } catch (e) { console.error(e); }

  const stored = JSON.parse(localStorage.getItem('pamigo_user_loc') || 'null');
  const lat = (currentMerchant ? currentMerchant.lat : stored?.lat) || userLat || 31.04;
  const lng = (currentMerchant ? currentMerchant.lng : stored?.lng) || userLng || 31.38;

  if (currentMerchant) {
    $('pickerTitle').innerText = '📍 حدد موقع متجرك';
    $('accLocation').innerText = `${currentMerchant.lat.toFixed(4)}, ${currentMerchant.lng.toFixed(4)}`;
  } else {
    $('pickerTitle').innerText = '📍 حدد موقعك';
    if (stored) $('accLocation').innerText = `${stored.lat.toFixed(4)}, ${stored.lng.toFixed(4)}`;
  }
  initAccountMap('pickerMap', lat, lng);
}

async function handleSearchAddress() {
  const q = $('addressSearch').value.trim();
  const res = $('searchResult');
  if (!q) { res.style.color = 'red'; res.innerText = '❌ اكتب عنوان'; return; }
  res.style.color = '#6b7280'; res.innerText = '⏳ جاري البحث...';
  try {
    const loc = await searchAddress(q);
    setMarkerPosition(loc.lat, loc.lng);
    res.style.color = 'green'; res.innerText = '✅ تم العثور';
  } catch (e) { res.style.color = 'red'; res.innerText = '❌ ' + e.message; }
}

async function handleSaveLocation() {
  const pos = getMarkerPosition();
  const res = $('locationSaveResult');
  if (!pos) { res.style.color = 'red'; res.innerText = '❌ الخريطة لم تُحمّل'; return; }
  try {
    if (currentMerchant) {
      await updateMyMerchantLocation(currentMerchant.id, pos.lat, pos.lng);
      currentMerchant.lat = pos.lat; currentMerchant.lng = pos.lng;
      $('accLocation').innerText = `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`;
      res.style.color = 'green'; res.innerText = '✅ تم حفظ موقع متجرك';
    } else {
      localStorage.setItem('pamigo_user_loc', JSON.stringify(pos));
      userLat = pos.lat; userLng = pos.lng;
      $('accLocation').innerText = `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`;
      res.style.color = 'green'; res.innerText = '✅ تم حفظ موقعك';
    }
    setTimeout(() => res.innerText = '', 3000);
  } catch (e) { res.style.color = 'red'; res.innerText = '❌ ' + e.message; }
}

async function handleChangePassword() {
  const currentPass = $('currentPass').value;
  const newPass = $('newPass').value;
  const confirmPass = $('newPassConfirm').value;
  const res = $('changePassResult');

  if (!currentPass || !newPass || !confirmPass) { res.style.color = '#ef4444'; res.innerText = '❌ املأ كل الحقول'; return; }
  if (newPass !== confirmPass) { res.style.color = '#ef4444'; res.innerText = '❌ كلمتين المرور مش متطابقتين'; return; }
  if (newPass.length < 6) { res.style.color = '#ef4444'; res.innerText = '❌ كلمة المرور 6 أحرف على الأقل'; return; }

  try {
    await changeMyPassword({ currentPassword: currentPass, newPassword: newPass });
    res.style.color = '#10b981'; res.innerText = '✅ تم تغيير كلمة المرور';
    $('currentPass').value = ''; $('newPass').value = ''; $('newPassConfirm').value = '';
    setTimeout(() => { res.innerText = ''; $('changePassForm').style.display = 'none'; }, 2000);
  } catch (e) { res.style.color = '#ef4444'; res.innerText = '❌ ' + e.message; }
}

async function handleSaveEmail() {
  const email = $('myEmail').value.trim();
  const res = $('emailResult');
  if (!email || !email.includes('@')) { res.style.color = '#ef4444'; res.innerText = '❌ إيميل غير صحيح'; return; }
  try {
    await updateMyEmail(email);
    currentProfile.email = email;
    res.style.color = '#10b981'; res.innerText = '✅ تم حفظ الإيميل - شوف بريدك للتفعيل';
    setTimeout(() => res.innerText = '', 3000);
  } catch (e) { res.style.color = '#ef4444'; res.innerText = '❌ ' + e.message; }
}

async function handleSendReset() {
  const email = $('forgotEmail').value.trim();
  const res = $('forgotResult');
  if (!email || !email.includes('@')) { res.style.color = '#ef4444'; res.innerText = '❌ إيميل غير صحيح'; return; }
  try {
    await sendPasswordReset(email);
    res.style.color = '#10b981'; res.innerText = '✅ تم الإرسال - شوف إيميلك';
  } catch (e) { res.style.color = '#ef4444'; res.innerText = '❌ ' + e.message; }
}

// ============================================================
// ✅ AUTH
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
  const loader = document.getElementById('appLoadingScreen');
  if (loader) loader.remove();
}

async function showMainScreen(profile) {
  currentProfile = profile;
  $('authScreen').style.display = 'none';
  $('mainScreen').style.display = 'block';
  $('userRole').innerText = getRoleName(profile.role);
  $('userRole').className = 'role-badge role-' + profile.role;
  $('userName').innerText = profile.name || 'مستخدم';

  if (profile.role === 'merchant') {
    getMyMerchant().then(m => {
      currentMerchant = m;
      if (currentMerchant) { $('merchantName').innerText = currentMerchant.name; }
    });
    $('merchantBanner').style.display = 'block';
  } else {
    currentMerchant = null;
    $('merchantBanner').style.display = 'none';
  }

  updateTabsVisibility();
  switchTab('home'); 
  refreshData(); 
  if (userLat === null) updateLocation();

  if (profile.role === 'merchant') setTimeout(updateOfferReqBadge, 1000);

  if (profile.role === 'customer') {
    setTimeout(async () => {
      try {
        myPendingInvoicesCache = await getMyPendingInvoices(profile.phone);
        updateInvoiceBadge();
      } catch (e) {}
    }, 1000);
  }
}

async function refreshData() {
  const el = $('merchantsList');
  if (el) el.innerHTML = '<div class="no-requests">⏳ جاري التحميل...</div>';
  try {
    await new Promise(resolve => setTimeout(resolve, 300)); 
    allMerchants = await loadMerchants();
    renderTopDeals();
    renderHomeSubCategories();
    renderOffersSubCategories();
    renderMerchantsList();
    renderOffersGrid();
  } catch (e) {
    console.error('refreshData error:', e);
    if (el) el.innerHTML = '<div class="no-requests">❌ فشل تحميل البيانات. حاول تحدّث الصفحة.</div>';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const role = $('loginRole').value;
  const phone = $('loginPhone').value.trim();
  const password = $('loginPassword').value;
  const bankCode = $('loginBankCode') ? getRealValue('loginBankCode') : '';
  const adminCode = $('loginAdminCode') ? getRealValue('loginAdminCode') : '';

  if (!phone || !password) return showMessage('❌ املأ البيانات');
  if (role === 'merchant' && !bankCode) return showMessage('❌ لازم بنكود التاجر');
  if (role === 'admin' && !adminCode) return showMessage('❌ لازم بنكود الأدمن');

  const btn = $('loginBtn');
  btn.disabled = true; btn.innerText = '⏳ جاري الدخول...';
  expectedLogin = { role, bankCode, adminCode };

  try {
    const email = await findEmailByPhone(phone);
    if (!email) throw new Error('الموبايل مش مسجل');
    await signInWithEmail({ email, password });

    const profile = await getProfile();
    if (!profile) throw new Error('الحساب مش موجود');
    if (profile.role !== role) { await signOut(); throw new Error('الدور مش متطابق - حسابك ' + getRoleName(profile.role)); }

    if (role === 'merchant') {
      const m = await getMyMerchant();
      if (!m || (m.bank_code || '').toUpperCase() !== bankCode.toUpperCase()) { await signOut(); throw new Error('البنكود مش بتاع حسابك'); }
    }
    if (role === 'admin') {
      const { data: check, error: checkErr } = await supabase.rpc('verify_admin_code', { p_code: (adminCode || '').trim() });
      if (checkErr || !check.ok) { await signOut(); throw new Error('بنكود الأدمن غير صحيح'); }
    }
    await showMainScreen(profile);
  } catch (err) {
    expectedLogin = null;
    showMessage('❌ ' + translateError(err.message));
    btn.disabled = false; btn.innerText = '🚀 دخول';
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const name = $('signupName').value.trim();
  const phone = $('signupPhone').value.trim();
  const email = $('signupEmail').value.trim().toLowerCase();
  const password = $('signupPassword').value;
  const role = $('signupRole').value;
  const bankCode = getRealValue('signupBankCode');
  const adminCode = getRealValue('signupAdminCode');

  if (!name || !phone || !password || !email) return showMessage('❌ املأ الحقول');
  if (!email.includes('@') || email.length < 5) return showMessage('❌ إيميل غير صحيح');
  if (password.length < 6) return showMessage('❌ الباسورد 6 أحرف على الأقل');
  if (role === 'merchant' && !bankCode) return showMessage('❌ لازم البنكود');
  if (role === 'admin' && !adminCode) return showMessage('❌ لازم بنكود الأدمن');

  const btn = $('signupBtn');
  btn.disabled = true; btn.innerText = '⏳ جاري التسجيل...';

  try {
    if (role === 'merchant') await signUpMerchant({ phone, email, password, name, bankCode });
    else if (role === 'admin') await signUpAdmin({ phone, email, password, name, adminCode });
    else await signUpCustomer({ phone, email, password, name });
    
    showMessage('✅ تم إنشاء الحساب', 'success');
    await signInWithEmail({ email, password });
  } catch (err) { showMessage('❌ ' + translateError(err.message)); }
  finally { btn.disabled = false; btn.innerText = '📝 إنشاء الحساب'; }
}

async function handleLogout() {
  if (!confirm('متأكد؟')) return;
  expectedLogin = null;
  try { await signOut(); } catch (e) { console.error('Logout error:', e); }
  $('mainScreen').style.display = 'none';
  showAuthScreen();
}

function translateError(msg) {
  if (msg.includes('Invalid login credentials')) return 'بيانات غير صحيحة';
  if (msg.includes('User already registered')) return 'الإيميل أو الموبايل مسجل بالفعل';
  if (msg.includes('Password should be at least')) return 'كلمة المرور قصيرة';
  if (msg.includes('Unable to validate email')) return 'إيميل غير صحيح';
  if (msg.includes('already been registered')) return 'الإيميل مسجل بالفعل';
  if (msg.includes('البنكود غير موجود')) return 'البنكود غير موجود';
  if (msg.includes('مرتبط بحساب')) return 'البنكود مستخدم';
  if (msg.includes('بنكود الأدمن غير صحيح')) return 'بنكود الأدمن غير صحيح';
  if (msg.includes('الموبايل مش مسجل')) return 'الموبايل مش مسجل';
  if (msg.includes('rate limit')) return 'حاول تاني';
  return msg;
}

function showAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  $('loginForm').style.display = tab === 'login' ? 'block' : 'none';
  $('signupForm').style.display = tab === 'signup' ? 'block' : 'none';
  $('authMessage').innerText = ''; $('authMessage').className = 'auth-message';
}

function updateBankCodeVisibility() {
  const role = $('signupRole').value;
  $('bankCodeGroup').style.display = role === 'merchant' ? 'block' : 'none';
  $('adminCodeGroup').style.display = role === 'admin' ? 'block' : 'none';
}

function updateLoginVisibility() {
  const role = $('loginRole').value;
  $('loginBankCodeGroup').style.display = role === 'merchant' ? 'block' : 'none';
  $('loginAdminCodeGroup').style.display = role === 'admin' ? 'block' : 'none';
}

// ============================================================
// ✅ Google Login & Complete Profile
// ============================================================
window.handleGoogleLogin = async function() {
  const btn = $('googleLoginBtn');
  if (btn) { btn.disabled = true; btn.innerText = '⏳ جاري التحويل...'; }
  try { await signInWithGoogle(); }
  catch (e) { toast('❌ ' + e.message, 'error'); if (btn) { btn.disabled = false; btn.innerText = '🔵 الدخول بجوجل'; } }
};

window.handleGoogleCallback = async function() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;
  const profile = await getProfile();
  if (!profile || !profile.phone) {
    pendingGoogleUser = session.user;
    openCompleteProfileModal(session.user);
    return true;
  }
  await showMainScreen(profile);
  return true;
};

function openCompleteProfileModal(user) {
  $('completeProfileEmail').innerText = user.email || '';
  $('completeProfilePhone').value = '';
  $('completeProfileName').value = user.user_metadata?.name || '';
  $('completeProfileRole').value = 'customer';
  $('completeProfileBankCodeGroup').style.display = 'none';
  $('completeProfileAdminCodeGroup').style.display = 'none';
  $('completeProfileResult').innerText = '';
  const modal = $('completeProfileModal');
  modal.style.display = 'flex';
  modal.classList.add('active');
}

window.closeCompleteProfileModal = function(e) {
  if (e && e.target && !e.target.classList.contains('modal-overlay')) return;
  const modal = $('completeProfileModal');
  if (!modal) return;
  modal.classList.remove('active');
  modal.style.display = 'none';
  supabase.auth.signOut();
};

window.onCompleteProfileRoleChange = function(value) {
  $('completeProfileBankCodeGroup').style.display = value === 'merchant' ? 'block' : 'none';
  $('completeProfileAdminCodeGroup').style.display = value === 'admin' ? 'block' : 'none';
};

async function handleCompleteProfile() {
  const phone = $('completeProfilePhone').value.trim();
  const name = $('completeProfileName').value.trim();
  const role = $('completeProfileRole').value;
  const bankCode = getRealValue('completeProfileBankCode');
  const adminCode = getRealValue('completeProfileAdminCode');
  const res = $('completeProfileResult');

  if (!phone || !name) { res.style.color = '#ef4444'; res.innerText = '❌ املأ الاسم والموبايل'; return; }
  if (role === 'merchant' && !bankCode) { res.style.color = '#ef4444'; res.innerText = '❌ لازم البنكود'; return; }
  if (role === 'admin' && !adminCode) { res.style.color = '#ef4444'; res.innerText = '❌ لازم بنكود الأدمن'; return; }

  const btn = $('completeProfileBtn');
  btn.disabled = true; btn.innerText = '⏳ جاري الحفظ...';

  try {
    await completeGoogleProfile({ phone, name, role, bankCode, adminCode });
    res.style.color = '#10b981'; res.innerText = '✅ تم حفظ البيانات';
    setTimeout(async () => {
      window.closeCompleteProfileModal();
      const profile = await getProfile();
      if (profile) await showMainScreen(profile);
    }, 1000);
  } catch (e) {
    res.style.color = '#ef4444'; res.innerText = '❌ ' + e.message;
    btn.disabled = false; btn.innerText = '✅ حفظ البيانات';
  }
}

// ============================================================
// ✅ BIND EVENTS
// ============================================================
function bindEvents() {
  $('loginForm').addEventListener('submit', handleLogin);
  $('signupForm').addEventListener('submit', handleSignup);
  $('logoutBtn').addEventListener('click', handleLogout);
  $('signupRole').addEventListener('change', updateBankCodeVisibility);
  $('loginRole').addEventListener('change', updateLoginVisibility);
  $('submitInvoiceBtn').addEventListener('click', handleSubmitInvoice);
  $('redeemBtn').addEventListener('click', handleRedeem);
  $('reqImage').addEventListener('change', handleReqImage);
  $('sendRequestBtn').addEventListener('click', handleSendRequest);
  $('addOfferBtn').addEventListener('click', handleAddOffer);
  $('saveRateBtn').addEventListener('click', handleSaveRate);
  $('rateSlider').addEventListener('input', updateRateDisplay);
  $('exportPdfBtn').addEventListener('click', exportReportPDF);

  document.querySelectorAll('#starContainer .star').forEach(star => {
    star.addEventListener('click', function () {
      const val = parseInt(this.dataset.value);
      selectedRating = val;
      document.querySelectorAll('#starContainer .star').forEach(s => s.classList.toggle('active', parseInt(s.dataset.value) <= val));
    });
  });

  const ratingBtn = $('submitRatingBtn');
  if (ratingBtn) ratingBtn.addEventListener('click', handleSubmitRating);

  const upBtn = $('uploadLogoBtn');
  const delBtn = $('deleteLogoBtn');
  if (upBtn) upBtn.addEventListener('click', handleUploadLogo);
  if (delBtn) delBtn.addEventListener('click', handleDeleteLogo);

  const offerImg = $('offerImage');
  if (offerImg) offerImg.addEventListener('change', handleOfferImage);

  document.querySelectorAll('.report-period-btn').forEach(btn => {
    btn.addEventListener('click', () => renderReports(btn.dataset.period));
  });

  document.querySelectorAll('.admin-subtab').forEach(btn => {
    btn.addEventListener('click', () => renderAdminSection(btn.dataset.admin));
  });

  $('showAddTraderBtn').addEventListener('click', () => {
    $('addTraderForm').style.display = 'block';
    $('editTraderForm').style.display = 'none';
    renderNewTraderSubs();
    const dc = $('newTraderDelivery');
    if (dc) { dc.checked = false; dc.onchange = () => { $('newTraderDeliveryWrap').style.display = dc.checked ? 'block' : 'none'; }; }
    $('newTraderDeliveryWrap').style.display = 'none';
    $('newTraderDeliveryPhone').value = '';
  });
  $('hideAddTraderBtn').addEventListener('click', () => { $('addTraderForm').style.display = 'none'; });
  $('newTraderCategory').addEventListener('change', renderNewTraderSubs);
  $('addTraderConfirmBtn').addEventListener('click', handleAddTrader);

  const editCat = $('editTraderCategory');
  if (editCat) editCat.addEventListener('change', () => renderEditTraderSubs());

  const editDel = $('editTraderDelivery');
  if (editDel) editDel.addEventListener('change', (e) => { $('editTraderDeliveryWrap').style.display = e.target.checked ? 'block' : 'none'; });

  const saveBtn = $('saveTraderBtn');
  if (saveBtn) saveBtn.addEventListener('click', handleSaveTraderEdit);

  const cancelBtn = $('cancelEditTraderBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', () => { $('editTraderForm').style.display = 'none'; $('editTraderResult').innerText = ''; });

  const getLocBtn = $('newTraderGetLocation');
  if (getLocBtn) getLocBtn.addEventListener('click', handleGetLocation);

  $('adminInvoiceSearch').addEventListener('input', () => renderAdminInvoices());
  $('sendNotifBtn').addEventListener('click', handleSendNotif);

  const traderSearch = $('adminTraderSearch');
  if (traderSearch) traderSearch.addEventListener('input', () => renderAdminTraders());

  const customerSearch = $('adminCustomerSearch');
  if (customerSearch) customerSearch.addEventListener('input', () => renderAdminCustomers());

  $('searchAddrBtn').addEventListener('click', handleSearchAddress);
  $('saveLocationBtn').addEventListener('click', handleSaveLocation);

  $('forgotPassLink').addEventListener('click', (e) => {
    e.preventDefault();
    $('forgotModal').classList.add('active');
    $('forgotModal').style.display = 'flex';
  });
  $('sendResetBtn').addEventListener('click', handleSendReset);

  $('openChangePassBtn').addEventListener('click', () => { $('changePassForm').style.display = 'block'; $('emailForm').style.display = 'none'; });
  $('openEmailBtn').addEventListener('click', () => { $('emailForm').style.display = 'block'; $('changePassForm').style.display = 'none'; $('myEmail').value = currentProfile?.email || ''; });

  $('saveNewPassBtn').addEventListener('click', handleChangePassword);
  $('saveEmailBtn').addEventListener('click', handleSaveEmail);

  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => showAuthTab(tab.dataset.tab));
  });

  document.querySelectorAll('#mainTabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  $('refreshLocation').addEventListener('click', updateLocation);

  $('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => { searchQuery = e.target.value.trim(); merchantsDisplayCount = 20; renderMerchantsList(); }, 300);
  });

  $('homeRadiusSlider').addEventListener('input', (e) => {
    homeRadius = parseFloat(e.target.value);
    $('homeRadiusValue').innerText = homeRadius;
    merchantsDisplayCount = 20;
    renderMerchantsList();
  });

  document.querySelectorAll('#homeSortOptions .category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#homeSortOptions .category-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      homeSort = chip.dataset.sort;
      merchantsDisplayCount = 20;
      renderMerchantsList();
    });
  });

  document.querySelectorAll('#viewModeOptions .category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#viewModeOptions .category-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      viewMode = chip.dataset.mode;
      merchantsDisplayCount = 20;
      renderMerchantsList();
    });
  });

  document.querySelectorAll('#homeCategories .category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      toggleCategoryGeneric({ cat: chip.dataset.cat, chip, categories: homeCategories, subs: homeSubCategories, containerId: 'homeCategories', onUpdate: () => { renderHomeSubCategories(); merchantsDisplayCount = 20; renderMerchantsList(); } });
    });
  });

  document.querySelectorAll('#offersCategories .category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      toggleCategoryGeneric({ cat: chip.dataset.cat, chip, categories: offersCategories, subs: offersSubCategories, containerId: 'offersCategories', onUpdate: () => { renderOffersSubCategories(); if (window.resetOffersLimit) window.resetOffersLimit(); renderOffersGrid(); } });
    });
  });

  document.querySelectorAll('#reqFilters .category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#reqFilters .category-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentReqFilter = chip.dataset.filter;
      renderMyRequests();
    });
  });

  const editOfferImg = document.getElementById('editOfferImage');
  if (editOfferImg) {
    editOfferImg.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        uploadedEditOfferImage = ev.target.result;
        const f = document.getElementById('editOfferFileName'); if (f) f.innerText = '📎 ' + file.name;
        const p = document.getElementById('editOfferImagePreview'); if (p) { p.src = ev.target.result; p.style.display = 'block'; }
        const curWrap = document.getElementById('editOfferCurrentImageWrap'); if (curWrap) curWrap.style.display = 'none';
      };
      reader.readAsDataURL(file);
    });
  }

  const saveOfferBtn = document.getElementById('saveOfferEditBtn');
  if (saveOfferBtn) saveOfferBtn.addEventListener('click', handleSaveOfferEdit);

  const sendOfferReqBtn = $('sendOfferRequestBtn');
  if (sendOfferReqBtn) sendOfferReqBtn.addEventListener('click', handleSendOfferRequest);

  const googleBtn = $('googleLoginBtn');
  if (googleBtn) googleBtn.addEventListener('click', handleGoogleLogin);

  const completeBtn = $('completeProfileBtn');
  if (completeBtn) completeBtn.addEventListener('click', handleCompleteProfile);
}

// ============================================================
// ✅ INIT & WINDOW EXPORTS
// ============================================================
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', runInit);
else runInit();

async function runInit() {
  if (!document.getElementById('appLoadingScreen')) {
    const loader = document.createElement('div');
    loader.id = 'appLoadingScreen';
    loader.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#fff;z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:15px;';
    loader.innerHTML = '<div style="width:40px;height:40px;border:4px solid #f3f3f3;border-top:4px solid #1a2a6c;border-radius:50%;animation:spin 1s linear infinite"></div><p style="color:#6b7280;font-weight:bold;font-family:Cairo,sans-serif">جاري التحميل...</p><style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>';
    document.body.appendChild(loader);
  }

  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('mainScreen').style.display = 'none';

  bindEvents();
  showAuthTab('login');
  updateBankCodeVisibility();
  updateLoginVisibility();
  initI18n();

  window.__setLang = setLang;
  window.addEventListener('langChanged', () => {
    if (currentProfile) {
      document.getElementById('userRole').innerText = currentLang === 'ar' ? ({ customer: '👤 عميل', merchant: '🏪 تاجر', admin: '👑 أدمن' })[currentProfile.role] : ({ customer: '👤 Customer', merchant: '🏪 Merchant', admin: '👑 Admin' })[currentProfile.role];
    }
    applyI18nToHTML();
  });

  applyPeekEffect('signupBankCode');
  applyPeekEffect('signupAdminCode');
  applyPeekEffect('loginBankCode');
  applyPeekEffect('loginAdminCode');
  applyPeekEffect('invBankCode');

  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('Auth event:', event);
    if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') return;
    if (event === 'SIGNED_IN' && session) {
      const isGoogle = session.user.app_metadata?.provider === 'google';
      if (isGoogle) {
        const done = await handleGoogleCallback();
        if (!done) { const profile = await getProfile(); if (profile) await showMainScreen(profile); }
      } else {
        const profile = await getProfile(); if (profile) await showMainScreen(profile);
      }
    } else if (event === 'SIGNED_OUT') { showAuthScreen(); }
  });

  try {
    const { data: { session: initialSession } } = await supabase.auth.getSession();
    if (initialSession?.user) {
      const isGoogle = initialSession.user.app_metadata?.provider === 'google';
      if (isGoogle) {
        const done = await handleGoogleCallback();
        if (!done) { const profile = await getProfile(); if (profile) await showMainScreen(profile); }
      } else {
        const profile = await getProfile(); if (profile) await showMainScreen(profile);
      }
    } else { showAuthScreen(); }
  } catch (e) { console.log('getSession error:', e); showAuthScreen(); }
  finally { const loader = document.getElementById('appLoadingScreen'); if (loader) loader.remove(); }
}

// Window Exports
window.switchTab = switchTab;
window.openMerchant = openMerchant;
window.closeMerchantModal = closeMerchantModal;
window.renderOffersGrid = renderOffersGrid;
window.renderMerchantsList = renderMerchantsList;
window.renderRequestsTab = renderRequestsTab;
window.renderInvoiceTab = renderInvoiceTab;
window.renderDashboard = renderDashboard;
window.renderReports = renderReports;
window.renderAnalyticsTab = renderAnalyticsTab;
window.renderAdminSection = renderAdminSection;
window.acceptOfferClick = acceptOfferClick;
window.cancelReqClick = cancelReqClick;
window.deleteReqClick = deleteReqClick;
window.askImageClick = askImageClick;
window.replyToReq = replyToReq;
window.sendExtraImage = sendExtraImage;
window.hideReq = hideReq;
window.deleteOfferClick = deleteOfferClick;
window.editInvClick = editInvClick;
window.returnInvClick = returnInvClick;
window.toggleFreeze = toggleFreeze;
window.delTrader = delTrader;
window.adminEditMerchantFull = adminEditMerchantFull;
window.adminChangePassMerchant = adminChangePassMerchant;
window.adminEditCustomerFull = adminEditCustomerFull;
window.adminChangePassCustomer = adminChangePassCustomer;
window.adminAdjustBal = adminAdjustBal;
window.adminResetBal = adminResetBal;
window.adminDelCustomer = adminDelCustomer;
window.adminEditInv = adminEditInv;
window.adminReturnInv = adminReturnInv;
window.adminDeleteWithCashback = adminDeleteWithCashback;
window.adminDeleteOnly = adminDeleteOnly;
window.renderOfferEventsTable = renderOfferEventsTable;
window.updateOfferReqBadge = updateOfferReqBadge;

window.togglePass = function(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  btn.innerText = isHidden ? '🙈' : '👁️';
};

window.closeForgotModal = function(e) {
  if (e && e.target && !e.target.classList.contains('modal-overlay')) return;
  const modal = document.getElementById('forgotModal');
  modal.classList.remove('active');
  modal.style.display = 'none';
};

window.contactMerchant = function(phone, merchantId) {
  trackOfferEvent({ offerId: null, merchantId, eventType: 'contact' });
  window.location.href = 'tel:' + phone;
};

window.contactDelivery = function(phone, merchantId) {
  trackOfferEvent({ offerId: null, merchantId, eventType: 'contact' });
  window.location.href = 'tel:' + phone;
};

window.openMerchantMap = function(lat, lng, merchantId) {
  trackOfferEvent({ offerId: null, merchantId, eventType: 'maps' });
  window.open('https://www.google.com/maps?q=' + lat + ',' + lng, '_blank');
};

window.openImageLightbox = function(imageUrl) {
  const old = document.getElementById('pamigoLightbox');
  if (old) old.remove();
  const lightbox = document.createElement('div');
  lightbox.id = 'pamigoLightbox';
  lightbox.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.92); z-index: 999999; display: flex; align-items: center; justify-content: center; cursor: zoom-out; padding: 20px; box-sizing: border-box;`;
  lightbox.innerHTML = `<img src="${escapeHtml(imageUrl)}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;box-shadow:0 0 30px rgba(0,0,0,0.5)"><button onclick="document.getElementById('pamigoLightbox').remove()" style="position:absolute;top:20px;left:20px;background:#fff;color:#000;border:none;width:44px;height:44px;border-radius:50%;font-size:22px;cursor:pointer;font-weight:bold;line-height:1">✕</button>`;
  lightbox.onclick = function(e) { if (e.target === lightbox) lightbox.remove(); };
  document.body.appendChild(lightbox);
};

window.trackOfferView = function(offerId, merchantId) {
  trackOfferEvent({ offerId, merchantId, eventType: 'view' });
};

window.onOfferTypeChange = function(value) {
  const percentWrap = document.getElementById('offerPercentWrap');
  const customWrap = document.getElementById('offerCustomWrap');
  if (!percentWrap || !customWrap) return;
  if (value === 'percent') { percentWrap.style.display = 'block'; customWrap.style.display = 'none'; }
  else if (value === 'custom') { percentWrap.style.display = 'none'; customWrap.style.display = 'block'; }
  else { percentWrap.style.display = 'none'; customWrap.style.display = 'none'; }
};
