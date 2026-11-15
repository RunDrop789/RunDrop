import { getDriverFromRequest } from '../../lib/driverAuth.js';
import { supabase } from '../../lib/supabase.js';
import { FALLBACK, tierFor } from '../../lib/tiers.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const r = await getDriverFromRequest(req);
  if (r.error) return res.status(r.status).json({ error: r.error });
  if (!r.driver.is_online) return res.json({ orders: [] });

  const driverVehicle = r.driver.vehicle_type;
  // ประเภทงานทั้งหมดที่คนขับนี้อาจรับได้ (ประเภทตรง + ประเภทที่ใช้แทนได้)
  const allowed = [driverVehicle, ...Object.keys(FALLBACK).filter(k => FALLBACK[k].includes(driverVehicle))];

  const { data, error } = await supabase
    .from('orders')
    .select('id, tracking_code, pickup_place, destination, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, distance_km, price, customer_note, created_at, vehicle_type')
    .eq('status', 'NEW')
    .is('driver_id', null)
    .in('vehicle_type', allowed)
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) {
    console.error('available error:', error.message, error.code);
    return res.status(500).json({ error: 'db error' });
  }

  const orders = (data || [])
    .map(o => ({ ...o, tier: tierFor(o.vehicle_type, driverVehicle, o.created_at) }))
    .filter(o => o.tier > 0)
    .slice(0, 20)
    .map(({ vehicle_type, ...rest }) => rest);

  return res.json({ orders });
}