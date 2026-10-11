// ============================================================
// PAMIGO - Merchant Dashboard / Reports / Analytics
// ============================================================
import { supabase } from './supabase.js';

// ============================================================
// Merchant Stats
// ============================================================
export async function getMerchantStats(merchantId) {
  const { data: invoices } = await supabase
    .from('invoices').select('amount, cashback, status, return_amount, returned_cashback, customer_phone')
    .eq('merchant_id', merchantId);

  const { data: offers } = await supabase
    .from('offers').select('id').eq('merchant_id', merchantId);

  const { data: redemptions } = await supabase
    .from('redemptions').select('used_cashback').eq('merchant_id', merchantId);

  let sales = 0, cashbackGiven = 0, cashbackSpent = 0;
  const customers = new Set();
  (invoices || []).forEach(i => {
    if (i.status === 'active') {
      sales += parseFloat(i.amount || 0);
      cashbackGiven += parseFloat(i.cashback || 0);
    } else if (i.status === 'partial_return') {
      sales += parseFloat(i.amount || 0) - parseFloat(i.return_amount || 0);
      cashbackGiven += parseFloat(i.cashback || 0) - parseFloat(i.returned_cashback || 0);
    }
    if (i.customer_phone) customers.add(i.customer_phone);
  });
  (redemptions || []).forEach(r => cashbackSpent += parseFloat(r.used_cashback || 0));

  return {
    customersCount: customers.size,
    sales,
    offersCount: (offers || []).length,
    cashbackGiven,
    cashbackSpent,
    cashbackRemaining: cashbackGiven - cashbackSpent,
    netSales: sales - cashbackSpent
  };
}

