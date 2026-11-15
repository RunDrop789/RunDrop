import { getDriverFromRequest } from '../../lib/driverAuth.js';
import { supabase } from '../../lib/supabase.js';
import { tierFor } from '../../lib/tiers.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const r = await getDriverFromRequest(req);
  if (r.error) return res.status(r.status).json({ error: r.error });
  if (!r.driver.is_online) return res.status(403).json({ error: 'กรุณาเปิดสถานะออนไลน์ก่อน' });

  const orderId = Number(req.body?.orderId);
  if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'orderId ไม่ถูกต้อง' });

  // ตรวจสิทธิ์ตามชั้นฝั่ง server ก่อนรับ
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
  if (tierFor(cur.vehicle_type, r.driver.vehicle_type, cur.created_at) === 0) {
    return res.status(403).json({ error: 'ประเภทรถของคุณไม่สามารถรับงานนี้ได้' });
  }

  // อัปเดตแบบมีเงื่อนไข กันคนขับสองคนรับพร้อมกัน
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