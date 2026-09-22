// ============================================================
// PAMIGO - Admin Panel
// ============================================================
import { supabase } from './supabase.js?v=20260922';

export async function getAdminStats() {
  const { data: merchants } = await supabase.from('merchants').select('id');
  const { data: profiles } = await supabase.from('profiles').select('id');
  const { data: invoices } = await supabase.from('invoices').select('amount, cashback, status, return_amount, returned_cashback');
  const { data: redemptions } = await supabase.from('redemptions').select('used_cashback');
  const { data: offers } = await supabase.from('offers').select('id');

  let sales = 0, cbGiven = 0;
  (invoices || []).forEach(i => {
    if (i.status === 'active') { sales += parseFloat(i.amount||0); cbGiven += parseFloat(i.cashback||0); }
    else if (i.status === 'partial_return') {
      sales += parseFloat(i.amount||0) - parseFloat(i.return_amount||0);
      cbGiven += parseFloat(i.cashback||0) - parseFloat(i.returned_cashback||0);
    }
  });
  const cbSpent = (redemptions || []).reduce((s, r) => s + parseFloat(r.used_cashback || 0), 0);

  return {
    tradersCount: (merchants || []).length,
    customersCount: (profiles || []).length,
    invoicesCount: (invoices || []).length,
    sales,
    cbGiven,
    cbSpent,
    cbRemaining: cbGiven - cbSpent,
    offersCount: (offers || []).length
  };
}

export async function getAllMerchants() {
  const { data } = await supabase
    .from('merchants').select('*, offers(id)')
    .order('created_at', { ascending: false });
  return data || [];
}

export async function getAllCustomers() {
  const { data: profiles } = await supabase.from('profiles').select('*').eq('role', 'customer');
  const { data: wallets } = await supabase.from('wallets').select('*');

  return (profiles || []).map(p => {
    const w = (wallets || []).filter(x => x.customer_id === p.id);
    return {
      ...p,
      balance: w.reduce((s, x) => s + parseFloat(x.balance || 0), 0),
      earned: w.reduce((s, x) => s + parseFloat(x.earned || 0), 0),
      spent: w.reduce((s, x) => s + parseFloat(x.spent || 0), 0),
      shops: w.length
    };
  });
}

export async function getAllInvoices(search) {
  const { data } = await supabase.from('invoices')
    .select('*, merchants(name, icon)')
    .order('created_at', { ascending: false }).limit(200);
  let list = data || [];
  if (search) {
    const s = search.toLowerCase();
    list = list.filter(i =>
      (i.number || '').toLowerCase().includes(s) ||
      (i.customer_phone || '').includes(s) ||
      (i.merchants?.name || '').toLowerCase().includes(s)
    );
  }
  return list;
}

export async function addTrader(data) {
  const { data: res, error } = await supabase.rpc('admin_add_merchant', {
    p_bank_code: data.bankCode,
    p_name: data.name,
    p_phone: data.phone,
    p_category: data.category,
    p_sub_categories: data.subCategories,
    p_icon: data.icon,
    p_lat: data.lat,
    p_lng: data.lng,
    p_cashback_rate: data.rate
  });
  if (error) throw error;
  if (!res.ok) throw new Error(res.error);
  return res;
}

export async function freezeMerchant(merchantId, frozen) {
  const { data, error } = await supabase.rpc('admin_freeze_merchant', {
    p_merchant_id: merchantId, p_frozen: frozen
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
  return data;
}

export async function updateMerchantRate(merchantId, rate) {
  const { error } = await supabase.from('merchants').update({ cashback_rate: rate }).eq('id', merchantId);
  if (error) throw error;
}

export async function deleteMerchant(merchantId) {
  const { error } = await supabase.from('merchants').delete().eq('id', merchantId);
  if (error) throw error;
}

export async function adminUpdateMerchant(merchantId, data) {
  const { data: res, error } = await supabase.rpc('admin_update_merchant', {
    p_merchant_id: merchantId,
    p_new_name: data.name || null,
    p_new_phone: data.phone || null,
    p_new_lat: data.lat ?? null,
    p_new_lng: data.lng ?? null,
    p_new_rate: data.rate ?? null,
    p_new_sub_categories: data.subCategories || null,
    p_new_bank_code: data.bankCode || null
  });
  if (error) throw error;
  if (!res.ok) throw new Error(res.error);
  return res;
}

export async function adminUpdateCustomer(phone, newName, newPhone) {
  const { data, error } = await supabase.rpc('admin_update_customer', {
    p_phone: phone,
    p_new_name: newName || null,
    p_new_phone: newPhone || null
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
  return data;
}

export async function adjustCustomerBalance(phone, merchantId, amount) {
  const { data, error } = await supabase.rpc('admin_adjust_balance', {
    p_customer_phone: phone, p_merchant_id: merchantId, p_amount: amount
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
  return data;
}

export async function resetCustomerBalance(phone) {
  const { data: prof } = await supabase.from('profiles').select('id').eq('phone', phone).single();
  if (!prof) throw new Error('مش موجود');
  const { error } = await supabase.from('wallets').update({ balance: 0 }).eq('customer_id', prof.id);
  if (error) throw error;
}

export async function deleteCustomer(phone) {
  const { data: prof } = await supabase.from('profiles').select('id').eq('phone', phone).single();
  if (prof) {
    await supabase.from('wallets').delete().eq('customer_id', prof.id);
    await supabase.from('invoices').update({ customer_id: null }).eq('customer_id', prof.id);
  }
}

export async function editInvoiceAdmin(invoiceId, newAmount, newPhone) {
  const { data, error } = await supabase.rpc('edit_invoice', {
    p_invoice_id: invoiceId, p_new_amount: newAmount, p_new_phone: newPhone
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
  return data;
}

export async function returnInvoiceAdmin(invoiceId, returnAmount) {
  const { data, error } = await supabase.rpc('process_return', {
    p_invoice_id: invoiceId, p_return_amount: returnAmount
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
  return data;
}

export async function deleteInvoice(invoiceId) {
  const { error } = await supabase.from('invoices').delete().eq('id', invoiceId);
  if (error) throw error;
}

export async function sendNotification({ title, message, target }) {
  const { error } = await supabase.from('notifications').insert({ title, message, target });
  if (error) throw error;
}

export async function getNotifications() {
  const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
  return data || [];
}

export async function adminGetAllRequests() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

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

export async function adminResetUserPassword(userId, newPassword) {
  const { data, error } = await supabase.rpc('admin_change_password', {
    p_user_id: userId, p_new_password: newPassword
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
  return data;
}