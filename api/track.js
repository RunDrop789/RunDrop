import { supabase } from '../lib/supabase.js';

async function handleMessages(req, res, src) {
  const code = String(src.code || '').trim();
  const phone = String(src.phone || '').replace(/\s/g, '');
  if (!/^RD-[A-Z0-9]{6}$/.test(code)) return res.status(400).json({ error: 'รหัสติดตามไม่ถูกต้อง' });

  const { data: o, error: findErr } = await supabase
    .from('orders').select('id, phone').eq('tracking_code', code).maybeSingle();
  if (findErr) return res.status(500).json({ error: 'db error' });
  if (!o || o.phone !== phone) return res.status(404).json({ error: 'ไม่พบงาน' });

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('order_messages')
      .select('id, sender, body, created_at')
      .eq('order_id', o.id)
      .order('id', { ascending: true })
      .limit(200);
    if (error) return res.status(500).json({ error: 'db error' });
    return res.json({ messages: data || [] });
  }

  const body = String(src.body || '').trim().slice(0, 300);
  if (!body) return res.status(400).json({ error: 'ข้อความว่าง' });
  const { error } = await supabase
    .from('order_messages')
    .insert([{ order_id: o.id, sender: 'customer', body }]);
  if (error) return res.status(500).json({ error: 'db error' });
  return res.json({ ok: true });
}

async function handleStatus(req, res, src) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const code = String(src.code || '').trim();
  const phone = String(src.phone || '').replace(/\s/g, '');
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

export default async function handler(req, res) {
  const src = req.method === 'GET' ? req.query : (req.body || {});
  if (req.query?.type === 'messages' || src.type === 'messages') {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
    return handleMessages(req, res, src);
  }
  return handleStatus(req, res, src);
}