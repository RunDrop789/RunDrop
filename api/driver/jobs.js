import { getDriverFromRequest } from '../../lib/driverAuth.js';
import { supabase } from '../../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const r = await getDriverFromRequest(req);
  if (r.error) return res.status(r.status).json({ error: r.error });
  const id = r.driver.id;

  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data: history, error: hErr } = await supabase
    .from('orders')
    .select('id, tracking_code, price, distance_km, pickup_place, destination, accepted_at')
    .eq('driver_id', id)
    .eq('status', 'DELIVERED')
    .gte('accepted_at', since)
    .order('accepted_at', { ascending: false })
    .limit(1000);
  if (hErr) return res.status(500).json({ error: 'db error' });

  const { data: active, error: aErr } = await supabase
    .from('orders')
    .select('id, tracking_code, customer_name, phone, price, distance_km, pickup_place, destination, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, status, customer_note')
    .eq('driver_id', id)
    .in('status', ['ACCEPTED', 'PICKED_UP'])
    .order('accepted_at', { ascending: false })
    .limit(1);
  if (aErr) return res.status(500).json({ error: 'db error' });

  return res.json({ history: history || [], active: active?.[0] || null });
}