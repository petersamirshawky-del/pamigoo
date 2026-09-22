import { initI18n, setLang, t, currentLang, applyI18nToHTML } from './i18n.js';
// ============================================================
// PAMIGO - Main Entry (Stage 11-D: UI + Logo + Email)
// ============================================================
import { supabase } from './supabase.js';
import { toast, showLoader, hideLoader } from './ui.js';
import { SUB_CATEGORIES, CATEGORY_ICONS } from './config.js';
import {
  signUpCustomer, signUpMerchant, signUpAdmin, signOut,
  findEmailByPhone, signInWithEmail,
  getProfile, getMyMerchant, onAuthChange,
  applyPeekEffect, getRealValue,
  changeMyPassword, adminChangePassword,
  sendPasswordReset, updateMyEmail
} from './auth.js';
import {
  createInvoice, createInvoiceByBankCode,
  getMerchantInvoices, getMyInvoices,
  getMyWallets, redeemCashback, getMerchantCustomerWallets,
  getMerchantCashbackSummary
} from './invoices.js';
import {
  sendRequest, getMyRequests, getMerchantRequests,
  replyToRequest, acceptOffer, cancelRequest, deleteRequest,
  hideRequestForMerchant, askMerchantForImage, merchantSendExtraImage
} from './requests.js';
import {
  getMerchantStats, getMerchantOffers, addOffer, deleteOffer,
  updateCashbackRate, getMerchantCustomers, getMerchantWallets,
  getMerchantInvoicesList, editInvoice, processReturn,
  getReportData, getAnalytics,
  uploadMerchantLogo, deleteMerchantLogo,
  uploadProductImage, deleteProductImage
} from './dashboard.js';
import {
  getAdminStats, getAllMerchants, getAllCustomers, getAllInvoices,
  addTrader, freezeMerchant, updateMerchantRate, deleteMerchant,
  adjustCustomerBalance, resetCustomerBalance, deleteCustomer,
  editInvoiceAdmin, returnInvoiceAdmin, deleteInvoice,
  sendNotification, getNotifications,
  adminUpdateMerchant, adminUpdateCustomer, adminGetAllRequests
} from './admin.js';
import {
  getUserWalletsBreakdown, initAccountMap, getMarkerPosition,
  setMarkerPosition, searchAddress, updateMyMerchantLocation
} from './account.js';

const $ = (id) => document.getElementById(id);

// ============================================================
// State
// ============================================================
let currentProfile = null;
let currentMerchant = null;
let allMerchants = [];
let userLat = null, userLng = null;
let searchQuery = '';
let homeRadius = 2, homeCategories = ['all'], homeSubCategories = [], homeSort = 'nearest';
let offersCategories = ['all'], offersSubCategories = [];
let currentModalMerchant = null;
let uploadedReqImage = null;
let currentReqFilter = 'all';
let myRequestsCache = [];
let adminData = { merchants: [], customers: [], invoices: [] };
let expectedLogin = null;
let uploadedOfferImage = null;

