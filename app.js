// ============================================================
// PAMIGO - Main Entry
// ============================================================
import { supabase } from './supabase.js';

console.log('🚀 PAMIGO starting...');

// ============================================================
// اختبار الاتصال بـ Supabase
// ============================================================
async function testConnection() {
  const statusEl = document.getElementById('connStatus');
  try {
    const { count, error } = await supabase
      .from('merchants')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;

    statusEl.innerHTML = `✅ متصل بـ Supabase — عدد التجار في الداتابيز: <strong>${count}</strong>`;
    statusEl.style.color = '#065f46';
    statusEl.style.background = '#d1fae5';
  } catch (err) {
    statusEl.innerHTML = `❌ فشل الاتصال: ${err.message}`;
    statusEl.style.color = '#991b1b';
    statusEl.style.background = '#fee2e2';
    console.error(err);
  }
}

// ============================================================
// فحص كل الجداول
// ============================================================
async function testTables() {
  const results = [];
  const tables = [
    'profiles', 'merchants', 'offers', 'invoices', 'wallets',
    'redemptions', 'special_requests', 'request_responses',
    'ratings', 'notifications'
  ];

  for (const t of tables) {
    const { error } = await supabase
      .from(t)
      .select('*', { count: 'exact', head: true });
    results.push({ table: t, ok: !error, error: error?.message });
  }

  const el = document.getElementById('tablesStatus');
  el.innerHTML = results.map(r =>
    `<div style="padding:6px 0;border-bottom:1px solid #eee;display:flex;justify-content:space-between">
      <span>${r.ok ? '✅' : '❌'} <code>${r.table}</code></span>
      ${r.error ? `<span style="color:#ef4444;font-size:12px">${r.error}</span>` : ''}
    </div>`
  ).join('');
}

// ============================================================
// تشغيل عند تحميل الصفحة
// ============================================================
window.addEventListener('load', () => {
  testConnection();
  testTables();
});