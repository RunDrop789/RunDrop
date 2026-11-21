import { getDriverFromRequest } from '../driverAuth.js';
import { supabase } from '../supabase.js';

const NEXT_OF = { ACCEPTED: 'PICKED_UP', PICKED_UP: 'DELIVERED' };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const r = await getDriverFromRequest(req);
  if (r.error) return res.status(r.status).json({ error: r.error });

  const orderId = Number(req.body?.orderId);
  const next = req.body?.next;
  if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'orderId เนเธกเนเธ–เธนเธเธ•เนเธญเธ' });

  const { data: cur, error: findErr } = await supabase
    .from('orders')
    .select('id, status')
    .eq('id', orderId)
    .eq('driver_id', r.driver.id)
    .maybeSingle();
  if (findErr) return res.status(500).json({ error: 'db error' });
  if (!cur) return res.status(404).json({ error: 'เนเธกเนเธเธเธเธฒเธเธเธตเน' });
  if (NEXT_OF[cur.status] !== next) return res.status(409).json({ error: 'เธชเธ–เธฒเธเธฐเนเธกเนเธ–เธนเธเธ•เนเธญเธ' });

  const { error } = await supabase
    .from('orders')
    .update({ status: next })
    .eq('id', orderId)
    .eq('status', cur.status);
  if (error) return res.status(500).json({ error: 'db error' });

  return res.json({ ok: true, status: next });
}
