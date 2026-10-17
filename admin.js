// ============================================================
// PAMIGO - Admin Functions
// ============================================================
import { supabase } from './supabase.js';

// ============================================================
// إحصائيات الأدمن
// ============================================================
export async function getAdminStats() {
  const { count: tradersCount } = await supabase.from('merchants').select('*', { count: 'exact', head: true });
  const { count: customersCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer');
  const { count: invoicesCount } = await supabase.from('invoices').select('*', { count: 'exact', head: true });
  const { count: offersCount } = await supabase.from('offers').select('*', { count: 'exact', head: true });

  const { data: invoices } = await supabase.from('invoices').select('amount, cashback, used_cashback, status');
  const allInv = invoices || [];
  const activeInv = allInv.filter(i => i.status === 'active');

  const sales = activeInv.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
  const cbGiven = activeInv.reduce((s, i) => s + parseFloat(i.cashback || 0), 0);
  const cbSpent = activeInv.reduce((s, i) => s + parseFloat(i.used_cashback || 0), 0);

  return {
    tradersCount: tradersCount || 0,
    customersCount: customersCount || 0,
    invoicesCount: invoicesCount || 0,
    offersCount: offersCount || 0,
    sales: sales,
    cbGiven: cbGiven,
    cbSpent: cbSpent,
    cbRemaining: cbGiven - cbSpent
  };
}

// ============================================================
// جلب كل التجار
// ============================================================
export async function getAllMerchants() {
  const { data, error } = await supabase
    .from('merchants')
    .select(`
      *,
      offers ( id, title, discount, discount_value )
    `)
    .order('name');

  if (error) { console.error(error); return []; }
  return data || [];
}

// ============================================================
// جلب كل العملاء
// ============================================================
export async function getAllCustomers() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'customer');

  if (error) { console.error(error); return []; }
  if (!profiles || !profiles.length) return [];

  const customerPhones = profiles.map(p => p.phone).filter(Boolean);
  if (!customerPhones.length) {
    return profiles.map(p => ({ ...p, shops: 0, balance: 0, earned: 0, spent: 0 }));
  }

  const chunkArray = (arr, size) => {
    const chunked = [];
    for (let i = 0; i < arr.length; i += size) {
      chunked.push(arr.slice(i, i + size));
    }
    return chunked;
  };

  const phoneChunks = chunkArray(customerPhones, 50); // كل مجموعة فيها 50 رقم
  let allInvoices = [];
  let allWallets = [];

  for (const chunk of phoneChunks) {
    const { data: invs } = await supabase
      .from('invoices')
      .select('customer_phone, amount, cashback, used_cashback, status')
      .in('customer_phone', chunk);
      
    if (invs) allInvoices.push(...invs);

    const { data: wals } = await supabase
      .from('wallets')
      .select('customer_phone, balance, earned, spent')
      .in('customer_phone', chunk);
      
    if (wals) allWallets.push(...wals);
  }

  const invByPhone = {};
  allInvoices.forEach(i => {
    if (!invByPhone[i.customer_phone]) invByPhone[i.customer_phone] = [];
    invByPhone[i.customer_phone].push(i);
  });

  const walletsByPhone = {};
  allWallets.forEach(w => {
    if (!walletsByPhone[w.customer_phone]) walletsByPhone[w.customer_phone] = [];
    walletsByPhone[w.customer_phone].push(w);
  });

  return profiles.map(p => {
    const invs = invByPhone[p.phone] || [];
    const ws = walletsByPhone[p.phone] || [];
    const balance = ws.reduce((s, w) => s + parseFloat(w.balance || 0), 0);
    const earned = ws.reduce((s, w) => s + parseFloat(w.earned || 0), 0);
    const spent = ws.reduce((s, w) => s + parseFloat(w.spent || 0), 0);
    
    return {
      ...p,
      shops: ws.length,
      balance: balance,
      earned: earned,
      spent: spent
    };
  });
}
// ============================================================
// جلب كل الفواتير
// ============================================================
export async function getAllInvoices(search = '') {
  let q = supabase
    .from('invoices')
    .select(`
      *,
      merchants ( name, icon, phone )
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  if (search) {
    q = q.or(`number.ilike.%${search}%,customer_phone.ilike.%${search}%`);
  }

  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return data || [];
}

// ============================================================
// إضافة تاجر جديد
// ============================================================
export async function addTrader({ bankCode, name, phone, category, subCategories, icon, lat, lng, rate, deliveryAvailable, deliveryPhone, merchantType, whatsapp }) {
  const { data, error } = await supabase.rpc('create_merchant_admin', {
    p_bank_code: bankCode.toUpperCase(),
    p_name: name,
    p_phone: phone,
    p_category: category,
    p_sub_categories: subCategories || [],
    p_icon: icon || '🏪',
    p_lat: lat,
    p_lng: lng,
    p_rate: rate,
    p_delivery_available: deliveryAvailable || false,
    p_delivery_phone: deliveryPhone || null,
    p_merchant_type: merchantType || 'shop',
    p_whatsapp: whatsapp || null
  });

  if (error) throw new Error(error.message);
  if (!data.ok) throw new Error(data.error || 'فشل الإضافة');
  return data;
}

// ============================================================
// تجميد تاجر
// ============================================================
export async function freezeMerchant(merchantId, frozen) {
  const { error } = await supabase
    .from('merchants')
    .update({ frozen: frozen })
    .eq('id', merchantId);
  if (error) throw error;
}

// ============================================================
// تحديث نسبة تاجر
// ============================================================
export async function updateMerchantRate(merchantId, rate) {
  const { error } = await supabase
    .from('merchants')
    .update({ cashback_rate: rate })
    .eq('id', merchantId);
  if (error) throw error;
}

// ============================================================
// حذف تاجر
// ============================================================
export async function deleteMerchant(merchantId) {
  const { data, error } = await supabase.rpc('delete_merchant_admin', {
    p_merchant_id: merchantId
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error || 'فشل الحذف');
  return data;
}

// ============================================================
// تعديل رصيد عميل
// ============================================================
export async function adjustCustomerBalance(phone, merchantId, amount) {
  const { data, error } = await supabase.rpc('adjust_customer_balance', {
    p_customer_phone: phone,
    p_merchant_id: merchantId,
    p_amount: amount
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error || 'فشل التعديل');
  return data;
}

// ============================================================
// تصفير رصيد عميل
// ============================================================
export async function resetCustomerBalance(phone) {
  const { data, error } = await supabase.rpc('reset_customer_balance', {
    p_customer_phone: phone
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error || 'فشل التصفير');
  return data;
}

// ============================================================
// حذف عميل
// ============================================================
export async function deleteCustomer(phone) {
  const { data, error } = await supabase.rpc('delete_customer_admin', {
    p_customer_phone: phone
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error || 'فشل الحذف');
  return data;
}

// ============================================================
// تعديل فاتورة (أدمن)
// ============================================================
export async function editInvoiceAdmin(invoiceId, newAmount, newCashback) {
  const updateData = { amount: newAmount };
  if (newCashback !== null && newCashback !== undefined) {
    updateData.cashback = newCashback;
  }

  const { error } = await supabase
    .from('invoices')
    .update(updateData)
    .eq('id', invoiceId);
  if (error) throw error;
}

// ============================================================
// مرتجع فاتورة (أدمن)
// ============================================================
export async function returnInvoiceAdmin(invoiceId, returnAmount) {
  const { data: inv, error: invErr } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();

  if (invErr) throw invErr;
  if (!inv) throw new Error('الفاتورة غير موجودة');

  const isFullReturn = Math.abs(returnAmount - parseFloat(inv.amount)) < 0.01;
  const newStatus = isFullReturn ? 'returned' : 'partially_returned';

  const cashbackRatio = parseFloat(inv.cashback) / parseFloat(inv.amount);
  const cashbackToRemove = returnAmount * cashbackRatio;

  const { error: updErr } = await supabase
    .from('invoices')
    .update({
      status: newStatus,
      amount: isFullReturn ? inv.amount : parseFloat(inv.amount) - returnAmount,
      cashback: isFullReturn ? inv.cashback : parseFloat(inv.cashback) - cashbackToRemove
    })
    .eq('id', invoiceId);

  if (updErr) throw updErr;
}

// ============================================================
// حذف فاتورة (أدمن) + تسجيل في audit_log
// ============================================================
export async function deleteInvoice(invoiceId, deleteCashback = false) {
  // ✅ سجّل العملية في audit_log أول حاجة
  try {
    const { data: invData } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (invData) {
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from('audit_log').insert({
        action: 'delete_invoice',
        table_name: 'invoices',
        record_id: String(invoiceId),
        old_data: invData,
        performed_by: userData?.user?.id || null
      });
    }
  } catch (e) {
    console.error('Audit log error:', e);
  }

  // لو عايز يخصم الكاش باك من المحفظة
  if (deleteCashback) {
    try {
      const { data: inv } = await supabase
        .from('invoices')
        .select('merchant_id, customer_phone, cashback')
        .eq('id', invoiceId)
        .single();

      if (inv && inv.cashback && parseFloat(inv.cashback) > 0) {
        await supabase.rpc('deduct_cashback_from_wallet', {
          p_customer_phone: inv.customer_phone,
          p_merchant_id: inv.merchant_id,
          p_amount: parseFloat(inv.cashback)
        });
      }
    } catch (e) {
      console.error('Deduct cashback error:', e);
    }
  }

  const { error } = await supabase.from('invoices').delete().eq('id', invoiceId);
  if (error) throw error;
}

// ============================================================
// إرسال إشعار
// ============================================================
export async function sendNotification({ title, message, target }) {
  const { error } = await supabase
    .from('notifications')
    .insert({ title, message, target: target || 'all' });
  if (error) throw error;
}

// ============================================================
// جلب الإشعارات
// ============================================================
export async function getNotifications() {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) { console.error(error); return []; }
  return data || [];
}

// ============================================================
// تحديث بيانات تاجر (أدمن)
// ============================================================
export async function adminUpdateMerchant(merchantId, data) {
  const updateData = {
    name: data.name,
    phone: data.phone,
    bank_code: data.bankCode?.toUpperCase(),
    category: data.category,
    sub_categories: data.subCategories || [],
    lat: data.lat,
    lng: data.lng,
    cashback_rate: data.rate,
    delivery_available: data.deliveryAvailable || false,
    delivery_phone: data.deliveryPhone || null,
    merchant_type: data.merchantType || 'shop',
    whatsapp: data.whatsapp || null
  };

  const { error } = await supabase
    .from('merchants')
    .update(updateData)
    .eq('id', merchantId);

  if (error) throw error;
}

// ============================================================
// تحديث بيانات عميل (أدمن)
// ============================================================
export async function adminUpdateCustomer(oldPhone, newName, newPhone) {
  // ✅ لو رقم الموبايل اتغير، نحدثه في كل الجداول
  const updates = [];

  // 1. تحديث profiles
  updates.push(
    supabase.from('profiles').update({ name: newName, phone: newPhone }).eq('phone', oldPhone)
  );

  // 2. تحديث invoices (customer_phone)
  if (newPhone !== oldPhone) {
    updates.push(
      supabase.from('invoices').update({ customer_phone: newPhone }).eq('customer_phone', oldPhone)
    );

    // 3. تحديث wallets (customer_phone)
    updates.push(
      supabase.from('wallets').update({ customer_phone: newPhone }).eq('customer_phone', oldPhone)
    );

    // 4. تحديث special_requests (customer_phone)
    updates.push(
      supabase.from('special_requests').update({ customer_phone: newPhone }).eq('customer_phone', oldPhone)
    );
  }

  const results = await Promise.all(updates);
  for (const r of results) {
    if (r.error) throw r.error;
  }
}

// ============================================================
// جلب كل الطلبات (أدمن)
// ============================================================
export async function adminGetAllRequests() {
  const { data, error } = await supabase
    .from('special_requests')
    .select(`
      *,
      request_responses (
        id, price, message, image_url, merchant_id,
        customer_messages, merchant_reply, created_at,
        merchants ( name, icon )
      )
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) { console.error(error); return []; }
  return data || [];
}

