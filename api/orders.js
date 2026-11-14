import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } }
);

const PEAK_RATE = 0.15;
const PEAK_RANGES = [
  { start: 7 * 60, end: 9 * 60 },
  { start: 17 * 60, end: 20 * 60 }
];

// เวลาไทย (UTC+7) ไม่ขึ้นกับเวลาเครื่องลูกค้า
function thaiMinutes() {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function surchargeRate() {
  const m = thaiMinutes();
  return PEAK_RANGES.some(r => m >= r.start && m < r.end) ? PEAK_RATE : 0;
}

function haversineKm(a, b) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function routeKm(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || data.code !== 'Ok' || !data.routes?.length) throw new Error('OSRM failed');
  return data.routes[0].distance / 1000;
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = 'RD-';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 100);
  const phone = String(b.phone || '').replace(/\s/g, '');
  const vehicleType = String(b.vehicleType || '');
  const remark = String(b.remark || '').trim().slice(0, 300);
  const pickupText = String(b.pickupText || '').slice(0, 300);
  const dropoffText = String(b.dropoffText || '').slice(0, 300);
  const pickup = b.pickup;
  const dropoff = b.dropoff;

  if (!name || !/^0\d{8,9}$/.test(phone)) return res.status(400).json({ error: 'ชื่อหรือเบอร์ไม่ถูกต้อง' });
  if (!pickup || !dropoff || typeof pickup.lat !== 'number' || typeof dropoff.lat !== 'number') {
    return res.status(400).json({ error: 'ต้องระบุจุดรับและจุดส่ง' });
  }

  // ดึงเรทจาก DB ฝั่ง server
  const { data: rate, error: rateErr } = await supabase
    .from('vehicle_rates').select('*')
    .eq('vehicle_type', vehicleType).eq('active', true).maybeSingle();
  if (rateErr || !rate) return res.status(400).json({ error: 'ประเภทรถไม่ถูกต้อง' });

  // คำนวณระยะทางใหม่ฝั่ง server
  let km;
  try {
    km = await routeKm(pickup, dropoff);
  } catch {
    km = Math.max(1, haversineKm(pickup, dropoff) * 1.3);
  }
  km = Math.round(km * 10) / 10;

  // คำนวณราคาใหม่ฝั่ง server
  let subtotal = Number(rate.base_fare || 0) + km * Number(rate.price_per_km || 0);
  if (subtotal < Number(rate.minimum_price || 0)) subtotal = Number(rate.minimum_price || 0);
  const price = Math.round(subtotal * (1 + surchargeRate()));

  const trackingCode = genCode();

  const { error } = await supabase.from('orders').insert([{
    customer_name: name,
    phone,
    vehicle_type: vehicleType,
    pickup_place: pickupText || `พิกัด ${pickup.lat.toFixed(6)}, ${pickup.lng.toFixed(6)}`,
    destination: dropoffText || `พิกัด ${dropoff.lat.toFixed(6)}, ${dropoff.lng.toFixed(6)}`,
    distance_km: km,
    price,
    status: 'NEW',
    tracking_code: trackingCode,
    customer_note: remark,
    pickup_lat: pickup.lat,
    pickup_lng: pickup.lng,
    dropoff_lat: dropoff.lat,
    dropoff_lng: dropoff.lng
  }]);

  if (error) {
    console.error('orders insert error:', error.message);
    return res.status(500).json({ error: 'บันทึกไม่สำเร็จ' });
  }

  return res.status(200).json({ trackingCode, price, distanceKm: km });
}