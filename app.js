// ============================================================
// PAMIGO - Main Entry (Stage 6: Requests)
// ============================================================
import { supabase } from './supabase.js';
import { SUB_CATEGORIES } from './config.js';
import {
  signUpCustomer, signUpMerchant, signIn, signOut,
  getProfile, getMyMerchant, onAuthChange
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
  hideRequestForMerchant, askMerchantForImage
} from './requests.js';

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

// Requests state
let uploadedReqImage = null;
let currentReqFilter = 'all';
let myRequestsCache = [];

// ============================================================
// Load merchants
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
  if (!cats.includes('all') && !cats.includes(m.category)) return false;
  if (subs.length) {
    if (!m.sub_categories || !m.sub_categories.length) return false;
    if (!m.sub_categories.some(s => subs.includes(s))) return false;
  }
  return true;
}

// ============================================================
// Render: merchants
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
        <div class="icon">${m.icon || '🏪'}</div>
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
        <div class="icon">${m.icon || '🏪'}</div>
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
        <div style="font-size:48px">${m.icon || '🏪'}</div>
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

// Modal
window.openMerchant = function (bankCode) {
  const m = allMerchants.find(x => x.bank_code === bankCode);
  if (!m) return;
  currentModalMerchant = m;
  const rate = m.cashback_rate || 15;
  const tier = getTier(rate);
  $('modalMerchantName').innerText = m.name;
  $('modalMerchantInfo').innerHTML = `${m.icon || '🏪'} • ${(m.offers || []).length} عرض • <span class="tier-chip ${tier.cls}">${tier.icon} ${tier.name}</span> • كاش باك <strong>${rate}%</strong>`;
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
    b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(c =>
    c.classList.toggle('active', c.id === 'tab-' + name));
  if (name === 'invoice') renderInvoiceTab();
  if (name === 'requests') renderRequestsTab();
}

// ============================================================
// INVOICE TAB
// ============================================================
async function renderInvoiceTab() {
  if (!currentProfile) return;

  if (currentProfile.role === 'merchant' && currentMerchant) {
    $('invBankCodeGroup').style.display = 'none';
  } else {
    $('invBankCodeGroup').style.display = 'block';
  }

  if (currentProfile.role === 'merchant' && currentMerchant) {
    await renderMerchantExtras();
  } else {
    $('merchantCashbackCard').style.display = 'none';
    $('merchantWalletsCard').style.display = 'none';
    $('merchantInvoicesCard').style.display = 'none';
  }

  await renderMyWalletAndInvoices();
}

async function renderMerchantExtras() {
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
    if (!wallets.length) {
      el.innerHTML = '<p style="color:#6b7280;font-size:14px">لا يوجد أرصدة</p>';
    } else {
      el.innerHTML = wallets.map(w => {
        const name = w.profiles?.name || 'عميل';
        const phone = w.profiles?.phone || '?';
        return `<div style="background:#f9fafb;padding:10px 14px;border-radius:10px;margin-bottom:6px;border-right:4px solid #10b981">
          <div style="font-weight:600">${name} (${phone})</div>
          <div style="font-size:13px;color:#10b981;font-weight:600;margin-top:4px">💰 ${parseFloat(w.balance).toFixed(2)} ج</div>
          <div style="font-size:11px;color:#6b7280">كسب: ${parseFloat(w.earned||0).toFixed(2)} | صرف: ${parseFloat(w.spent||0).toFixed(2)}</div>
        </div>`;
      }).join('');
    }
  } catch (e) { console.error(e); }

  try {
    const invoices = await getMerchantInvoices(currentMerchant.id);
    const el = $('merchantInvoicesList');
    if (!invoices.length) {
      el.innerHTML = '<p style="color:#6b7280;font-size:14px">لا توجد فواتير</p>';
    } else {
      el.innerHTML = invoices.map(inv => `
        <div style="background:#f9fafb;padding:10px 14px;border-radius:10px;margin-bottom:6px;border-right:4px solid #1a2a6c;font-size:13px">
          <div><strong>📄 #${inv.number}</strong> <span style="color:#ff6b35;font-weight:700">${parseFloat(inv.amount).toFixed(2)} ج</span></div>
          <div style="color:#6b7280;margin-top:2px">📱 ${inv.customer_phone} • 💵 ${parseFloat(inv.cashback).toFixed(2)} ج كاش باك</div>
        </div>
      `).join('');
    }
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

      const el = $('customerWalletsList');
      const active = wallets.filter(w => parseFloat(w.balance) > 0 || parseFloat(w.earned) > 0);
      if (!active.length) {
        el.innerHTML = '<p style="color:#6b7280;font-size:14px">لا توجد أرصدة</p>';
      } else {
        el.innerHTML = active.map(w => {
          const m = w.merchants || {};
          return `<div style="background:#f9fafb;padding:10px 14px;border-radius:10px;margin-bottom:6px;border-right:4px solid #10b981">
            <div style="font-weight:600">${m.icon || '🏪'} ${m.name || 'متجر'}</div>
            <div style="font-size:14px;color:#10b981;font-weight:700;margin-top:4px">💰 ${parseFloat(w.balance).toFixed(2)} ج</div>
            <div style="font-size:11px;color:#6b7280">كسب: ${parseFloat(w.earned||0).toFixed(2)} | صرف: ${parseFloat(w.spent||0).toFixed(2)}</div>
          </div>`;
        }).join('');
      }

      const sel = $('redeemMerchant');
      sel.innerHTML = '<option value="">اختار المتجر</option>' +
        active.filter(w => parseFloat(w.balance) > 0).map(w => {
          const m = w.merchants || {};
          return `<option value="${w.merchant_id}">${m.icon || '🏪'} ${m.name || ''} - ${parseFloat(w.balance).toFixed(2)} ج</option>`;
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
      const el = $('customerInvoicesList');
      el.innerHTML = invoices.map(inv => {
        const m = inv.merchants || {};
        return `<div style="background:#f9fafb;padding:10px 14px;border-radius:10px;margin-bottom:6px;border-right:4px solid #1a2a6c;font-size:13px">
          <div><strong>📄 #${inv.number}</strong> • ${m.icon || ''} ${m.name || ''}</div>
          <div style="color:#6b7280;margin-top:2px">💰 ${parseFloat(inv.amount).toFixed(2)} ج • كاش باك ${parseFloat(inv.cashback).toFixed(2)} ج</div>
        </div>`;
      }).join('');
    } else {
      $('customerInvoicesCard').style.display = 'none';
    }
  } catch (e) { console.error(e); }
}

