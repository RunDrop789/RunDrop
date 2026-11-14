import { getDriverFromRequest } from '../../lib/driverAuth.js';
import { supabase } from '../../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const r = await getDriverFromRequest(req);
  if (r.error) return res.status(r.status).json({ error: r.error });
  if (!r.driver.is_online) return res.status(403).json({ error: 'กรุณาเปิดสถานะออนไลน์ก่อน' });

  const orderId = Number(req.body?.orderId);
  if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'orderId ไม่ถูกต้อง' });

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
    .eq('vehicle_type', r.driver.vehicle_type)
    .select('id, tracking_code, customer_name, phone, pickup_place, destination, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, price')
    .maybeSingle();

  if (error) return res.status(500).json({ error: 'db error' });
  if (!data) return res.status(409).json({ error: 'งานนี้ถูกรับไปแล้ว' });

  return res.json({ order: data });
}