// ============================================================
// PAMIGO - Special Requests
// ============================================================
import { supabase } from './supabase.js';

// ============================================================
// ✅ الطلبات الخاصة (القديمة)
// ============================================================
export async function sendRequest({ category, product, details, imageBase64 }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('مش مسجل دخول');

  const { data, error } = await supabase
    .from('special_requests')
    .insert({
      customer_id: user.id,
      category,
      product: product.trim(),
      details: details.trim() || 'لا تفاصيل',
      image_url: imageBase64 || null,
      status: 'pending',
      request_type: 'special'
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getMyRequests() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('special_requests')
    .select(`
      *,
      request_responses (
        id, price, message, image_url, merchant_id,
        customer_messages, merchant_reply, created_at,
        merchants ( name, icon, lat, lng )
      )
    `)
    .eq('customer_id', user.id)
    .eq('request_type', 'special')
    .order('created_at', { ascending: false });

  if (error) { console.error(error); return []; }
  return data || [];
}

export async function getMerchantRequests(merchantId, merchantCategory) {
  const { data, error } = await supabase
    .from('special_requests')
    .select(`
      *,
      request_responses (
        id, price, message, image_url, merchant_id,
        customer_messages, merchant_reply, created_at
      )
    `)
    .eq('category', merchantCategory)
    .eq('request_type', 'special')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) { console.error(error); return []; }
  return (data || []).filter(r => !r.hidden_by || !r.hidden_by.includes(merchantId));
}

export async function replyToRequest({ requestId, merchantId, price, message, imageBase64 }) {
  const { error } = await supabase
    .from('request_responses')
    .insert({
      request_id: requestId,
      merchant_id: merchantId,
      price: parseFloat(price),
      message: message || 'متوفر بسعر ممتاز',
      image_url: imageBase64 || null
    });
  if (error) throw error;

  await supabase
    .from('special_requests')
    .update({ status: 'responded' })
    .eq('id', requestId);
}

export async function merchantSendExtraImage({ responseId, imageBase64, message }) {
  const { error } = await supabase
    .from('request_responses')
    .update({
      image_url: imageBase64,
      merchant_reply: message || 'دي صورة إضافية'
    })
    .eq('id', responseId);
  if (error) throw error;
}

export async function acceptOffer({ requestId, responseId }) {
  const { error } = await supabase
    .from('special_requests')
    .update({ status: 'accepted', accepted_response_id: responseId })
    .eq('id', requestId);
  if (error) throw error;
}

export async function cancelRequest(requestId) {
  const { error } = await supabase
    .from('special_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId);
  if (error) throw error;
}

export async function deleteRequest(requestId) {
  const { error } = await supabase.from('special_requests').delete().eq('id', requestId);
  if (error) throw error;
}

export async function hideRequestForMerchant(requestId, merchantId) {
  const { data, error } = await supabase.rpc('hide_request_for_merchant', {
    p_request_id: requestId,
    p_merchant_id: merchantId
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error || 'فشل المسح');
  return data;
}

export async function askMerchantForImage({ responseId, message, existingMessages }) {
  const updated = [...(existingMessages || []), {
    text: message,
    date: new Date().toLocaleString('ar-EG')
  }];
  const { error } = await supabase
    .from('request_responses')
    .update({ customer_messages: updated })
    .eq('id', responseId);
  if (error) throw error;
}

// ============================================================
// ✅ طلبات العروض (الجديدة)
// ============================================================

// ✅ العميل يبعت طلب لعرض معين
export async function requestSpecificOffer({ offerId, merchantId, offerTitle, note }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('مش مسجل دخول');

  // جلب بيانات العميل
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, phone')
    .eq('id', user.id)
    .single();

  const customerName = profile?.name || 'عميل';
  const customerPhone = profile?.phone || '';

  const { data, error } = await supabase
    .from('special_requests')
    .insert({
      customer_id: user.id,
      category: 'offer',
      product: offerTitle || 'عرض',
      details: note || 'طلب عرض',
      image_url: null,
      status: 'pending',
      request_type: 'offer',
      offer_id: offerId,
      merchant_id: merchantId,
      customer_name: customerName,
      customer_phone: customerPhone
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ✅ العميل يجيب طلبات العروض بتاعته
export async function getMyOfferRequests() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('special_requests')
    .select(`
      *,
      merchants ( name, icon, phone, whatsapp, bank_code )
    `)
    .eq('customer_id', user.id)
    .eq('request_type', 'offer')
    .order('created_at', { ascending: false });

  if (error) { console.error(error); return []; }
  return data || [];
}

// ✅ التاجر يجيب طلبات العروض الواردة له
export async function getMerchantOfferRequests(merchantId) {
  const { data, error } = await supabase
    .from('special_requests')
    .select(`
      *,
      merchants ( name, icon, phone, whatsapp )
    `)
    .eq('merchant_id', merchantId)
    .eq('request_type', 'offer')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) { console.error(error); return []; }
  return data || [];
}

// ✅ التاجر يرد على طلب العرض (متاح / مش متاح + رد حر)
export async function replyToOfferRequest({ requestId, available, replyText }) {
  const updateData = {
    offer_response: available ? 'available' : 'unavailable',
    offer_reply: replyText || (available ? 'متوفر' : 'مش متاح حالياً'),
    status: 'responded',
    responded_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('special_requests')
    .update(updateData)
    .eq('id', requestId);

  if (error) throw error;
}

// ✅ العميل يلغي طلب العرض
export async function cancelOfferRequest(requestId) {
  const { error } = await supabase
    .from('special_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId);
  if (error) throw error;
}

// ✅ العميل يحذف طلب العرض
export async function deleteOfferRequest(requestId) {
  const { error } = await supabase.from('special_requests').delete().eq('id', requestId);
  if (error) throw error;
}