// ============================================================
// Load merchants
// ============================================================
async function loadMerchants() {
  const { data, error } = await supabase
    .from('merchants')
    .select(`
      id, bank_code, name, phone, category, sub_categories,
      icon, logo_url, lat, lng, cashback_rate, frozen,
      offers ( id, title, discount, image_url ),
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

// ============================================================
// Logo HTML helper
// ============================================================
function logoImgHtml(m) {
  if (m.logo_url) {
    return `<img src="${m.logo_url}" alt="${m.name}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit" onerror="this.parentElement.innerHTML='${m.icon || '🏪'}'">`;
  }
  return m.icon || '🏪';
}

// ============================================================
// Render: merchants list
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
  if (!list.length) { el.innerHTML = `<div class="no-requests">😅 لا توجد نتائج</div>`; return; }

  el.innerHTML = list.map(m => {
    const rate = m.cashback_rate || 15;
    const tier = getTier(rate);
    const maxDisc = getMaxDiscount(m);
    const rating = getAvgRating(m);
    const dist = m._dist ? m._dist.toFixed(2) + ' كم' : '';
    let subNames = '';
    if (m.sub_categories && m.sub_categories.length) {
      const l = SUB_CATEGORIES[m.category] || [];
      subNames = m.sub_categories.map(id => (l.find(x => x.id === id) || {}).name || id).join(', ');
    }
    return `
      <div class="store-item" onclick="openMerchant('${m.bank_code}')">
        <div class="icon" style="overflow:hidden">${logoImgHtml(m)}</div>
        <div class="info">
          <h4>${m.name} <span class="tier-chip ${tier.cls}">${tier.icon} ${tier.name}</span></h4>
          <div class="desc">${dist ? dist + ' • ' : ''}${(m.offers || []).length} عرض • كاش باك ${rate}%${maxDisc ? ' • خصم لحد ' + maxDisc + '%' : ''}</div>
          ${subNames ? `<div style="font-size:11px;color:#8b5cf6;margin-top:2px">${subNames}</div>` : ''}
          <div style="font-size:12px;color:#f59e0b;margin-top:2px">${rating ? '⭐'.repeat(Math.floor(rating)) + ' ' + rating : '⭐ لا تقييمات'}</div>
        </div>
        <div class="badge">${rate}%</div>
      </div>
    `;
  }).join('');
}

function renderTopDeals() {
  const sorted = [...allMerchants].filter(m => (m.offers || []).length > 0)
    .sort((a, b) => (b.cashback_rate || 0) - (a.cashback_rate || 0)).slice(0, 10);
  const el = $('dealsScroll');
  if (!sorted.length) { el.innerHTML = ''; return; }
  el.innerHTML = sorted.map(m => {
    const rate = m.cashback_rate || 15;
    const tier = getTier(rate);
    return `
      <div class="deal-card" onclick="openMerchant('${m.bank_code}')">
        <div class="tier-badge">${tier.icon}</div>
        <div class="discount">${rate}%</div>
        <div class="icon" style="overflow:hidden;display:flex;align-items:center;justify-content:center;border-radius:16px">${logoImgHtml(m)}</div>
        <div class="tag">${m.name}</div>
        <div style="font-size:11px;color:#ff6b35;margin-top:4px">كاش باك ${rate}%</div>
      </div>
    `;
  }).join('');
}

function renderOffersGrid() {
  let list = [...allMerchants].filter(m => (m.offers || []).length > 0)
    .filter(m => matchesCatSubs(m, offersCategories, offersSubCategories));
  const el = $('offersGrid');
  if (!list.length) { el.innerHTML = `<p style="text-align:center;padding:20px;color:#6b7280">لا توجد عروض</p>`; return; }
  el.innerHTML = list.map(m => {
    const rate = m.cashback_rate || 15;
    const tier = getTier(rate);
    return `
      <div class="deal-card" onclick="openMerchant('${m.bank_code}')" style="min-width:auto;text-align:center">
        <div class="tier-badge">${tier.icon}</div>
        <div style="width:70px;height:70px;margin:0 auto;border-radius:16px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:var(--bg-soft);font-size:48px">
          ${logoImgHtml(m)}
        </div>
        <div class="discount" style="font-size:20px">${rate}%</div>
        <div style="font-size:13px;font-weight:600">${m.name}</div>
        <div style="font-size:11px;color:#ff6b35;margin-top:4px">كاش باك ${rate}%</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">${(m.offers || []).length} عرض</div>
      </div>
    `;
  }).join('');
}

function renderSubCategoriesGeneric({ categories, subs, wrapperEl, containerEl, onToggle }) {
  const singleCat = categories.length === 1 && categories[0] !== 'all' ? categories[0] : null;
  if (!singleCat || !SUB_CATEGORIES[singleCat]) { wrapperEl.style.display = 'none'; return; }
  wrapperEl.style.display = 'block';
  const list = SUB_CATEGORIES[singleCat];
  containerEl.innerHTML = list.map(sub => `
    <button class="category-chip ${subs.includes(sub.id) ? 'active' : ''}" data-sub="${sub.id}">${sub.name}</button>
  `).join('');
  containerEl.querySelectorAll('.category-chip').forEach(btn => {
    btn.addEventListener('click', () => onToggle(btn.dataset.sub, btn));
  });
}

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
    categories: homeCategories, subs: homeSubCategories,
    wrapperEl: $('homeSubWrapper'), containerEl: $('homeSubCategories'),
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
    categories: offersCategories, subs: offersSubCategories,
    wrapperEl: $('offersSubWrapper'), containerEl: $('offersSubCategories'),
    onToggle: (id, btn) => {
      const i = offersSubCategories.indexOf(id);
      if (i > -1) { offersSubCategories.splice(i, 1); btn.classList.remove('active'); }
      else { offersSubCategories.push(id); btn.classList.add('active'); }
      renderOffersGrid();
    }
  });
}

window.openMerchant = function (bankCode) {
  const m = allMerchants.find(x => x.bank_code === bankCode);
  if (!m) return;
  currentModalMerchant = m;
  const rate = m.cashback_rate || 15;
  const tier = getTier(rate);

  const logoHtml = m.logo_url
    ? `<img src="${m.logo_url}" style="width:70px;height:70px;object-fit:cover;border-radius:16px;margin:0 auto 10px;display:block">`
    : `<div style="font-size:60px;text-align:center">${m.icon || '🏪'}</div>`;

  $('modalMerchantName').innerHTML = `${logoHtml}<div style="text-align:center;margin-top:6px">${m.name}</div>`;
  $('modalMerchantInfo').innerHTML = `${m.icon || '🏪'} • ${(m.offers || []).length} عرض • <span class="tier-chip ${tier.cls}">${tier.icon} ${tier.name}</span> • كاش باك <strong>${rate}%</strong>`;

  $('modalOffersList').innerHTML = (m.offers || []).length
    ? m.offers.map((o, i) => {
        const imgHtml = o.image_url
          ? `<img src="${o.image_url}" style="width:100%;max-width:120px;height:80px;object-fit:cover;border-radius:8px;margin-bottom:6px">`
          : '';
        return `
        <div style="background:#f9fafb;padding:14px;border-radius:12px;margin-bottom:10px;border-right:4px solid #ff6b35">
          ${imgHtml}
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
            <div style="flex:1">
              <h5 style="font-size:15px;margin-bottom:4px;color:var(--primary)">${o.title}</h5>
              <p style="font-size:12px;color:#6b7280">عرض ${i + 1} من ${m.offers.length}</p>
            </div>
            <div style="background:#1a2a6c;color:#fff;padding:6px 14px;border-radius:30px;font-weight:700;font-size:14px;white-space:nowrap">${o.discount}</div>
          </div>
        </div>`;
      }).join('')
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
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(c =>
    c.classList.toggle('active', c.id === 'tab-' + name));

  if (name === 'invoice') renderInvoiceTab();
  if (name === 'requests') renderRequestsTab();
  if (name === 'dashboard' && currentMerchant) renderDashboard();
  if (name === 'reports' && currentMerchant) renderReports('all');
  if (name === 'analytics' && currentMerchant) renderAnalyticsTab();
  if (name === 'admin') renderAdminSection('dashboard');
  if (name === 'account') setTimeout(initAccountMapUI, 300);
}

// ============================================================
// INVOICE
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
  await renderMyWalletAndInvoices();
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
        <div style="font-weight:600">${w.profiles?.name || 'عميل'} (${w.profiles?.phone || '?'})</div>
        <div style="font-size:13px;color:#10b981;font-weight:600;margin-top:4px">💰 ${parseFloat(w.balance).toFixed(2)} ج</div>
      </div>`).join('');
  } catch (e) { console.error(e); }

  try {
    const invoices = await getMerchantInvoices(currentMerchant.id);
    const el = $('merchantInvoicesList');
    if (!invoices.length) el.innerHTML = '<p style="color:#6b7280;font-size:14px">لا توجد فواتير</p>';
    else el.innerHTML = invoices.map(inv => `
      <div style="background:#f9fafb;padding:10px 14px;border-radius:10px;margin-bottom:6px;border-right:4px solid #1a2a6c;font-size:13px">
        <div><strong>📄 #${inv.number}</strong> <span style="color:#ff6b35;font-weight:700">${parseFloat(inv.amount).toFixed(2)} ج</span></div>
        <div style="color:#6b7280;margin-top:2px">📱 ${inv.customer_phone} • 💵 ${parseFloat(inv.cashback).toFixed(2)} ج</div>
      </div>`).join('');
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
          <div style="font-weight:600">${m.icon || '🏪'} ${m.name || ''}</div>
          <div style="font-size:14px;color:#10b981;font-weight:700;margin-top:4px">💰 ${parseFloat(w.balance).toFixed(2)} ج</div>
        </div>`;
      }).join('') : '<p style="color:#6b7280;font-size:14px">لا توجد أرصدة</p>';
      const sel = $('redeemMerchant');
      sel.innerHTML = '<option value="">اختار المتجر</option>' +
        active.filter(w => parseFloat(w.balance) > 0).map(w => {
          const m = w.merchants || {};
          return `<option value="${w.merchant_id}">${m.icon || ''} ${m.name || ''} - ${parseFloat(w.balance).toFixed(2)} ج</option>`;
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
          <div><strong>📄 #${inv.number}</strong> • ${m.icon || ''} ${m.name || ''}</div>
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
  const bankCode = $('invBankCode') ? getRealValue('invBankCode') : '';
  const res = $('invoiceResult');
  if (!num || !phone || !amount || amount <= 0) { res.style.color = '#ef4444'; res.innerText = '❌ املأ البيانات'; return; }
  const isMerchant = currentProfile.role === 'merchant' && currentMerchant;
  if (!isMerchant && !bankCode) { res.style.color = '#ef4444'; res.innerText = '❌ ادخل البنكود'; return; }
  try {
    if (isMerchant) {
      const r = await createInvoice({ number: num, customerPhone: phone, amount, merchantId: currentMerchant.id });
      res.style.color = '#10b981'; res.innerText = `✅ كاش باك ${parseFloat(r.cashback).toFixed(2)} ج`;
    } else {
      const r = await createInvoiceByBankCode({ number: num, customerPhone: phone, amount, bankCode });
      res.style.color = '#10b981'; res.innerText = `✅ كاش باك ${parseFloat(r.cashback).toFixed(2)} ج`;
    }
    $('invNumber').value = ''; $('invCustomerPhone').value = ''; $('invAmount').value = '';
    if ($('invBankCode')) { $('invBankCode').value = ''; $('invBankCode').dataset.realValue = ''; }
    setTimeout(() => renderInvoiceTab(), 1200);
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
// REQUESTS
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
    setTimeout(() => renderRequestsTab(), 1000);
  } catch (e) { res.style.color = '#ef4444'; res.innerText = '❌ ' + e.message; }
}

async function renderRequestsTab() {
  if (!currentProfile) return;
  if (currentProfile.role === 'merchant' && currentMerchant) {
    $('requestFormCard').style.display = 'none';
    $('reqStatsWrapper').style.display = 'none';
    $('myRequestsList').innerHTML = '';
    $('merchantRequestsWrapper').style.display = 'block';
    await renderMerchantRequestsList();
  } else if (currentProfile.role === 'customer') {
    $('requestFormCard').style.display = 'block';
    $('reqStatsWrapper').style.display = 'block';
    $('merchantRequestsWrapper').style.display = 'none';
    await renderMyRequests();
  } else {
    $('requestFormCard').style.display = 'none';
    $('reqStatsWrapper').style.display = 'none';
    $('merchantRequestsWrapper').style.display = 'none';
    $('myRequestsList').innerHTML = '<div class="no-requests">مش مسجل كعميل أو تاجر</div>';
  }
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
      const imageHtml = r.image_url
        ? `<img src="${r.image_url}" style="width:100%;max-width:150px;border-radius:10px;margin:6px 0;border:2px solid #eee" onerror="this.style.display='none'">` : '';
      const acceptBtn = isAccepted
        ? `<button class="accept-btn" style="background:#94a3b8;cursor:not-allowed">✅ مقبول</button>`
        : (req.status === 'accepted' ? '' : `<button class="accept-btn" onclick="acceptOfferClick('${req.id}','${r.id}')">قبول</button>`);
      const msgs = (r.customer_messages || []).map(msg =>
        `<div style="background:#dbeafe;padding:6px 10px;border-radius:8px;margin:4px 0;font-size:12px"><strong>👤 أنت:</strong> ${msg.text}</div>`
      ).join('');
      const replyHtml = r.merchant_reply
        ? `<div style="background:#fef3c7;padding:6px 10px;border-radius:8px;margin:4px 0;font-size:12px"><strong>🏪 ${m.name || ''}:</strong> ${r.merchant_reply}</div>` : '';

      return `<div style="background:#f9fafb;padding:10px 14px;border-radius:10px;margin-top:8px;border-right:4px solid var(--primary)">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">
          <strong style="color:var(--primary)">🏪 ${m.name || ''}</strong>
          <span style="color:#ff6b35;font-weight:700">💰 ${parseFloat(r.price || 0).toFixed(0)} ج</span>
        </div>
        ${imageHtml}
        <div style="font-size:13px;color:#4b5563;margin-top:4px">${r.message || ''}</div>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
          ${m.lat && m.lng ? `<button class="admin-btn primary" onclick="window.open('https://www.google.com/maps?q=${m.lat},${m.lng}','_blank')">📍</button>` : ''}
          ${acceptBtn}
          <button class="admin-btn purple" onclick="askImageClick('${r.id}')">📸 اسأل عن صورة</button>
        </div>
        ${msgs}${replyHtml}
      </div>`;
    }).join('') : '<div style="color:#92400e;text-align:center;padding:10px">⏳ جاري انتظار رد التجار...</div>';

    const custImg = req.image_url
      ? `<img src="${req.image_url}" style="width:100%;max-width:200px;border-radius:10px;margin:6px 0;border:2px solid #ddd">` : '';

    let actions = '';
    if (req.status === 'pending' || req.status === 'responded') {
      actions = `<button class="admin-btn danger" onclick="cancelReqClick('${req.id}')" style="margin-top:8px">🚫 إلغاء</button>`;
    } else if (req.status === 'accepted' || req.status === 'cancelled') {
      actions = `<button class="admin-btn danger" onclick="deleteReqClick('${req.id}')" style="margin-top:8px">🗑️ حذف</button>`;
    }

    return `<div class="card" style="padding:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <h4 style="margin:0">📦 ${req.product}</h4>${statusBadge}
      </div>
      ${custImg}
      <div style="color:#4b5563;font-size:14px;margin:6px 0">${req.details || ''}</div>
      <div style="font-size:12px;color:#6b7280">🕒 ${new Date(req.created_at).toLocaleString('ar-EG')}</div>
      ${responses.length ? `<div style="font-size:12px;color:#6b7280;margin-top:6px">💬 ${responses.length} تاجر رد</div>` : ''}
      ${respHtml}${actions}
    </div>`;
  }).join('');
}

function getStatusBadge(status) {
  const map = {
    pending: '<span style="background:#fef3c7;color:#92400e;font-size:12px;padding:3px 12px;border-radius:20px;font-weight:700">⏳ انتظار</span>',
    responded: '<span style="background:#dbeafe;color:#1e40af;font-size:12px;padding:3px 12px;border-radius:20px;font-weight:700">💬 تم الرد</span>',
    accepted: '<span style="background:#d1fae5;color:#065f46;font-size:12px;padding:3px 12px;border-radius:20px;font-weight:700">✅ مقبول</span>',
    cancelled: '<span style="background:#fee2e2;color:#991b1b;font-size:12px;padding:3px 12px;border-radius:20px;font-weight:700">🚫 ملغي</span>'
  };
  return map[status] || map.pending;
}

window.acceptOfferClick = async function (reqId, respId) {
  if (!confirm('متأكد من قبول العرض؟')) return;
  try { await acceptOffer({ requestId: reqId, responseId: respId }); toast('✅ تم قبول العرض', 'success'); renderRequestsTab(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
};

window.cancelReqClick = async function (reqId) {
  if (!confirm('متأكد من الإلغاء؟')) return;
  try { await cancelRequest(reqId); renderRequestsTab(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
};

window.deleteReqClick = async function (reqId) {
  if (!confirm('متأكد من الحذف؟')) return;
  try { await deleteRequest(reqId); renderRequestsTab(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
};

window.askImageClick = async function (respId) {
  const msg = prompt('اكتب رسالتك للتاجر:');
  if (!msg) return;
  const req = myRequestsCache.find(r => (r.request_responses || []).some(x => x.id === respId));
  const resp = req?.request_responses.find(x => x.id === respId);
  if (!resp) return;
  try {
    await askMerchantForImage({ responseId: respId, message: msg, existingMessages: resp.customer_messages || [] });
    toast('✅ تم إرسال الرسالة', 'success');
    renderRequestsTab();
  } catch (e) { toast('❌ ' + e.message, 'error'); }
};

async function renderMerchantRequestsList() {
  const el = $('merchantRequestsList');
  try {
    const requests = await getMerchantRequests(currentMerchant.id, currentMerchant.category);
    if (!requests.length) {
      el.innerHTML = '<p style="color:#6b7280;font-size:14px;text-align:center;padding:20px">مفيش طلبات 😴</p>';
      return;
    }
    el.innerHTML = requests.map(req => {
      const myReply = (req.request_responses || []).find(r => r.merchant_id === currentMerchant.id);
      const statusBadge = getStatusBadge(req.status);
      const imageHtml = req.image_url
        ? `<img src="${req.image_url}" style="width:100%;max-width:180px;border-radius:10px;margin:8px 0;border:2px solid #ddd">` : '';

      const customerMsgs = myReply && myReply.customer_messages && myReply.customer_messages.length
        ? `<div style="background:#dbeafe;padding:8px;border-radius:8px;margin-top:8px">
            <div style="font-size:11px;color:#1e40af;font-weight:700">👤 رسائل العميل:</div>
            ${myReply.customer_messages.map(m => `<div style="font-size:12px;color:#1e40af">• ${m.text}</div>`).join('')}
          </div>` : '';

      let replyHtml = '';
      if (myReply) {
        replyHtml = `<div style="background:#d1fae5;padding:10px;border-radius:10px;margin-top:8px">
          <div style="font-size:12px;color:#065f46;font-weight:700">✅ ردك:</div>
          <div style="font-size:14px;color:#065f46;margin-top:4px">💰 ${parseFloat(myReply.price).toFixed(0)} ج</div>
          <div style="font-size:13px;color:#065f46">${myReply.message}</div>
          ${myReply.image_url ? `<img src="${myReply.image_url}" style="width:100%;max-width:140px;border-radius:8px;margin-top:6px">` : ''}
        </div>`;
      }

      return `<div style="background:#f9fafb;padding:14px;border-radius:12px;margin-bottom:12px;border-right:4px solid var(--success)">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">
          <h5 style="color:var(--primary);margin:0">📦 ${req.product}</h5>${statusBadge}
        </div>
        <div style="font-size:13px;color:#4b5563;margin-top:6px">${req.details || ''}</div>
        ${imageHtml}
        <div style="font-size:12px;color:#6b7280;margin-top:4px">🕒 ${new Date(req.created_at).toLocaleString('ar-EG')}</div>
        ${customerMsgs}${replyHtml}
        <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
          ${!myReply ? `<button class="admin-btn primary" onclick="replyToReq('${req.id}')">📩 الرد</button>` : ''}
          ${myReply ? `<button class="admin-btn purple" onclick="sendExtraImage('${myReply.id}')">📸 صورة إضافية</button>` : ''}
          <button class="admin-btn danger" onclick="hideReq('${req.id}')">🗑️ مسح</button>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = '<p style="color:#ef4444;font-size:14px">❌ ' + e.message + '</p>';
  }
}