async function handleSubmitInvoice() {
  const num = $('invNumber').value.trim();
  const phone = $('invCustomerPhone').value.trim();
  const amount = parseFloat($('invAmount').value);
  const bankCode = $('invBankCode') ? $('invBankCode').value.trim() : '';
  const res = $('invoiceResult');

  if (!num || !phone || !amount || amount <= 0) {
    res.style.color = '#ef4444';
    res.innerText = '❌ املأ كل البيانات';
    return;
  }

  const isMerchant = currentProfile.role === 'merchant' && currentMerchant;

  if (!isMerchant && !bankCode) {
    res.style.color = '#ef4444';
    res.innerText = '❌ ادخل البنكود';
    return;
  }

  try {
    if (isMerchant) {
      const r = await createInvoice({
        number: num, customerPhone: phone, amount,
        merchantId: currentMerchant.id
      });
      res.style.color = '#10b981';
      res.innerText = `✅ تم الرفع! كاش باك ${parseFloat(r.cashback).toFixed(2)} ج (${r.cashback_rate}%)`;
    } else {
      const r = await createInvoiceByBankCode({
        number: num, customerPhone: phone, amount, bankCode
      });
      res.style.color = '#10b981';
      res.innerText = `✅ تم الرفع! كاش باك ${parseFloat(r.cashback).toFixed(2)} ج (${r.rate}%)`;
    }

    $('invNumber').value = '';
    $('invCustomerPhone').value = '';
    $('invAmount').value = '';
    if ($('invBankCode')) {
      $('invBankCode').value = '';
      $('invBankCode').dataset.realValue = '';
    }

    setTimeout(() => renderInvoiceTab(), 1200);
  } catch (e) {
    res.style.color = '#ef4444';
    res.innerText = '❌ ' + (e.message || 'فشل الرفع');
  }
}

async function handleRedeem() {
  const merchantId = $('redeemMerchant').value;
  const original = parseFloat($('redeemOriginal').value);
  const amount = parseFloat($('redeemAmount').value);
  const res = $('redeemResult');

  if (!merchantId || !original || !amount || amount <= 0) {
    res.style.color = '#ef4444';
    res.innerText = '❌ املأ كل البيانات';
    return;
  }

  try {
    await redeemCashback({ merchantId, amount, originalAmount: original });
    res.style.color = '#10b981';
    res.innerText = `✅ تم الخصم! المطلوب ${(original - amount).toFixed(2)} ج`;
    $('redeemOriginal').value = '';
    $('redeemAmount').value = '';
    setTimeout(() => renderInvoiceTab(), 1200);
  } catch (e) {
    res.style.color = '#ef4444';
    res.innerText = '❌ ' + (e.message || 'فشل الاستخدام');
  }
}

// ============================================================
// REQUESTS TAB
// ============================================================
function handleReqImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    uploadedReqImage = ev.target.result;
    $('reqFileName').innerText = '📎 ' + file.name;
    const prev = $('reqImagePreview');
    prev.src = ev.target.result;
    prev.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

