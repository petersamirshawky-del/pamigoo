// ============================================================
// PAMIGO - Notifications Module
// ============================================================
const { supabase } = await import('./supabase.js');

let realtimeChannels = [];
let lastKnownState = {
  pendingInvoices: 0,
  merchantPendingRequests: 0,
  offerRequestPendingForMerchant: 0
};

// ============================================================
// طلب إذن الإشعارات
// ============================================================
export async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    const perm = await Notification.requestPermission();
    return perm === "granted";
  } catch {
    return false;
  }
}

// ============================================================
// عرض إشعار
// ============================================================
export function showBrowserNotification(title, body, options = {}) {
  const icon = options.icon || "https://ui-avatars.com/api/?name=P&background=ff6b35&color=fff&size=128";

  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const n = new Notification(title, {
        body,
        icon,
        badge: icon,
        tag: options.tag || "pamigo-" + Date.now(),
      });
      n.onclick = () => {
        window.focus();
        if (options.onClick) options.onClick();
        n.close();
      };
      return n;
    } catch (e) {
      console.error("Notification error:", e);
    }
  }

  // بديل: Toast
  if (typeof window.showPamigoToast === "function") {
    window.showPamigoToast(title + ": " + body, "info");
  }
}

// ============================================================
// جلب الإشعارات غير المقروءة
// ============================================================
export async function getMyUnreadNotifications() {
  const { data, error } = await supabase.rpc("get_my_unread_notifications");
  if (error) {
    console.error("getMyUnreadNotifications error:", error);
    return [];
  }
  return data || [];
}

export async function markNotificationRead(notificationId) {
  const { error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: notificationId
  });
  if (error) console.error("markNotificationRead error:", error);
}

// ============================================================
// فحص إشعارات الأدمن
// ============================================================
export async function checkAdminNotifications() {
  const notifications = await getMyUnreadNotifications();
  if (!notifications.length) return;

  for (const n of notifications) {
    showBrowserNotification("📢 " + n.title, n.message, {
      tag: "admin-notif-" + n.id
    });
    await markNotificationRead(n.id);
  }
}

// ============================================================
// فحص فواتير العميل المعلقة
// ============================================================
export async function checkCustomerPendingInvoices(phone) {
  const { data, error } = await supabase
    .from("invoices")
    .select("id, number, amount, cashback, created_at, merchants(name, icon)")
    .eq("customer_phone", phone)
    .eq("confirmation_status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("checkCustomerPendingInvoices error:", error);
    return;
  }

  const currentCount = (data || []).length;

  if (currentCount > lastKnownState.pendingInvoices && lastKnownState.pendingInvoices >= 0) {
    const latest = data[0];
    if (latest) {
      showBrowserNotification(
        "🧾 عندك فاتورة جديدة!",
        `${latest.merchants?.icon || "🏪"} ${latest.merchants?.name || "متجر"}: ${parseFloat(latest.amount).toFixed(2)} ج`,
        {
          tag: "invoice-" + latest.id,
          onClick: () => window.switchTab && window.switchTab("invoice")
        }
      );
    }
  }

  lastKnownState.pendingInvoices = currentCount;
}

// ============================================================
// فحص طلبات التاجر الجديدة
// ============================================================
export async function checkMerchantNewRequests(merchantId) {
  // 1. طلبات العروض (عروض محددة)
  const offerReqs = await supabase
    .from("offer_requests")
    .select("id")
    .eq("merchant_id", merchantId)
    .is("offer_response", null);

  // 2. الطلبات الخاصة
  const specialReqs = await supabase
    .from("special_requests")
    .select("id, request_responses(id, merchant_id)")
    .order("created_at", { ascending: false })
    .limit(30);

  const pendingOffers = (offerReqs.data || []).length;
  
  let pendingSpecial = 0;
  if (specialReqs.data) {
    pendingSpecial = specialReqs.data.filter(
      (r) => !r.request_responses || !r.request_responses.some(resp => resp.merchant_id === merchantId)
    ).length;
  }

  const totalPending = pendingOffers + pendingSpecial;
  const prevTotal = lastKnownState.merchantPendingRequests + lastKnownState.offerRequestPendingForMerchant;

  if (totalPending > prevTotal && prevTotal >= 0) {
    const diff = totalPending - prevTotal;
    showBrowserNotification(
      "🔔 عندك طلبات جديدة!",
      `وصلتك ${diff} طلب جديد محتاج ردك`,
      {
        tag: "merchant-req-" + Date.now(),
        onClick: () => window.switchTab && window.switchTab("special_requests")
      }
    );
  }

  lastKnownState.merchantPendingRequests = pendingSpecial;
  lastKnownState.offerRequestPendingForMerchant = pendingOffers;

  return { pendingOffers, pendingSpecial, total: totalPending };
}

// ============================================================
// تنظيف
// ============================================================
export function cleanupRealtime() {
  realtimeChannels.forEach((ch) => {
    try { supabase.removeChannel(ch); } catch {}
  });
  realtimeChannels = [];
}

export function resetLastKnownState() {
  lastKnownState = {
    pendingInvoices: 0,
    merchantPendingRequests: 0,
    offerRequestPendingForMerchant: 0
  };
}
