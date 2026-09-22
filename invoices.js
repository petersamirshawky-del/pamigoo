// ============================================================
// PAMIGO - Invoices + Wallets
// ============================================================
import { supabase } from './supabase.js?v=20260922';

export async function createInvoiceByBankCode({ number, customerPhone, amount, bankCode }) {
  const { data, error } = await supabase.rpc('create_invoice_by_bankcode', {
    p_number: number.trim(),
    p_customer_phone: customerPhone.trim(),
    p_amount: parseFloat(amount),
    p_bank_code: bankCode.trim()
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error || 'فشل رفع الفاتورة');
  return data;
}

export async function createInvoice({ number, customerPhone, amount, merchantId }) {
  const { data, error } = await supabase
    .from('invoices')
    .insert({
      number: number.trim(),
      customer_phone: customerPhone.trim(),
      amount: parseFloat(amount),
      merchant_id: merchantId
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getMerchantInvoices(merchantId) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

export async function getMyInvoices(phone) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, merchants(name, icon)')
    .eq('customer_phone', phone)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

export async function getMyWallets(customerId) {
  const { data, error } = await supabase
    .from('wallets')
    .select('*, merchants(name, icon, bank_code)')
    .eq('customer_id', customerId);
  if (error) throw error;
  return data || [];
}

export async function redeemCashback({ merchantId, amount, originalAmount }) {
  const { data, error } = await supabase.rpc('redeem_cashback', {
    p_merchant_id: merchantId,
    p_amount: amount,
    p_original: originalAmount
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error || 'فشل الاستخدام');
  return data;
}

export async function getMerchantCustomerWallets(merchantId) {
  const { data, error } = await supabase
    .from('wallets')
    .select('*, profiles(name, phone)')
    .eq('merchant_id', merchantId)
    .order('balance', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

export async function getMerchantCashbackSummary(merchantId) {
  const { data: invoices } = await supabase
    .from('invoices')
    .select('cashback, amount, status, return_amount, returned_cashback')
    .eq('merchant_id', merchantId);

  const { data: redemptions } = await supabase
    .from('redemptions')
    .select('used_cashback')
    .eq('merchant_id', merchantId);

  let given = 0, sales = 0, spent = 0;
  (invoices || []).forEach(i => {
    if (i.status === 'active') {
      given += parseFloat(i.cashback || 0);
      sales += parseFloat(i.amount || 0);
    } else if (i.status === 'partial_return') {
      given += parseFloat(i.cashback || 0) - parseFloat(i.returned_cashback || 0);
      sales += parseFloat(i.amount || 0) - parseFloat(i.return_amount || 0);
    }
  });
  (redemptions || []).forEach(r => {
    spent += parseFloat(r.used_cashback || 0);
  });

  return {
    cashbackGiven: given,
    cashbackSpent: spent,
    cashbackRemaining: given - spent,
    netSales: sales - spent,
    totalSales: sales
  };
}