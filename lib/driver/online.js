import { getDriverFromRequest } from '../driverAuth.js';
import { supabase } from '../supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const r = await getDriverFromRequest(req);
  if (r.error) return res.status(r.status).json({ error: r.error });

  const isOnline = req.body?.isOnline === true;
  const { error } = await supabase
    .from('drivers')
    .update({ is_online: isOnline })
    .eq('id', r.driver.id);
  if (error) return res.status(500).json({ error: 'db error' });

  return res.json({ ok: true, isOnline });
}