window.replyToReq = async function (reqId) {
  const price = prompt('اكتب السعر:'); if (price === null) return;
  const p = parseFloat(price); if (isNaN(p) || p <= 0) { toast('❌ سعر غير صحيح', 'error'); return; }
  const message = prompt('رسالة للعميل:', 'متوفر بسعر ممتاز'); if (message === null) return;

  const hasImage = confirm('تحب ترفق صورة؟');
  let imageBase64 = null;
  if (hasImage) imageBase64 = await pickImage();

  try {
    await replyToRequest({ requestId: reqId, merchantId: currentMerchant.id, price: p, message, imageBase64 });
    toast('✅ تم إرسال ردك', 'success');
    renderRequestsTab();
  } catch (e) { toast('❌ ' + e.message, 'error'); }
};

window.sendExtraImage = async function (responseId) {
  const imageBase64 = await pickImage();
  if (!imageBase64) return;
  const message = prompt('رسالة (اختياري):', 'دي صورة إضافية');
  try {
    await merchantSendExtraImage({ responseId, imageBase64, message });
    toast('✅ تم إرسال الصورة', 'success');
    renderRequestsTab();
  } catch (e) { toast('❌ ' + e.message, 'error'); }
};

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

window.hideReq = async function (reqId) {
  if (!confirm('مسح الطلب من عندك؟')) return;
  try { await hideRequestForMerchant(reqId, currentMerchant.id); renderRequestsTab(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
};

// ============================================================
// MERCHANT LOGO
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
// DASHBOARD
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
      const imgHtml = o.image_url
        ? `<img src="${o.image_url}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;flex-shrink:0">`
        : '';
      return `<div class="merchant-offer-card" style="background:#f9fafb;padding:10px;border-radius:12px;margin-bottom:8px;border-right:4px solid #ff6b35;display:flex;align-items:center;gap:10px">
        ${imgHtml}
        <div style="flex:1"><span style="font-weight:600">${o.title}</span><br><span style="color:#ff6b35;font-weight:700">${o.discount}</span></div>
        <button class="del-btn" onclick="deleteOfferClick('${o.id}')" style="background:#ef4444;color:#fff;border:none;border-radius:30px;padding:2px 10px;cursor:pointer">🗑️</button>
      </div>`;
    }).join('') : '<p style="color:#6b7280">لا توجد عروض</p>';
  } catch (e) { console.error(e); }

  try {
    const customers = await getMerchantCustomers(currentMerchant.id);
    const el = $('myCustomersList');
    el.innerHTML = customers.length ? customers.map(c => `
      <div style="background:#f9fafb;padding:10px 14px;border-radius:10px;margin-bottom:6px;border-right:4px solid #1a2a6c;font-size:13px">
        <strong>📱 ${c.phone}</strong>
        <div style="color:#6b7280;margin-top:2px">${c.count} فاتورة • ${c.total.toFixed(2)} ج</div>
      </div>`).join('') : '<p style="color:#6b7280">لا يوجد عملاء</p>';
  } catch (e) { console.error(e); }

  try {
    const invoices = await getMerchantInvoicesList(currentMerchant.id);
    const el = $('dashInvoicesList');
    el.innerHTML = invoices.length ? invoices.slice(0, 30).map(inv => {
      const statusBadge = inv.status === 'active'
        ? '<span class="active-badge">✅ نشطة</span>'
        : `<span class="blocked-badge">${inv.status === 'returned' ? 'مرتجع كامل' : 'مرتجع جزئي'}</span>`;
      return `<div style="background:#f9fafb;padding:10px 14px;border-radius:10px;margin-bottom:6px;border-right:4px solid #1a2a6c;font-size:13px">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">
          <strong>📄 #${inv.number}</strong>
          <span style="color:#ff6b35;font-weight:700">${parseFloat(inv.amount).toFixed(2)} ج</span>
        </div>
        <div style="color:#6b7280;margin-top:2px">📱 ${inv.customer_phone || '-'} • 💵 ${parseFloat(inv.cashback).toFixed(2)} ج ${statusBadge}</div>
        ${inv.status === 'active' ? `<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
          <button class="admin-btn primary" onclick="editInvClick('${inv.id}')">✏️ تعديل</button>
          <button class="admin-btn danger" onclick="returnInvClick('${inv.id}')">🔄 مرتجع</button>
        </div>` : ''}
      </div>`;
    }).join('') : '<p style="color:#6b7280">لا توجد فواتير</p>';
  } catch (e) { console.error(e); }

  try {
    const wallets = await getMerchantWallets(currentMerchant.id);
    const el = $('dashWalletsList');
    el.innerHTML = wallets.length ? wallets.map(w => `
      <div style="background:#f9fafb;padding:10px 14px;border-radius:10px;margin-bottom:6px;border-right:4px solid #10b981">
        <div style="font-weight:600">📱 ${w.profiles?.phone || '?'} ${w.profiles?.name ? '(' + w.profiles.name + ')' : ''}</div>
        <div style="font-size:13px;color:#10b981;font-weight:600;margin-top:4px">💰 ${parseFloat(w.balance).toFixed(2)} ج</div>
      </div>`).join('') : '<p style="color:#6b7280">لا يوجد أرصدة</p>';
  } catch (e) { console.error(e); }
}

