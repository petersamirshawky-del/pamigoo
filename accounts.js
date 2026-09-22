// ============================================================
// PAMIGO - Account Page
// ============================================================
import { supabase } from './supabase.js?v=20260922';

let mapInstance = null;
let markerInstance = null;

export async function getUserWalletsBreakdown(userId) {
  const { data } = await supabase
    .from('wallets')
    .select('*, merchants(name, icon, bank_code)')
    .eq('customer_id', userId);
  return data || [];
}

export function initAccountMap(containerId, lat, lng) {
  if (typeof L === 'undefined') return null;

  if (mapInstance) { mapInstance.remove(); mapInstance = null; markerInstance = null; }

  const targetLat = lat || 31.04;
  const targetLng = lng || 31.38;

  mapInstance = L.map(containerId, { center: [targetLat, targetLng], zoom: 15 });
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: '© Esri', maxZoom: 19
  }).addTo(mapInstance);

  markerInstance = L.marker([targetLat, targetLng], { draggable: true }).addTo(mapInstance);
  mapInstance.on('click', e => markerInstance.setLatLng(e.latlng));

  setTimeout(() => mapInstance && mapInstance.invalidateSize(), 300);
  setTimeout(() => mapInstance && mapInstance.invalidateSize(), 700);

  return mapInstance;
}

export function getMarkerPosition() {
  if (!markerInstance) return null;
  const pos = markerInstance.getLatLng();
  return { lat: pos.lat, lng: pos.lng };
}

export function setMarkerPosition(lat, lng) {
  if (mapInstance && markerInstance) {
    mapInstance.setView([lat, lng], 16);
    markerInstance.setLatLng([lat, lng]);
  }
}

export async function searchAddress(query) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
  );
  const data = await res.json();
  if (!data || !data.length) throw new Error('لم يتم العثور');
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

export async function updateMyLocation(userId, lat, lng) {
  localStorage.setItem('pamigo_user_loc', JSON.stringify({ lat, lng }));
}

export async function updateMyMerchantLocation(merchantId, lat, lng) {
  const { error } = await supabase
    .from('merchants').update({ lat, lng }).eq('id', merchantId);
  if (error) throw error;
}