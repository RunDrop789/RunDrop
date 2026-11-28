import { getDriverFromRequest } from '../driverAuth.js';
import { supabase } from '../supabase.js';
import { tierFor } from '../tiers.js';

const MAX_ACTIVE = 2;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const r = await getDriverFromRequest(req);
  if (r.error) return res.status(r.status).json({ error: r.error });
  if (!r.driver.is_online) return res.status(403).json({ error: 'กรุณาเปิดพร้อมรับงานก่อน' });

  const orderId = Number(req.body?.orderId);
  if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'orderId ไม่ถูกต้อง' });

  // นับงานที่กำลังทำอยู่ (ACCEPTED / PICKED_UP) ห้ามเกิน MAX_ACTIVE
  const { count, error: cErr } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('driver_id', r.driver.id)
    .in('status', ['ACCEPTED', 'PICKED_UP']);
  if (cErr) return res.status(500).json({ error: 'db error' });
  if ((count || 0) >= MAX_ACTIVE) {
    return res.status(409).json({ error: `รับได้สูงสุด ${MAX_ACTIVE} งานพร้อมกัน` });
  }

  const { data: cur, error: findErr } = await supabase
    .from('orders')
    .select('id, vehicle_type, created_at, status, driver_id')
    .eq('id', orderId)
    .maybeSingle();
  if (findErr) {
    console.error('accept find error:', findErr.message, findErr.code);
    return res.status(500).json({ error: 'db error' });
  }
  if (!cur || cur.status !== 'NEW' || cur.driver_id !== null) {
    return res.status(409).json({ error: 'งานนี้ถูกรับไปแล้ว' });
  }
  if (tierFor(cur.vehicle_type, r.driver.vehicle_type) === 0) {
    return res.status(403).json({ error: 'ประเภทรถของคุณไม่สามารถรับงานนี้ได้' });
  }

  const { data, error } = await supabase
    .from('orders')
    .update({
      status: 'ACCEPTED',
      driver_id: r.driver.id,
      accepted_at: new Date().toISOString()
    })
    .eq('id', orderId)
    .eq('status', 'NEW')
    .is('driver_id', null)
    .select('id, tracking_code, customer_name, phone, pickup_place, destination, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, price')
    .maybeSingle();
  if (error) {
    console.error('accept update error:', error.message, error.code);
    return res.status(500).json({ error: 'db error' });
  }
  if (!data) return res.status(409).json({ error: 'งานนี้ถูกรับไปแล้ว' });

  return res.json({ order: data });
}