window.deleteOfferClick = async function (offerId) {
  if (!confirm('حذف العرض؟')) return;
  try { await deleteOffer(offerId); renderDashboard(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
};

window.editInvClick = async function (invId) {
  const inv = (await getMerchantInvoicesList(currentMerchant.id)).find(i => i.id === invId);
  if (!inv) return;
  const newAmount = prompt(`المبلغ الحالي: ${inv.amount} ج\nاكتب المبلغ الجديد:`, inv.amount);
  if (newAmount === null) return;
  const a = parseFloat(newAmount);
  if (isNaN(a) || a <= 0) { toast('❌ غير صحيح', 'error'); return; }
  if (a > parseFloat(inv.amount)) { toast('❌ لا يمكن الزيادة', 'error'); return; }
  try { await editInvoice(invId, a, null); toast('✅ تم', 'success'); renderDashboard(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
};

window.returnInvClick = async function (invId) {
  const amount = prompt("مبلغ المرتجع (أو 'الكل'):");
  if (amount === null) return;
  const inv = (await getMerchantInvoicesList(currentMerchant.id)).find(i => i.id === invId);
  if (!inv) return;
  const r = amount === 'الكل' ? parseFloat(inv.amount) : parseFloat(amount);
  if (isNaN(r) || r <= 0) { toast('❌ غير صحيح', 'error'); return; }
  try { await processReturn(invId, r); toast('✅ تم', 'success'); renderDashboard(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
};

async function handleAddOffer() {
  const title = $('offerTitle').value.trim();
  const discount = $('offerDiscount').value.trim();
  const res = $('offerResult');
  if (!title || !discount) { res.style.color = 'red'; res.innerText = '❌ املأ البيانات'; return; }
  try {
    await addOffer({ merchantId: currentMerchant.id, title, discount, imageBase64: uploadedOfferImage });
    res.style.color = 'green'; res.innerText = '✅ تم نشر العرض';
    $('offerTitle').value = ''; $('offerDiscount').value = '';
    uploadedOfferImage = null;
    const p = $('offerImagePreview'); if (p) { p.style.display = 'none'; p.src = ''; }
    const f = $('offerFileName'); if (f) f.innerText = 'لم يتم اختيار ملف';
    setTimeout(() => { res.innerText = ''; renderDashboard(); }, 1000);
  } catch (e) { res.style.color = 'red'; res.innerText = '❌ ' + e.message; }
}

async function handleSaveRate() {
  const rate = parseInt($('rateSlider').value);
  const res = $('rateSaveResult');
  try {
    await updateCashbackRate(currentMerchant.id, rate);
    currentMerchant.cashback_rate = rate;
    res.style.color = 'green'; res.innerText = '✅ تم الحفظ';
    setTimeout(() => res.innerText = '', 2000);
  } catch (e) { res.style.color = 'red'; res.innerText = '❌ ' + e.message; }
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
// REPORTS
// ============================================================
async function renderReports(period) {
  if (!currentMerchant) return;
  document.querySelectorAll('.report-period-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.period === period));

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
  const opt = {
    margin: 10,
    filename: `PAMIGO-Report-${Date.now()}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
  html2pdf().set(opt).from(element).save();
}

// ============================================================
// ANALYTICS
// ============================================================
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
// ADMIN
// ============================================================
async function renderAdminSection(section) {
  document.querySelectorAll('.admin-subtab').forEach(b =>
    b.classList.toggle('active', b.dataset.admin === section));
  document.querySelectorAll('.admin-section').forEach(s =>
    s.classList.remove('active'));
  $('admin-' + section).classList.add('active');

  if (section === 'dashboard') await renderAdminDashboard();
  if (section === 'traders') await renderAdminTraders();
  if (section === 'customers') await renderAdminCustomers();
  if (section === 'invoices') await renderAdminInvoices();
  if (section === 'requests') await renderAdminRequests();
  if (section === 'notifications') await renderAdminNotifHistory();
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
  if (!adminData.merchants.length) { el.innerHTML = '<p style="color:#6b7280">لا يوجد تجار</p>'; return; }
  el.innerHTML = adminData.merchants.map(m => {
    const rate = m.cashback_rate || 15;
    const tier = getTier(rate);
    const logo = m.logo_url
      ? `<img src="${m.logo_url}" style="width:32px;height:32px;object-fit:cover;border-radius:8px;vertical-align:middle">`
      : (m.icon || '🏪');
    return `<div class="admin-item">
      <div class="head">
        <span class="title">${logo} ${m.name}</span>
        ${m.frozen ? '<span class="frozen-badge">❄️ موقوف</span>' : '<span class="active-badge">✅ نشط</span>'}
      </div>
      <div class="info">🔑 ${m.bank_code} | 📱 ${m.phone || '-'} | 💰 ${rate}%</div>
      <div class="info">📍 ${m.lat?.toFixed(4) || '-'} , ${m.lng?.toFixed(4) || '-'}</div>
      <div class="info">📂 ${m.category} | 🎁 ${(m.offers || []).length} عرض</div>
      <div class="actions">
        <button class="admin-btn primary" onclick="adminEditMerchantFull('${m.id}')">✏️ تعديل كامل</button>
        <button class="admin-btn ${m.frozen ? 'success' : 'warning'}" onclick="toggleFreeze('${m.id}')">${m.frozen ? '✅ إلغاء' : '❄️ إيقاف'}</button>
        <button class="admin-btn purple" onclick="adminChangePassMerchant('${m.id}')">🔒 كلمة المرور</button>
        <button class="admin-btn danger" onclick="delTrader('${m.id}')">🗑️ حذف</button>
      </div>
    </div>`;
  }).join('');
}

window.adminEditMerchantFull = async function (id) {
  const m = adminData.merchants.find(x => x.id === id);
  if (!m) return;

  const newBankCode = prompt(`البنكود الحالي: ${m.bank_code}\nالجديد:`, m.bank_code);
  if (newBankCode === null) return;

  const newName = prompt(`اسم التاجر الحالي: ${m.name}\nالجديد:`, m.name);
  if (newName === null) return;

  const newPhone = prompt(`الموبايل الحالي: ${m.phone}\nالجديد:`, m.phone || '');
  if (newPhone === null) return;

  const newLat = prompt(`Latitude الحالي: ${m.lat}\nالجديد:`, m.lat);
  if (newLat === null) return;

  const newLng = prompt(`Longitude الحالي: ${m.lng}\nالجديد:`, m.lng);
  if (newLng === null) return;

  const newRate = prompt(`النسبة الحالية: ${m.cashback_rate}%\nالجديدة (1-50):`, m.cashback_rate);
  if (newRate === null) return;

  try {
    await adminUpdateMerchant(id, {
      bankCode: newBankCode.trim() || m.bank_code,
      name: newName.trim() || m.name,
      phone: newPhone.trim() || m.phone,
      lat: parseFloat(newLat),
      lng: parseFloat(newLng),
      rate: parseInt(newRate)
    });
    toast('✅ تم التعديل', 'success');
    renderAdminTraders();
  } catch (e) { toast('❌ ' + e.message, 'error'); }
};

window.adminChangePassMerchant = async function (merchantId) {
  const m = adminData.merchants.find(x => x.id === merchantId);
  if (!m || !m.owner_id) { toast('❌ التاجر ده مش مرتبط بحساب', 'error'); return; }
  const newPass = prompt('اكتب كلمة المرور الجديدة (6+ أحرف):');
  if (!newPass || newPass.length < 6) { toast('❌ قصيرة', 'error'); return; }
  try {
    await adminChangePassword(m.owner_id, newPass);
    toast('✅ تم تغيير كلمة المرور', 'success');
  } catch (e) { toast('❌ ' + e.message, 'error'); }
};

window.toggleFreeze = async function (id) {
  const m = adminData.merchants.find(x => x.id === id);
  if (!m) return;
  try { await freezeMerchant(id, !m.frozen); renderAdminTraders(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
};

window.delTrader = async function (id) {
  if (!confirm('متأكد من الحذف؟')) return;
  try { await deleteMerchant(id); renderAdminTraders(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
};

async function renderAdminCustomers() {
  adminData.customers = await getAllCustomers();
  const el = $('adminCustomersList');
  if (!adminData.customers.length) { el.innerHTML = '<p style="color:#6b7280">لا يوجد عملاء</p>'; return; }
  el.innerHTML = adminData.customers.map(c => `
    <div class="admin-item">
      <div class="head">
        <span class="title">📱 ${c.phone}${c.name ? ' - ' + c.name : ''}</span>
        <span class="active-badge">✅ نشط</span>
      </div>
      <div class="info">🏪 ${c.shops} تاجر | 💰 كسب: ${c.earned.toFixed(2)} | 💵 صرف: ${c.spent.toFixed(2)}</div>
      <div class="info">📊 الرصيد: <strong>${c.balance.toFixed(2)} ج</strong>${c.email ? ' | 📧 ' + c.email : ''}</div>
      <div class="actions">
        <button class="admin-btn primary" onclick="adminEditCustomerFull('${c.phone}')">✏️ تعديل بيانات</button>
        <button class="admin-btn purple" onclick="adminChangePassCustomer('${c.id}')">🔒 كلمة المرور</button>
        <button class="admin-btn success" onclick="adminAdjustBal('${c.phone}')">💰 رصيد</button>
        <button class="admin-btn warning" onclick="adminResetBal('${c.phone}')">🔄 تصفير</button>
        <button class="admin-btn danger" onclick="adminDelCustomer('${c.phone}')">🗑️ حذف</button>
      </div>
    </div>`).join('');
}

window.adminEditCustomerFull = async function (phone) {
  const c = adminData.customers.find(x => x.phone === phone);
  if (!c) return;

  const newName = prompt(`الاسم الحالي: ${c.name || 'مش محدد'}\nالجديد:`, c.name || '');
  if (newName === null) return;

  const newPhone = prompt(`الموبايل الحالي: ${c.phone}\nالجديد:`, c.phone);
  if (newPhone === null) return;

  try {
    await adminUpdateCustomer(phone, newName.trim(), newPhone.trim());
    toast('✅ تم التعديل', 'success');
    renderAdminCustomers();
  } catch (e) { toast('❌ ' + e.message, 'error'); }
};

window.adminChangePassCustomer = async function (userId) {
  const newPass = prompt('اكتب كلمة المرور الجديدة (6+):');
  if (!newPass || newPass.length < 6) { toast('❌ قصيرة', 'error'); return; }
  try {
    await adminChangePassword(userId, newPass);
    toast('✅ تم', 'success');
  } catch (e) { toast('❌ ' + e.message, 'error'); }
};

window.adminAdjustBal = async function (phone) {
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
};

window.adminResetBal = async function (phone) {
  if (!confirm('تصفير كل الرصيد؟')) return;
  try { await resetCustomerBalance(phone); toast('✅ تم', 'success'); renderAdminCustomers(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
};

window.adminDelCustomer = async function (phone) {
  if (!confirm(`حذف حساب العميل ${phone}؟`)) return;
  try { await deleteCustomer(phone); toast('✅ تم', 'success'); renderAdminCustomers(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
};

async function renderAdminInvoices() {
  const search = $('adminInvoiceSearch')?.value || '';
  adminData.invoices = await getAllInvoices(search);
  const el = $('adminInvoicesList');
  if (!adminData.invoices.length) { el.innerHTML = '<p style="color:#6b7280">لا توجد فواتير</p>'; return; }
  el.innerHTML = adminData.invoices.map(inv => {
    const statusBadge = inv.status === 'active'
      ? '<span class="active-badge">✅ نشطة</span>'
      : `<span class="blocked-badge">❌ ${inv.status === 'returned' ? 'مرتجع' : 'مرتجع جزئي'}</span>`;
    return `<div class="admin-item">
      <div class="head">
        <span class="title">📄 #${inv.number}</span>
        <span style="color:#ff6b35;font-weight:700">${parseFloat(inv.amount).toFixed(2)} ج</span>
      </div>
      <div class="info">🏪 ${inv.merchants?.name || ''} | 📱 ${inv.customer_phone || '-'} | 💵 كاش باك ${parseFloat(inv.cashback).toFixed(2)} ج</div>
      <div class="info">${statusBadge}</div>
      <div class="info" style="font-size:12px">🕒 ${new Date(inv.created_at).toLocaleString('ar-EG')}</div>
      <div class="actions">
        ${inv.status === 'active' ? `
          <button class="admin-btn primary" onclick="adminEditInv('${inv.id}')">✏️ تعديل</button>
          <button class="admin-btn danger" onclick="adminReturnInv('${inv.id}')">🔄 مرتجع</button>
        ` : ''}
        <button class="admin-btn danger" onclick="adminDelInv('${inv.id}')">🗑️ حذف</button>
      </div>
    </div>`;
  }).join('');
}

window.adminEditInv = async function (id) {
  const inv = adminData.invoices.find(i => i.id === id);
  if (!inv) return;
  const newAmount = prompt(`المبلغ الحالي: ${inv.amount} ج\nالجديد:`, inv.amount);
  if (newAmount === null) return;
  const a = parseFloat(newAmount);
  if (isNaN(a) || a <= 0) { toast('❌ غير صحيح', 'error'); return; }
  if (a > parseFloat(inv.amount)) { toast('❌ لا يمكن الزيادة', 'error'); return; }
  try { await editInvoiceAdmin(id, a, null); toast('✅ تم', 'success'); renderAdminInvoices(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
};

window.adminReturnInv = async function (id) {
  const inv = adminData.invoices.find(i => i.id === id);
  if (!inv) return;
  const amount = prompt("مبلغ المرتجع (أو 'الكل'):");
  if (amount === null) return;
  const r = amount === 'الكل' ? parseFloat(inv.amount) : parseFloat(amount);
  if (isNaN(r) || r <= 0) { toast('❌ غير صحيح', 'error'); return; }
  try { await returnInvoiceAdmin(id, r); toast('✅ تم', 'success'); renderAdminInvoices(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
};

window.adminDelInv = async function (id) {
  if (!confirm('حذف الفاتورة؟')) return;
  try { await deleteInvoice(id); renderAdminInvoices(); }
  catch (e) { toast('❌ ' + e.message, 'error'); }
};

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
          <strong>🏪 ${m.name || ''}</strong> • 💰 ${parseFloat(resp.price||0).toFixed(0)} ج
          <div style="color:#6b7280">${resp.message || ''}</div>
        </div>`;
      }).join('');
      return `<div class="admin-item">
        <div class="head">
          <span class="title">📦 ${r.product}</span>
          ${getStatusBadge(r.status)}
        </div>
        <div class="info">${r.details || ''}</div>
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
      <div class="head"><span class="title">📢 ${n.title}</span></div>
      <div class="info">${n.message}</div>
      <div class="info" style="font-size:12px">🕒 ${new Date(n.created_at).toLocaleString('ar-EG')}</div>
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
  $('newTraderSubs').innerHTML = subs.map(s =>
    `<button type="button" class="category-chip" data-sub="${s.id}">${s.name}</button>`
  ).join('');
  $('newTraderSubs').querySelectorAll('.category-chip').forEach(btn => {
    btn.onclick = () => btn.classList.toggle('active');
  });
}

async function handleAddTrader() {
  const name = $('newTraderName').value.trim();
  const bankCode = $('newTraderBankCode').value.trim();
  const phone = $('newTraderPhone').value.trim();
  const category = $('newTraderCategory').value;
  const lat = parseFloat($('newTraderLat').value);
  const lng = parseFloat($('newTraderLng').value);
  const rate = parseInt($('newTraderRate').value);
  const res = $('addTraderResult');

  if (!name || !bankCode || !phone) { res.style.color = 'red'; res.innerText = '❌ املأ الحقول'; return; }
  if (isNaN(lat) || isNaN(lng)) { res.style.color = 'red'; res.innerText = '❌ إحداثيات'; return; }
  if (isNaN(rate) || rate < 1 || rate > 50) { res.style.color = 'red'; res.innerText = '❌ نسبة غير صحيحة'; return; }

  const subs = [];
  $('newTraderSubs').querySelectorAll('.category-chip.active').forEach(b => subs.push(b.dataset.sub));
  if (!subs.length) { res.style.color = 'red'; res.innerText = '❌ اختار تصنيف فرعي'; return; }

  try {
    await addTrader({
      bankCode, name, phone, category,
      subCategories: subs,
      icon: CATEGORY_ICONS[category] || '🏪',
      lat, lng, rate
    });
    res.style.color = 'green'; res.innerText = `✅ تم إضافة ${name}`;
    setTimeout(() => { $('addTraderForm').style.display = 'none'; res.innerText = ''; renderAdminTraders(); }, 1500);
  } catch (e) { res.style.color = 'red'; res.innerText = '❌ ' + e.message; }
}

// ============================================================
// ACCOUNT
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
          <div style="font-weight:600">${m.icon || '🏪'} ${m.name || ''}</div>
          <div style="font-size:14px;color:#10b981;font-weight:700;margin-top:4px">💰 ${parseFloat(w.balance).toFixed(2)} ج</div>
        </div>`;
      }).join('');
    } else {
      $('myWalletsCard').style.display = 'none';
    }
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

  if (!currentPass || !newPass || !confirmPass) {
    res.style.color = '#ef4444'; res.innerText = '❌ املأ كل الحقول'; return;
  }
  if (newPass !== confirmPass) {
    res.style.color = '#ef4444'; res.innerText = '❌ كلمتين المرور مش متطابقتين'; return;
  }
  if (newPass.length < 6) {
    res.style.color = '#ef4444'; res.innerText = '❌ كلمة المرور 6 أحرف على الأقل'; return;
  }

  try {
    await changeMyPassword({ currentPassword: currentPass, newPassword: newPass });
    res.style.color = '#10b981'; res.innerText = '✅ تم تغيير كلمة المرور';
    $('currentPass').value = ''; $('newPass').value = ''; $('newPassConfirm').value = '';
    setTimeout(() => { res.innerText = ''; $('changePassForm').style.display = 'none'; }, 2000);
  } catch (e) {
    res.style.color = '#ef4444'; res.innerText = '❌ ' + e.message;
  }
}

async function handleSaveEmail() {
  const email = $('myEmail').value.trim();
  const res = $('emailResult');
  if (!email || !email.includes('@')) {
    res.style.color = '#ef4444'; res.innerText = '❌ إيميل غير صحيح'; return;
  }
  try {
    await updateMyEmail(email);
    currentProfile.email = email;
    res.style.color = '#10b981'; res.innerText = '✅ تم حفظ الإيميل — شوف بريدك للتفعيل';
    setTimeout(() => res.innerText = '', 3000);
  } catch (e) {
    res.style.color = '#ef4444'; res.innerText = '❌ ' + e.message;
  }
}

async function handleSendReset() {
  const email = $('forgotEmail').value.trim();
  const res = $('forgotResult');
  if (!email || !email.includes('@')) {
    res.style.color = '#ef4444'; res.innerText = '❌ إيميل غير صحيح'; return;
  }
  try {
    await sendPasswordReset(email);
    res.style.color = '#10b981';
    res.innerText = '✅ تم الإرسال — شوف إيميلك';
  } catch (e) {
    res.style.color = '#ef4444'; res.innerText = '❌ ' + e.message;
  }
}

// ============================================================
// AUTH
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
    currentMerchant = await getMyMerchant();
    $('merchantBanner').style.display = 'block';
    $('merchantName').innerText = currentMerchant ? currentMerchant.name : 'غير مرتبط';
  } else {
    currentMerchant = null;
    $('merchantBanner').style.display = 'none';
  }

  updateTabsVisibility();
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
    if (role === 'merchant') {
      await signUpMerchant({ phone, email, password, name, bankCode });
    } else if (role === 'admin') {
      await signUpAdmin({ phone, email, password, name, adminCode });
    } else {
      await signUpCustomer({ phone, email, password, name });
    }

    showMessage('✅ تم إنشاء الحساب', 'success');
    await signInWithEmail({ email, password });
  } catch (err) {
    showMessage('❌ ' + translateError(err.message));
  } finally {
    btn.disabled = false; btn.innerText = '📝 إنشاء الحساب';
  }
}

async function handleLogout() {
  if (!confirm('متأكد؟')) return;
  expectedLogin = null;
  await signOut();
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
  document.querySelectorAll('.auth-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab));
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
// BIND
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
    renderNewTraderSubs();
  });
  $('hideAddTraderBtn').addEventListener('click', () => {
    $('addTraderForm').style.display = 'none';
  });
  $('newTraderCategory').addEventListener('change', renderNewTraderSubs);
  $('addTraderConfirmBtn').addEventListener('click', handleAddTrader);
  $('adminInvoiceSearch').addEventListener('input', () => renderAdminInvoices());
  $('sendNotifBtn').addEventListener('click', handleSendNotif);

  $('searchAddrBtn').addEventListener('click', handleSearchAddress);
  $('saveLocationBtn').addEventListener('click', handleSaveLocation);

  $('forgotPassLink').addEventListener('click', (e) => {
    e.preventDefault();
    $('forgotModal').classList.add('active');
  });
  $('sendResetBtn').addEventListener('click', handleSendReset);

  $('openChangePassBtn').addEventListener('click', () => {
    $('changePassForm').style.display = 'block';
    $('emailForm').style.display = 'none';
  });
  $('openEmailBtn').addEventListener('click', () => {
    $('emailForm').style.display = 'block';
    $('changePassForm').style.display = 'none';
    $('myEmail').value = currentProfile?.email || '';
  });
  $('saveNewPassBtn').addEventListener('click', handleChangePassword);
  $('saveEmailBtn').addEventListener('click', handleSaveEmail);

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

  $('homeRadiusSlider').addEventListener('input', (e) => {
    homeRadius = parseFloat(e.target.value);
    $('homeRadiusValue').innerText = homeRadius;
    renderMerchantsList();
  });

  document.querySelectorAll('#homeSortOptions .category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#homeSortOptions .category-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      homeSort = chip.dataset.sort;
      renderMerchantsList();
    });
  });

  document.querySelectorAll('#homeCategories .category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      toggleCategoryGeneric({
        cat: chip.dataset.cat, chip,
        categories: homeCategories, subs: homeSubCategories,
        containerId: 'homeCategories',
        onUpdate: () => { renderHomeSubCategories(); renderMerchantsList(); }
      });
    });
  });

  document.querySelectorAll('#offersCategories .category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      toggleCategoryGeneric({
        cat: chip.dataset.cat, chip,
        categories: offersCategories, subs: offersSubCategories,
        containerId: 'offersCategories',
        onUpdate: () => { renderOffersSubCategories(); renderOffersGrid(); }
      });
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
}