async function handleSendRequest() {
  const category = $('reqCategory').value;
  const product = $('reqProduct').value.trim();
  const details = $('reqDetails').value.trim();
  const res = $('requestSendResult');

  if (!product) {
    res.style.color = '#ef4444';
    res.innerText = '❌ اكتب اسم المنتج';
    return;
  }

  try {
    await sendRequest({ category, product, details, imageBase64: uploadedReqImage });
    res.style.color = '#10b981';
    res.innerText = '✅ تم إرسال الطلب للتجار';
    $('reqProduct').value = '';
    $('reqDetails').value = '';
    $('reqFileName').innerText = 'لم يتم اختيار ملف';
    $('reqImagePreview').style.display = 'none';
    uploadedReqImage = null;
    setTimeout(() => renderRequestsTab(), 1000);
  } catch (e) {
    res.style.color = '#ef4444';
    res.innerText = '❌ ' + (e.message || 'فشل الإرسال');
  }
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
  if (currentReqFilter !== 'all') {
    list = list.filter(r => r.status === currentReqFilter);
  }

  const el = $('myRequestsList');
  if (!list.length) {
    el.innerHTML = '<div class="no-requests">لا توجد طلبات</div>';
    return;
  }

  el.innerHTML = list.map(req => {
    const statusBadge = getStatusBadge(req.status);
    const responses = req.request_responses || [];

    const respHtml = responses.length ? responses.map(r => {
      const m = r.merchants || {};
      const isAccepted = req.accepted_response_id === r.id;
      const imageHtml = r.image_url
        ? `<img src="${r.image_url}" style="width:100%;max-width:150px;border-radius:10px;margin:6px 0;border:2px solid #eee" onerror="this.style.display='none'">`
        : '';
      const acceptBtn = isAccepted
        ? `<button class="accept-btn" style="background:#94a3b8;cursor:not-allowed">✅ مقبول</button>`
        : (req.status === 'accepted' ? '' : `<button class="accept-btn" onclick="acceptOfferClick('${req.id}','${r.id}')">قبول</button>`);

      const msgs = (r.customer_messages || []).map(msg =>
        `<div style="background:#dbeafe;padding:6px 10px;border-radius:8px;margin:4px 0;font-size:12px"><strong>👤 أنت:</strong> ${msg.text}</div>`
      ).join('');

      const replyHtml = r.merchant_reply
        ? `<div style="background:#fef3c7;padding:6px 10px;border-radius:8px;margin:4px 0;font-size:12px"><strong>🏪 ${m.name || ''}:</strong> ${r.merchant_reply}</div>`
        : '';

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
      ? `<img src="${req.image_url}" style="width:100%;max-width:200px;border-radius:10px;margin:6px 0;border:2px solid #ddd">`
      : '';

    let actions = '';
    if (req.status === 'pending' || req.status === 'responded') {
      actions = `<button class="admin-btn danger" onclick="cancelReqClick('${req.id}')" style="margin-top:8px">🚫 إلغاء</button>`;
    } else if (req.status === 'accepted' || req.status === 'cancelled') {
      actions = `<button class="admin-btn danger" onclick="deleteReqClick('${req.id}')" style="margin-top:8px">🗑️ حذف</button>`;
    }

    return `<div class="card" style="padding:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <h4 style="margin:0">📦 ${req.product}</h4>
        ${statusBadge}
      </div>
      ${custImg}
      <div style="color:#4b5563;font-size:14px;margin:6px 0">${req.details || ''}</div>
      <div style="font-size:12px;color:#6b7280">🕒 ${new Date(req.created_at).toLocaleString('ar-EG')}</div>
      ${responses.length ? `<div style="font-size:12px;color:#6b7280;margin-top:6px">💬 ${responses.length} تاجر رد</div>` : ''}
      ${respHtml}
      ${actions}
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
  try {
    await acceptOffer({ requestId: reqId, responseId: respId });
    alert('✅ تم قبول العرض');
    renderRequestsTab();
  } catch (e) { alert('❌ ' + e.message); }
};

window.cancelReqClick = async function (reqId) {
  if (!confirm('متأكد من إلغاء الطلب؟')) return;
  try {
    await cancelRequest(reqId);
    renderRequestsTab();
  } catch (e) { alert('❌ ' + e.message); }
};

window.deleteReqClick = async function (reqId) {
  if (!confirm('متأكد من حذف الطلب؟')) return;
  try {
    await deleteRequest(reqId);
    renderRequestsTab();
  } catch (e) { alert('❌ ' + e.message); }
};

window.askImageClick = async function (respId) {
  const msg = prompt('اكتب رسالتك للتاجر:');
  if (!msg) return;

  const req = myRequestsCache.find(r =>
    (r.request_responses || []).some(x => x.id === respId));
  const resp = req?.request_responses.find(x => x.id === respId);
  if (!resp) return;

  try {
    await askMerchantForImage({
      responseId: respId,
      message: msg,
      existingMessages: resp.customer_messages || []
    });
    alert('✅ تم إرسال الرسالة');
    renderRequestsTab();
  } catch (e) { alert('❌ ' + e.message); }
};

async function renderMerchantRequestsList() {
  const el = $('merchantRequestsList');
  try {
    const requests = await getMerchantRequests(currentMerchant.id, currentMerchant.category);

    if (!requests.length) {
      el.innerHTML = '<p style="color:#6b7280;font-size:14px;text-align:center;padding:20px">مفيش طلبات واردة حالياً 😴</p>';
      return;
    }

    el.innerHTML = requests.map(req => {
      const myReply = (req.request_responses || []).find(r => r.merchant_id === currentMerchant.id);
      const statusBadge = getStatusBadge(req.status);
      const imageHtml = req.image_url
        ? `<img src="${req.image_url}" style="width:100%;max-width:180px;border-radius:10px;margin:8px 0;border:2px solid #ddd">`
        : '';

      let replyHtml = '';
      if (myReply) {
        replyHtml = `<div style="background:#d1fae5;padding:10px;border-radius:10px;margin-top:8px">
          <div style="font-size:12px;color:#065f46;font-weight:700">✅ ردك:</div>
          <div style="font-size:14px;color:#065f46;margin-top:4px">💰 السعر: ${parseFloat(myReply.price).toFixed(0)} ج</div>
          <div style="font-size:13px;color:#065f46">${myReply.message}</div>
        </div>`;
      }

      return `<div style="background:#f9fafb;padding:14px;border-radius:12px;margin-bottom:12px;border-right:4px solid var(--success)">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">
          <h5 style="color:var(--primary);margin:0">📦 ${req.product}</h5>
          ${statusBadge}
        </div>
        <div style="font-size:13px;color:#4b5563;margin-top:6px">${req.details || ''}</div>
        ${imageHtml}
        <div style="font-size:12px;color:#6b7280;margin-top:4px">🕒 ${new Date(req.created_at).toLocaleString('ar-EG')}</div>
        ${replyHtml}
        <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
          ${!myReply ? `<button class="admin-btn primary" onclick="replyToReq('${req.id}')">📩 الرد</button>` : ''}
          <button class="admin-btn danger" onclick="hideReq('${req.id}')">🗑️ مسح</button>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = '<p style="color:#ef4444;font-size:14px">❌ ' + e.message + '</p>';
  }
}

window.replyToReq = async function (reqId) {
  const price = prompt('اكتب السعر (جنيه):');
  if (price === null) return;
  const p = parseFloat(price);
  if (isNaN(p) || p <= 0) { alert('❌ سعر غير صحيح'); return; }

  const message = prompt('اكتب رسالة للعميل:', 'متوفر بسعر ممتاز');
  if (message === null) return;

  try {
    await replyToRequest({
      requestId: reqId,
      merchantId: currentMerchant.id,
      price: p,
      message: message || 'متوفر بسعر ممتاز',
      imageBase64: null
    });
    alert('✅ تم إرسال ردك');
    renderRequestsTab();
  } catch (e) { alert('❌ ' + e.message); }
};

window.hideReq = async function (reqId) {
  if (!confirm('متأكد إنك عايز تمسح الطلب من عندك؟')) return;
  try {
    await hideRequestForMerchant(reqId, currentMerchant.id);
    renderRequestsTab();
  } catch (e) { alert('❌ ' + e.message); }
};

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
    currentMerchant = await getMyMerchant();
    $('merchantBanner').style.display = 'block';
    $('merchantName').innerText = currentMerchant ? currentMerchant.name : 'غير مرتبط';
  } else {
    currentMerchant = null;
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
    t.classList.toggle('active', t.dataset.tab === tab));
  $('loginForm').style.display = tab === 'login' ? 'block' : 'none';
  $('signupForm').style.display = tab === 'signup' ? 'block' : 'none';
  $('authMessage').innerText = '';
  $('authMessage').className = 'auth-message';
}

function updateBankCodeVisibility() {
  $('bankCodeGroup').style.display = $('signupRole').value === 'merchant' ? 'block' : 'none';
}

// ============================================================
// Bind
// ============================================================
function bindEvents() {
  $('loginForm').addEventListener('submit', handleLogin);
  $('signupForm').addEventListener('submit', handleSignup);
  $('logoutBtn').addEventListener('click', handleLogout);
  $('signupRole').addEventListener('change', updateBankCodeVisibility);
  $('submitInvoiceBtn').addEventListener('click', handleSubmitInvoice);
  $('redeemBtn').addEventListener('click', handleRedeem);
  $('reqImage').addEventListener('change', handleReqImage);
  $('sendRequestBtn').addEventListener('click', handleSendRequest);

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