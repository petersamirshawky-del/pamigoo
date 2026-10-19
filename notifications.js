// ============================================================
// PAMIGO - Notifications Module (Final Version)
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
// فحص طلبات التاجر الجديدة (مع الفلترة الصحيحة)
// ============================================================
export async function checkMerchantNewRequests(merchantId, category) {
  // 1. طلبات العروض (عروض محددة)
  const offerReqs = await supabase
    .from("offer_requests")
    .select("id")
    .eq("merchant_id", merchantId)
    .is("offer_response", null);

  // 2. الطلبات الخاصة (بنفس لوجيك صفحة الطلبات)
  const { data: specialReqsData } = await supabase
    .from("special_requests")
    .select("id, category, request_responses(id, merchant_id)")
    .order("created_at", { ascending: false })
    .limit(30);

  const pendingOffers = (offerReqs.data || []).length;
  
  let pendingSpecial = 0;
  if (specialReqsData) {
    pendingSpecial = specialReqsData.filter((r) => {
      const isMyCategory = r.category === category;
      const hasNoReply = !r.request_responses || !r.request_responses.some(resp => resp.merchant_id === merchantId);
      
      return isMyCategory && hasNoReply;
    }).length;
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
// Realtime Subscriptions (الإشعارات الفورية)
// ============================================================
export function setupRealtimeListeners({ profile, merchant }) {
  // إلغاء أي listeners قديمة
  realtimeChannels.forEach((ch) => {
    try { supabase.removeChannel(ch); } catch {}
  });
  realtimeChannels = [];

  if (!profile) return;

  // 1. إشعارات الأدمن (الكل)
  const notifChannel = supabase
    .channel("pamigo-notifications")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications" },
      (payload) => {
        const n = payload.new;
        const target = n.target;
        const role = profile.role;
        const shouldReceive =
          target === "all" ||
          (target === "customers" && role === "customer") ||
          (target === "merchants" && role === "merchant");
        if (!shouldReceive) return;

        showBrowserNotification("📢 " + n.title, n.message, {
          tag: "admin-notif-" + n.id
        });
      }
    )
    .subscribe();
  realtimeChannels.push(notifChannel);

  // 2. للعميل: فواتير جديدة + ردود عروض
  if (profile.role === "customer") {
    const invChannel = supabase
      .channel("pamigo-customer-invoices-" + profile.id)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "invoices",
          filter: `customer_phone=eq.${profile.phone}`
        },
        (payload) => {
          const inv = payload.new;
          if (inv.confirmation_status !== "pending") return;
          showBrowserNotification(
            "🧾 عندك فاتورة جديدة!",
            `مبلغ ${parseFloat(inv.amount).toFixed(2)} ج — افتح تاب الفواتير للتأكيد`,
            {
              tag: "invoice-" + inv.id,
              onClick: () => window.switchTab && window.switchTab("invoice")
            }
          );
        }
      )
      .subscribe();
    realtimeChannels.push(invChannel);
  }

  // 3. للتاجر: طلبات عروض جديدة
  if (profile.role === "merchant" && merchant) {
    const offerReqChannel = supabase
      .channel("pamigo-merchant-offer-req-" + merchant.id)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "offer_requests",
          filter: `merchant_id=eq.${merchant.id}`
        },
        (payload) => {
          const r = payload.new;
          showBrowserNotification(
            "🔔 طلب عرض جديد!",
            `العميل طلب: ${r.product || "عرض"}`,
            {
              tag: "merchant-offer-req-" + r.id,
              onClick: () => window.switchTab && window.switchTab("offer_requests")
            }
          );
        }
      )
      .subscribe();
    realtimeChannels.push(offerReqChannel);
  }
}

// ============================================================
// تنظيف وإعادة تعيين
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
