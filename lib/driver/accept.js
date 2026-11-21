import { getDriverFromRequest } from '../driverAuth.js';
import { supabase } from '../supabase.js';
import { tierFor } from '../tiers.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const r = await getDriverFromRequest(req);
  if (r.error) return res.status(r.status).json({ error: r.error });
  if (!r.driver.is_online) return res.status(403).json({ error: 'เธเธฃเธธเธ“เธฒเน€เธเธดเธ”เธชเธ–เธฒเธเธฐเธญเธญเธเนเธฅเธเนเธเนเธญเธ' });

  const orderId = Number(req.body?.orderId);
  if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'orderId เนเธกเนเธ–เธนเธเธ•เนเธญเธ' });

  // เธ•เธฃเธงเธเธชเธดเธ—เธเธดเนเธ•เธฒเธกเธเธฑเนเธเธเธฑเนเธ server เธเนเธญเธเธฃเธฑเธ
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
    return res.status(409).json({ error: 'เธเธฒเธเธเธตเนเธ–เธนเธเธฃเธฑเธเนเธเนเธฅเนเธง' });
  }
  if (tierFor(cur.vehicle_type, r.driver.vehicle_type, cur.created_at) === 0) {
    return res.status(403).json({ error: 'เธเธฃเธฐเน€เธ เธ—เธฃเธ–เธเธญเธเธเธธเธ“เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธฃเธฑเธเธเธฒเธเธเธตเนเนเธ”เน' });
  }

  // เธญเธฑเธเน€เธ”เธ•เนเธเธเธกเธตเน€เธเธทเนเธญเธเนเธ เธเธฑเธเธเธเธเธฑเธเธชเธญเธเธเธเธฃเธฑเธเธเธฃเนเธญเธกเธเธฑเธ
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
  if (!data) return res.status(409).json({ error: 'เธเธฒเธเธเธตเนเธ–เธนเธเธฃเธฑเธเนเธเนเธฅเนเธง' });

  return res.json({ order: data });
}
