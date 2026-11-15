import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const code = String(req.query.code || '').trim();
  const phone = String(req.query.phone || '').replace(/\s/g, '');
  if (!/^RD-[A-Z0-9]{6}$/.test(code)) return res.status(400).json({ error: 'รหัสติดตามไม่ถูกต้อง' });

  const { data: o, error } = await supabase
    .from('orders')
    .select('id, tracking_code, status, price, phone, pickup_place, destination, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, driver_id')
    .eq('tracking_code', code)
    .maybeSingle();
  if (error) {
    console.error('track find error:', error.code);
    return res.status(500).json({ error: 'db error' });
  }
  if (!o || o.phone !== phone) return res.status(404).json({ error: 'ไม่พบงาน หรือเบอร์ไม่ตรง' });

  let driver = null;
  if (o.driver_id) {
    const { data: d } = await supabase
      .from('drivers')
      .select('name, vehicle_type, plate_number, last_lat, last_lng, location_updated_at')
      .eq('id', o.driver_id)
      .maybeSingle();
    // แสดงพิกัดคนขับเฉพาะตอนงานกำลังดำเนินการ
    const live = ['ACCEPTED', 'PICKED_UP'].includes(o.status);
    if (d) {
      driver = {
        name: d.name,
        vehicle: d.vehicle_type,
        plate: d.plate_number,
        lat: live ? d.last_lat : null,
        lng: live ? d.last_lng : null,
        updatedAt: live ? d.location_updated_at : null
      };
    }
  }

  return res.json({
    order: {
      trackingCode: o.tracking_code,
      status: o.status,
      price: o.price,
      pickup: { place: o.pickup_place, lat: o.pickup_lat, lng: o.pickup_lng },
      dropoff: { place: o.destination, lat: o.dropoff_lat, lng: o.dropoff_lng }
    },
    driver
  });
}