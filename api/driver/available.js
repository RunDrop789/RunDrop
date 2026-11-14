import { getDriverFromRequest } from '../../lib/driverAuth.js';
import { supabase } from '../../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const r = await getDriverFromRequest(req);
  if (r.error) return res.status(r.status).json({ error: r.error });
  if (!r.driver.is_online) return res.json({ orders: [] });

  const { data, error } = await supabase
    .from('orders')
    .select('id, tracking_code, pickup_place, destination, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, distance_km, price, customer_note, created_at')
    .eq('status', 'NEW')
    .is('driver_id', null)
    .eq('vehicle_type', r.driver.vehicle_type)
    .order('created_at', { ascending: true })
    .limit(20);

  if (error) return res.status(500).json({ error: 'db error' });
  return res.json({ orders: data });
}