// ============================================================
// AUTH STATE
// ============================================================
onAuthChange(async (event, session) => {
  if (session?.user) {
    const profile = await getProfile();
    if (!profile) return;

    if (expectedLogin) {
      const exp = expectedLogin;
      expectedLogin = null;

      if (profile.role !== exp.role) {
        await signOut();
        setTimeout(() => showMessage(`❌ الدور مش متطابق — حسابك ${getRoleName(profile.role)}`), 300);
        return;
      }

      if (exp.role === 'admin' && exp.adminCode !== 'PETAD-12321') {
        await signOut();
        setTimeout(() => showMessage('❌ بنكود الأدمن غير صحيح'), 300);
        return;
      }

      if (exp.role === 'merchant') {
        const m = await getMyMerchant();
        if (!m || (m.bank_code || '').toUpperCase() !== exp.bankCode.toUpperCase()) {
          await signOut();
          setTimeout(() => showMessage('❌ البنكود مش بتاع حسابك'), 300);
          return;
        }
      }
    }

    await showMainScreen(profile);
  } else {
    showAuthScreen();
  }
});

// ============================================================
// INIT
// ============================================================
window.addEventListener('load', async () => {
  bindEvents();
  showAuthTab('login');
  updateBankCodeVisibility();
  updateLoginVisibility();

  applyPeekEffect('signupBankCode');
  applyPeekEffect('signupAdminCode');
  applyPeekEffect('loginBankCode');
  applyPeekEffect('loginAdminCode');
  applyPeekEffect('invBankCode');

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    const profile = await getProfile();
    if (profile) await showMainScreen(profile);
  } else {
    showAuthScreen();
  }
});
initI18n();
window.__setLang = setLang;

// لما اللغة تتغير، نعيد الرندر
window.addEventListener('langChanged', () => {
  // عيد رسم المحتوى اللي فيه لغة
  if (currentProfile) {
    document.getElementById('userRole').innerText =
      currentLang === 'ar'
        ? ({ customer: '👤 عميل', merchant: '🏪 تاجر', admin: '👑 أدمن' })[currentProfile.role]
        : ({ customer: '👤 Customer', merchant: '🏪 Merchant', admin: '👑 Admin' })[currentProfile.role];
  }
  if (document.getElementById('merchantBanner').style.display !== 'none') {
    document.getElementById('merchantName').dataset.i18n = 'merchant.yourShop';
  }
  applyI18nToHTML();
});