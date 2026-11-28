import { createClient } from '@supabase/supabase-js';
import { verifyLineToken } from '../lib/lineVerify.js';
import { notifyNewJob } from '../lib/lineJobNotifications.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    auth: {
      persistSession: false
    }
  }
);

const PEAK_RATE = 0.15;
const MAX_CUSTOMER_PHOTO_BYTES = 2 * 1024 * 1024;

const PEAK_RANGES = [
  { start: 7 * 60, end: 9 * 60 },
  { start: 17 * 60, end: 20 * 60 }
];

function thaiMinutes() {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function surchargeRate() {
  const m = thaiMinutes();

  return PEAK_RANGES.some(
    r => m >= r.start && m < r.end
  )
    ? PEAK_RATE
    : 0;
}

function haversineKm(a, b) {
  const R = 6371;

  const toRad = d => d * Math.PI / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

async function routeKm(from, to) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;

  const res = await fetch(url);
  const data = await res.json();

  if (
    !res.ok ||
    data.code !== 'Ok' ||
    !data.routes?.length
  ) {
    throw new Error('OSRM failed');
  }

  return data.routes[0].distance / 1000;
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  let code = 'RD-';

  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

function normalizeVehicleType(vehicleType) {
  const map = {
    motorcycle: 'Motorcycle',
    sedan: 'Sedan',
    hatchback: 'Hatchback',
    suv: 'SUV',
    pickup: 'Pickup',

    boxpickup: 'Box Pickup',
    box_pickup: 'Box Pickup',
    'box pickup': 'Box Pickup',

    fencepickup: 'Fence Pickup',
    fence_pickup: 'Fence Pickup',
    'fence pickup': 'Fence Pickup',

    boxtruck: 'Box Truck',
    box_truck: 'Box Truck',
    'box truck': 'Box Truck'
  };

  const key = String(vehicleType || '')
    .trim()
    .toLowerCase();

  return map[key] || String(vehicleType || '').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'method not allowed'
    });
  }

  try {
    const b = req.body || {};

    const idToken = req.headers['x-line-id-token'];
    if (!idToken) {
      return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ LINE ก่อนเรียกรถ' });
    }
    const lineUserId = await verifyLineToken(idToken);
    if (!lineUserId) {
      return res.status(401).json({ error: 'LINE token ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่' });
    }

    const name = String(b.name || '')
      .trim()
      .slice(0, 100);

    const phone = String(b.phone || '')
      .replace(/\s/g, '');
 
    const rawVehicleType = String(
      b.vehicleType || ''
    );

    const vehicleType =
      normalizeVehicleType(rawVehicleType);

    const remark = String(b.remark || '')
      .trim()
      .slice(0, 300);

    const pickupText = String(
      b.pickupText || ''
    ).slice(0, 300);

    const dropoffText = String(
      b.dropoffText || ''
    ).slice(0, 300);

    const pickup = b.pickup;
    const dropoff = b.dropoff;

    if (
      !name ||
      !/^0\d{8,9}$/.test(phone)
    ) {
      return res.status(400).json({
        error: 'ชื่อหรือเบอร์ไม่ถูกต้อง'
      });
    }

    if (
      !pickup ||
      !dropoff ||
      typeof pickup.lat !== 'number' ||
      typeof pickup.lng !== 'number' ||
      typeof dropoff.lat !== 'number' ||
      typeof dropoff.lng !== 'number'
    ) {
      return res.status(400).json({
        error: 'ต้องระบุจุดรับและจุดส่ง'
      });
    }

    console.log('RAW VEHICLE:', rawVehicleType);
    console.log('NORMALIZED VEHICLE:', vehicleType);

    const {
      data: rate,
      error: rateErr
    } = await supabase
      .from('vehicle_rates')
      .select('*')
      .eq('vehicle_type', vehicleType)
      .eq('active', true)
      .single();

    if (rateErr) {
      console.error('RATE ERROR', rateErr);

      return res.status(500).json({
        error: 'โหลดข้อมูล rate รถไม่สำเร็จ',
        code: rateErr.code,
        message: rateErr.message,
        details: rateErr.details,
        hint: rateErr.hint,
        rawVehicleType,
        vehicleType
      });
    }

    let km;

    try {
      km = await routeKm(pickup, dropoff);
    } catch (err) {
      console.error(err);

      km = Math.max(
        1,
        haversineKm(pickup, dropoff) * 1.3
      );
    }

    km = Math.round(km * 10) / 10;

    let subtotal =
      Number(rate.base_fare || 0) +
      km * Number(rate.price_per_km || 0);

    if (
      subtotal <
      Number(rate.minimum_price || 0)
    ) {
      subtotal = Number(rate.minimum_price);
    }

    const price = Math.round(
      subtotal * (1 + surchargeRate())
    );

    const trackingCode = genCode();
    let customerPhotoPath = null;

    if (b.customerPhoto != null) {
      const photoData = b.customerPhoto?.data;
      if (
        b.customerPhoto?.mimeType !== 'image/jpeg' ||
        typeof photoData !== 'string' ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(photoData)
      ) {
        return res.status(400).json({ error: 'รูปสินค้าไม่ถูกต้อง' });
      }

      const photoBuffer = Buffer.from(photoData, 'base64');
      if (
        !photoBuffer.length ||
        photoBuffer.length > MAX_CUSTOMER_PHOTO_BYTES ||
        photoBuffer[0] !== 0xff ||
        photoBuffer[1] !== 0xd8 ||
        photoBuffer[2] !== 0xff
      ) {
        return res.status(400).json({ error: 'รูปสินค้าต้องเป็น JPEG ขนาดไม่เกิน 2 MB' });
      }

      customerPhotoPath = `customer/${trackingCode}-${Date.now()}.jpg`;
      const { error: photoError } = await supabase.storage
        .from('order-photos')
        .upload(customerPhotoPath, photoBuffer, { contentType: 'image/jpeg', upsert: false });
      if (photoError) {
        console.error('customer photo upload error:', photoError.message);
        return res.status(500).json({ error: 'อัปโหลดรูปสินค้าไม่สำเร็จ' });
      }
    }

    const { data: createdOrder, error } = await supabase
      .from('orders')
      .insert([
        {
          customer_name: name,
          phone,
          line_user_id: lineUserId,
          vehicle_type: vehicleType,
          pickup_place:
            pickupText ||
            `พิกัด: ${pickup.lat.toFixed(6)}, ${pickup.lng.toFixed(6)}`,
          destination:
            dropoffText ||
            `พิกัด: ${dropoff.lat.toFixed(6)}, ${dropoff.lng.toFixed(6)}`,
          distance_km: km,
          price,
          status: 'NEW',
          tracking_code: trackingCode,
          customer_note: remark,
          pickup_lat: pickup.lat,
          pickup_lng: pickup.lng,
          dropoff_lat: dropoff.lat,
          dropoff_lng: dropoff.lng,
          ...(customerPhotoPath ? { customer_photo_path: customerPhotoPath } : {})
        }
      ])
      .select('id, created_at')
      .single();

    if (error) {
      if (customerPhotoPath) {
        const { error: removeError } = await supabase.storage
          .from('order-photos')
          .remove([customerPhotoPath]);
        if (removeError) console.error('customer photo cleanup error:', removeError.message);
      }
      return res.status(500).json({
        error: 'บันทึกไม่สำเร็จ',
        detail: error.message
      });
    }

    try {
      const notification = await notifyNewJob({
        id: createdOrder.id,
        pickupText: pickupText || `พิกัด: ${pickup.lat.toFixed(6)}, ${pickup.lng.toFixed(6)}`,
        dropoffText: dropoffText || `พิกัด: ${dropoff.lat.toFixed(6)}, ${dropoff.lng.toFixed(6)}`,
        vehicleType,
        price,
        customerPhotoPath
      });
      if (notification.sent) console.info(`LINE new-job alert sent to ${notification.sent} drivers`);
    } catch (notificationError) {
      console.error('LINE new-job notification failed:', notificationError.message);
    }

    return res.status(200).json({
      success: true,
      trackingCode,
      price,
      distanceKm: km,
      vehicleType
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: 'SERVER_ERROR',
      detail: err.message
    });
  }
}