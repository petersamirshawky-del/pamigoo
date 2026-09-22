// ============================================================
// PAMIGO - Ratings
// ============================================================
import { supabase } from './supabase.js?v=20260922';

// ============================================================
// عميل يقيّم تاجر
// ============================================================
export async function rateMerchant({ merchantId, stars, comment }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('مش مسجل دخول');

  if (!merchantId) throw new Error('التاجر غير معروف');
  if (!stars || stars < 1 || stars > 5) throw new Error('اختار 1-5 نجوم');

  const { data: existing } = await supabase
    .from('ratings')
    .select('id')
    .eq('merchant_id', merchantId)
    .eq('customer_id', user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('ratings')
      .update({
        stars,
        comment: comment || '',
        created_at: new Date().toISOString()
      })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('ratings')
      .insert({
        merchant_id: merchantId,
        customer_id: user.id,
        stars,
        comment: comment || ''
      });
    if (error) throw error;
  }

  return true;
}

// ============================================================
// جلب تقييمات تاجر
// ============================================================
export async function getMerchantRatings(merchantId) {
  const { data, error } = await supabase
    .from('ratings')
    .select(`
      id, stars, comment, created_at,
      profiles ( name )
    `)
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: false });

  if (error) { console.error('Ratings fetch error:', error); return []; }
  return data || [];
}

// ============================================================
// جلب تقييم العميل لتاجر معين
// ============================================================
export async function getMyRating(merchantId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('ratings')
    .select('*')
    .eq('merchant_id', merchantId)
    .eq('customer_id', user.id)
    .maybeSingle();

  if (error) return null;
  return data;
}