import { getDriverFromRequest } from '../driverAuth.js';
import { supabase } from '../supabase.js';
import { FALLBACK, tierFor } from '../tiers.js';

function haversineKm(a, b) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const r = await getDriverFromRequest(req);
  if (r.error) return res.status(r.status).json({ error: r.error });
  if (!r.driver.is_online) return res.json({ orders: [] });

  const driverVehicle = r.driver.vehicle_type;
  const allowed = [driverVehicle, ...Object.keys(FALLBACK).filter(k => FALLBACK[k].includes(driverVehicle))];
  const hasLoc = r.driver.last_lat != null && r.driver.last_lng != null;

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
    .map(o => {
      const tier = tierFor(o.vehicle_type, driverVehicle, o.created_at);
      const toPickupKm = hasLoc && o.pickup_lat != null
        ? Math.round(haversineKm(
            { lat: Number(r.driver.last_lat), lng: Number(r.driver.last_lng) },
            { lat: Number(o.pickup_lat), lng: Number(o.pickup_lng) }
          ) * 10) / 10
        : null;
      return {
        id: o.id,
        tracking_code: o.tracking_code,
        pickup_place: o.pickup_place,
        destination: o.destination,
        pickup_lat: o.pickup_lat,
        pickup_lng: o.pickup_lng,
        dropoff_lat: o.dropoff_lat,
        dropoff_lng: o.dropoff_lng,
        distance_km: o.distance_km,
        to_pickup_km: toPickupKm,
        price: o.price,
        customer_note: o.customer_note,
        created_at: o.created_at,
        vehicle_type: o.vehicle_type,
        tier
      };
    })
    .filter(o => o.tier > 0)
    .slice(0, 20);

  return res.json({ orders });
}