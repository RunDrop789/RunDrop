import { getDriverFromRequest } from '../driverAuth.js';
import { supabase } from '../supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const r = await getDriverFromRequest(req);
  if (r.error) return res.status(r.status).json({ error: r.error });

  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'เธเธดเธเธฑเธ”เนเธกเนเธ–เธนเธเธ•เนเธญเธ' });

  const { error } = await supabase
    .from('drivers')
    .update({ last_lat: lat, last_lng: lng, location_updated_at: new Date().toISOString() })
    .eq('id', r.driver.id);
  if (error) {
    console.error('location update error:', error.code);
    return res.status(500).json({ error: 'db error' });
  }
  return res.json({ ok: true });
}
