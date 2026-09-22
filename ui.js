// ============================================================
// PAMIGO - UI Enhancements (Toast + Loader)
// ============================================================

// ============================================================
// Toast System
// ============================================================
(function initToastStyles() {
  if (document.getElementById('pamigo-toast-styles')) return;
  const style = document.createElement('style');
  style.id = 'pamigo-toast-styles';
  style.textContent = `
    .pamigo-toast-container {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 99999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
      max-width: 90%;
      width: 400px;
    }
    .pamigo-toast {
      background: #fff;
      border-radius: 14px;
      padding: 14px 18px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      font-weight: 600;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 10px;
      pointer-events: auto;
      animation: pamigoSlideIn 0.3s ease;
      border-right: 4px solid #1a2a6c;
      font-family: 'Segoe UI', Tahoma, sans-serif;
      direction: rtl;
      color: #1a1a2e;
    }
    .pamigo-toast.success { border-right-color: #10b981; }
    .pamigo-toast.error   { border-right-color: #ef4444; }
    .pamigo-toast.warning { border-right-color: #f39c12; }
    .pamigo-toast.info    { border-right-color: #1a2a6c; }
    .pamigo-toast.hide {
      animation: pamigoSlideOut 0.3s ease forwards;
    }
    @keyframes pamigoSlideIn {
      from { opacity: 0; transform: translateY(-20px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes pamigoSlideOut {
      from { opacity: 1; transform: translateY(0); }
      to   { opacity: 0; transform: translateY(-20px); }
    }
  `;
  document.head.appendChild(style);
})();

function getToastContainer() {
  let c = document.querySelector('.pamigo-toast-container');
  if (!c) {
    c = document.createElement('div');
    c.className = 'pamigo-toast-container';
    document.body.appendChild(c);
  }
  return c;
}

export function toast(message, type = 'info', duration = 3000) {
  const container = getToastContainer();
  const el = document.createElement('div');
  el.className = 'pamigo-toast ' + type;

  // أيقونة حسب النوع
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  else if (type === 'error') icon = '❌';
  else if (type === 'warning') icon = '⚠️';

  // لو الرسالة نفسها فيها إيموجي، منضيفهوش
  const hasEmoji = /^[✅❌⚠️ℹ️🚀🔒💰📧]/.test(message);

  el.innerHTML = `<span style="font-size:18px">${icon}</span><span style="flex:1">${hasEmoji ? message.substring(2).trim() : message}</span>`;

  container.appendChild(el);

  setTimeout(() => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 300);
  }, duration);

  return el;
}

// ============================================================
// Override alert → toast
// ============================================================
window.alert = function (msg) {
  if (!msg) return;
  const str = String(msg);
  let type = 'info';
  if (str.startsWith('✅')) type = 'success';
  else if (str.startsWith('❌')) type = 'error';
  else if (str.startsWith('⚠️')) type = 'warning';
  toast(str, type);
};

// ============================================================
// Loader
// ============================================================
(function initLoaderStyles() {
  if (document.getElementById('pamigo-loader-styles')) return;
  const style = document.createElement('style');
  style.id = 'pamigo-loader-styles';
  style.textContent = `
    .pamigo-loader-overlay {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(255,255,255,0.7);
      z-index: 99998;
      display: none;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(2px);
    }
    .pamigo-loader-overlay.active { display: flex; }
    .pamigo-spinner {
      width: 50px;
      height: 50px;
      border: 4px solid #eef2f7;
      border-top-color: #1a2a6c;
      border-radius: 50%;
      animation: pamigoSpin 0.8s linear infinite;
    }
    @keyframes pamigoSpin {
      to { transform: rotate(360deg); }
    }
    .pamigo-inline-spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255,255,255,0.4);
      border-top-color: #fff;
      border-radius: 50%;
      animation: pamigoSpin 0.8s linear infinite;
      margin-left: 6px;
      vertical-align: middle;
    }
  `;
  document.head.appendChild(style);
})();

export function showLoader() {
  let el = document.querySelector('.pamigo-loader-overlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'pamigo-loader-overlay';
    el.innerHTML = '<div class="pamigo-spinner"></div>';
    document.body.appendChild(el);
  }
  el.classList.add('active');
}

export function hideLoader() {
  const el = document.querySelector('.pamigo-loader-overlay');
  if (el) el.classList.remove('active');
}