// ============================================================
// Offers
// ============================================================
export async function getMerchantOffers(merchantId) {
  const { data, error } = await supabase
    .from('offers').select('*').eq('merchant_id', merchantId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data || [];
}

// ✅ إضافة عرض جديد
export async function addOffer({ merchantId, title, discount, discountValue, description, imageBase64, price }) {
  const { error } = await supabase
    .from('offers').insert({
      merchant_id: merchantId,
      title,
      discount,
      discount_value: discountValue || 0,
      description: description || '',
      image_url: imageBase64 || null,
      price: price || null
    });
  if (error) throw error;
}

// ✅ تعديل عرض موجود
export async function updateOffer({ offerId, title, discount, discountValue, description, imageBase64, price, keepImage }) {
  const updateData = {
    title,
    discount,
    discount_value: discountValue || 0,
    description: description || '',
    price: price || null
  };

  if (imageBase64) {
    updateData.image_url = imageBase64;
  } else if (!keepImage) {
    updateData.image_url = null;
  }

  const { error } = await supabase
    .from('offers')
    .update(updateData)
    .eq('id', offerId);

  if (error) throw error;
}

export async function deleteOffer(offerId) {
  const { error } = await supabase.from('offers').delete().eq('id', offerId);
  if (error) throw error;
}

// ============================================================
// Cashback Rate
// ============================================================
export async function updateCashbackRate(merchantId, rate) {
  const { error } = await supabase
    .from('merchants').update({ cashback_rate: rate }).eq('id', merchantId);
  if (error) throw error;
}

// ============================================================
// Customers / Wallets
// ============================================================
export async function getMerchantCustomers(merchantId) {
  const { data } = await supabase
    .from('invoices')
    .select('customer_phone, amount, created_at')
    .eq('merchant_id', merchantId);
  const map = {};
  (data || []).forEach(i => {
    if (!i.customer_phone) return;
    if (!map[i.customer_phone]) map[i.customer_phone] = { phone: i.customer_phone, count: 0, total: 0 };
    map[i.customer_phone].count++;
    map[i.customer_phone].total += parseFloat(i.amount || 0);
  });
  return Object.values(map);
}

export async function getMerchantWallets(merchantId) {
  const { data } = await supabase
    .from('wallets')
    .select('*, profiles(name, phone)')
    .eq('merchant_id', merchantId)
    .order('balance', { ascending: false });
  return data || [];
}

// ============================================================
// Invoices
// ============================================================
export async function getMerchantInvoicesList(merchantId) {
  const { data } = await supabase
    .from('invoices').select('*').eq('merchant_id', merchantId)
    .order('created_at', { ascending: false }).limit(100);
  return data || [];
}

export async function editInvoice(invoiceId, newAmount, newPhone) {
  const { data, error } = await supabase.rpc('edit_invoice', {
    p_invoice_id: invoiceId,
    p_new_amount: newAmount,
    p_new_phone: newPhone
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
  return data;
}

export async function processReturn(invoiceId, returnAmount) {
  const { data, error } = await supabase.rpc('process_return', {
    p_invoice_id: invoiceId,
    p_return_amount: returnAmount
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
  return data;
}

// ============================================================
// Reports
// ============================================================
export async function getReportData(merchantId, period) {
  const { data: invoices } = await supabase
    .from('invoices').select('*').eq('merchant_id', merchantId);
  const { data: redemptions } = await supabase
    .from('redemptions').select('*').eq('merchant_id', merchantId);

  const now = new Date();
  let startDate;
  if (period === 'daily') startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  else if (period === 'weekly') startDate = new Date(now.getTime() - 7 * 86400000);
  else if (period === 'monthly') startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  else startDate = new Date(0);

  const inv = (invoices || []).filter(i => new Date(i.created_at) >= startDate);
  const red = (redemptions || []).filter(r => new Date(r.created_at) >= startDate);

  let sales = 0, cbGiven = 0;
  inv.forEach(i => {
    const a = parseFloat(i.amount || 0);
    const r = parseFloat(i.return_amount || 0);
    const c = parseFloat(i.cashback || 0);
    const rc = parseFloat(i.returned_cashback || 0);
    if (i.status === 'active') { sales += a; cbGiven += c; }
    else if (i.status === 'partial_return') { sales += (a - r); cbGiven += (c - rc); }
  });
  const cbSpent = red.reduce((s, r) => s + parseFloat(r.used_cashback || 0), 0);

  const uniqueCustomers = new Set(inv.map(i => i.customer_phone).filter(Boolean)).size;
  const avgInvoice = inv.length ? (sales / inv.length).toFixed(2) : 0;

  return {
    invoicesCount: inv.length,
    sales,
    cbGiven,
    cbSpent,
    cbRemaining: cbGiven - cbSpent,
    uniqueCustomers,
    avgInvoice,
    periodLabel: period === 'daily' ? 'النهاردة' :
                 period === 'weekly' ? 'آخر 7 أيام' :
                 period === 'monthly' ? 'الشهر' : 'الكل'
  };
}

// ============================================================
// Analytics
// ============================================================
export async function getAnalytics(merchantId, merchantName, offers) {
  const { data: invoices } = await supabase
    .from('invoices').select('*').eq('merchant_id', merchantId);
  const { data: ratings } = await supabase
    .from('ratings').select('stars').eq('merchant_id', merchantId);

  const inv = invoices || [];
  const totalCustomers = new Set(inv.map(i => i.customer_phone).filter(Boolean)).size;
  const totalSales = inv.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
  const avgSpend = inv.length ? (totalSales / inv.length).toFixed(2) : 0;

  const dayCount = {}, hourCount = {}, custCount = {};
  inv.forEach(i => {
    const d = new Date(i.created_at);
    const day = d.toLocaleDateString('ar-EG', { weekday: 'long' });
    dayCount[day] = (dayCount[day] || 0) + 1;
    const h = d.getHours();
    hourCount[h] = (hourCount[h] || 0) + 1;
    if (i.customer_phone) custCount[i.customer_phone] = (custCount[i.customer_phone] || 0) + 1;
  });

  const topDay = Object.keys(dayCount).length
    ? Object.keys(dayCount).reduce((a, b) => dayCount[a] > dayCount[b] ? a : b) : '-';
  const topHour = Object.keys(hourCount).length
    ? Object.keys(hourCount).reduce((a, b) => hourCount[a] > hourCount[b] ? a : b) + ':00' : '-';
  const repeatCount = Object.values(custCount).filter(c => c > 1).length;

  const avgRating = ratings && ratings.length
    ? (ratings.reduce((s, r) => s + r.stars, 0) / ratings.length).toFixed(1) : '-';

  const topOffer = offers && offers.length ? offers[0].title : '-';

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  let thisMonthSales = 0, lastMonthSales = 0;
  inv.forEach(i => {
    if (i.status === 'returned') return;
    const d = new Date(i.created_at);
    const amt = parseFloat(i.amount || 0) - parseFloat(i.return_amount || 0);
    if (d >= thisMonthStart) thisMonthSales += amt;
    else if (d >= lastMonthStart && d < thisMonthStart) lastMonthSales += amt;
  });

  let growthLabel = '—';
  if (lastMonthSales > 0) {
    const growth = ((thisMonthSales - lastMonthSales) / lastMonthSales) * 100;
    growthLabel = (growth > 0 ? '+' : '') + growth.toFixed(1) + '%';
  } else if (thisMonthSales > 0) {
    growthLabel = '+100%';
  } else {
    growthLabel = 'مفيش بيانات';
  }

  return {
    totalCustomers,
    avgSpend,
    topDay,
    topHour,
    topOffer,
    avgRating,
    repeatCount,
    growth: growthLabel
  };
}

// ============================================================
// Merchant Logo Upload
// ============================================================
export async function uploadMerchantLogo(merchantId, file) {
  if (!file) throw new Error('اختار صورة');
  if (!file.type.startsWith('image/')) throw new Error('لازم صورة');
  if (file.size > 2 * 1024 * 1024) throw new Error('الصورة كبيرة (2MB max)');

  const ext = file.name.split('.').pop().toLowerCase();
  const fileName = `${merchantId}-${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from('merchant-logos')
    .upload(fileName, file, { upsert: true, contentType: file.type });

  if (upErr) throw upErr;

  const { data: urlData } = supabase.storage
    .from('merchant-logos')
    .getPublicUrl(fileName);

  const logoUrl = urlData.publicUrl;

  const { error: updErr } = await supabase
    .from('merchants')
    .update({ logo_url: logoUrl })
    .eq('id', merchantId);

  if (updErr) throw updErr;

  return logoUrl;
}

export async function deleteMerchantLogo(merchantId) {
  const { data: m } = await supabase
    .from('merchants').select('logo_url').eq('id', merchantId).single();

  if (m?.logo_url) {
    const fileName = m.logo_url.split('/').pop();
    await supabase.storage.from('merchant-logos').remove([fileName]);
  }

  const { error } = await supabase
    .from('merchants').update({ logo_url: null }).eq('id', merchantId);
  if (error) throw error;
}

// ============================================================
// Product Image Upload
// ============================================================
export async function uploadProductImage(merchantId, file) {
  if (!file) throw new Error('اختار صورة');
  if (!file.type.startsWith('image/')) throw new Error('لازم صورة');
  if (file.size > 3 * 1024 * 1024) throw new Error('الصورة كبيرة (3MB max)');

  const ext = file.name.split('.').pop().toLowerCase();
  const fileName = `${merchantId}-${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from('product-images')
    .upload(fileName, file, { upsert: true, contentType: file.type });

  if (upErr) throw upErr;

  const { data: urlData } = supabase.storage
    .from('product-images')
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

export async function deleteProductImage(imageUrl) {
  if (!imageUrl) return;
  const fileName = imageUrl.split('/').pop();
  await supabase.storage.from('product-images').remove([fileName]);
}

// ============================================================
// Track Offer Events
// ============================================================
export async function trackOfferEvent({ offerId, merchantId, eventType }) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('offer_events').insert({
      offer_id: offerId || null,
      merchant_id: merchantId,
      customer_id: user?.id || null,
      event_type: eventType
    });
  } catch (e) {
    console.error('Track event error:', e);
  }
}

// ============================================================
// Get Offer Events Stats (للأدمن)
// ============================================================
export async function getOfferEventsStats() {
  const { data, error } = await supabase
    .from('offer_events')
    .select(`
      *,
      offers ( id, title, discount, image_url ),
      merchants ( id, name, icon, logo_url )
    `);
  if (error) { console.error(error); return []; }
  return data || [];
}

// ============================================================
// Get Merchant Top Offers (أكثر عروض التاجر تفاعلًا)
// ============================================================
export async function getMerchantTopOffers(merchantId) {
  const { data, error } = await supabase
    .from('offer_events')
    .select(`
      offer_id,
      event_type,
      offers ( id, title, discount, image_url )
    `)
    .eq('merchant_id', merchantId);
  
  if (error) { console.error(error); return []; }

  const stats = {};
  (data || []).forEach(e => {
    const key = e.offer_id || 'unknown';
    if (!stats[key]) {
      stats[key] = {
        offer_id: e.offer_id,
        title: e.offers?.title || '—',
        discount: e.offers?.discount || '—',
        image_url: e.offers?.image_url || null,
        views: 0,
        clicks: 0,
        contacts: 0,
        maps: 0,
        total: 0
      };
    }
    if (e.event_type === 'view') stats[key].views++;
    if (e.event_type === 'click') stats[key].clicks++;
    if (e.event_type === 'contact') stats[key].contacts++;
    if (e.event_type === 'maps') stats[key].maps++;
    stats[key].total++;
  });

  return Object.values(stats).sort((a, b) => b.total - a.total);
}

// ============================================================
// Get Merchant Offers Views (عدد المشاهدات لكل عرض)
// ============================================================
export async function getMerchantOffersViews(merchantId) {
  const { data, error } = await supabase
    .from('offer_events')
    .select('offer_id, event_type')
    .eq('merchant_id', merchantId)
    .eq('event_type', 'view');
  
  if (error) { console.error(error); return {}; }

  const views = {};
  (data || []).forEach(e => {
    if (!e.offer_id) return;
    views[e.offer_id] = (views[e.offer_id] || 0) + 1;
  });

  return views;
}