// ============================================================
// إحصائيات تفاعل العروض (أدمن)
// ============================================================
export async function getOfferEventsStats() {
  const { data: events, error } = await supabase
    .from('offer_events')
    .select('*');

  if (error) { console.error(error); return []; }
  if (!events || !events.length) return [];

  const { data: offers } = await supabase.from('offers').select('id, title, discount, merchant_id');
  const { data: merchants } = await supabase.from('merchants').select('id, name, icon');

  const offersMap = {};
  (offers || []).forEach(o => offersMap[o.id] = o);

  const merchantsMap = {};
  (merchants || []).forEach(m => merchantsMap[m.id] = m);

  const grouped = {};
  events.forEach(e => {
    const key = e.offer_id;
    if (!key) return;
    if (!grouped[key]) {
      grouped[key] = {
        offer_id: e.offer_id,
        views: 0,
        clicks: 0,
        contacts: 0,
        maps: 0,
        total: 0
      };
    }
    const g = grouped[key];
    if (e.event_type === 'view') g.views++;
    else if (e.event_type === 'click') g.clicks++;
    else if (e.event_type === 'contact') g.contacts++;
    else if (e.event_type === 'maps') g.maps++;
    g.total++;
  });

  return Object.values(grouped).map(g => {
    const offer = offersMap[g.offer_id] || {};
    const merchant = merchantsMap[offer.merchant_id] || {};
    return {
      ...g,
      offer_title: offer.title || 'عرض',
      offer_discount: offer.discount || '-',
      merchant_name: merchant.name || 'تاجر',
      merchant_icon: merchant.icon || '🏪'
    };
  });
}

// ============================================================
// ✅ تقرير كامل للتاجر
// ============================================================
export async function getMerchantFullReport(merchantId) {
  // 1. جلب الفواتير
  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('*')
    .eq('merchant_id', merchantId);

  if (invErr) { console.error(invErr); }

  const allInvoices = invoices || [];
  const activeInvoices = allInvoices.filter(i => i.status === 'active');
  const returnedInvoices = allInvoices.filter(i => i.status === 'returned' || i.status === 'partially_returned');

  const totalSales = activeInvoices.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
  const totalCashbackGiven = activeInvoices.reduce((s, i) => s + parseFloat(i.cashback || 0), 0);
  const totalCashbackSpent = activeInvoices.reduce((s, i) => s + parseFloat(i.used_cashback || 0), 0);
  const totalCashbackRemaining = totalCashbackGiven - totalCashbackSpent;

  // 2. عدد العملاء الفريدين
  const uniqueCustomers = new Set(activeInvoices.map(i => i.customer_phone)).size;

  // 3. متوسط الفاتورة
  const avgInvoice = activeInvoices.length > 0 ? (totalSales / activeInvoices.length) : 0;

  // 4. عدد العروض
  const { data: offers } = await supabase
    .from('offers')
    .select('id')
    .eq('merchant_id', merchantId);

  // 5. عدد الفواتير المحذوفة (من audit_log)
  let deletedCount = 0;
  try {
    const { data: deleted } = await supabase
      .from('audit_log')
      .select('id')
      .eq('action', 'delete_invoice')
      .eq('table_name', 'invoices')
      .filter('old_data->>merchant_id', 'eq', merchantId);
    deletedCount = (deleted || []).length;
  } catch (e) { /* لو الجدول مش موجود */ }

  return {
    invoicesCount: activeInvoices.length,
    returnedCount: returnedInvoices.length,
    deletedCount: deletedCount,
    totalSales: totalSales,
    totalCashbackGiven: totalCashbackGiven,
    totalCashbackSpent: totalCashbackSpent,
    totalCashbackRemaining: totalCashbackRemaining,
    uniqueCustomers: uniqueCustomers,
    avgInvoice: avgInvoice,
    offersCount: (offers || []).length
  };
}
