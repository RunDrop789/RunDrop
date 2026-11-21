import { getDriverFromRequest } from '../driverAuth.js';
import { supabase } from '../supabase.js';

export default async function handler(req, res) {
  const r = await getDriverFromRequest(req);
  if (r.error) return res.status(r.status).json({ error: r.error });

  const orderId = Number(req.method === 'GET' ? req.query.orderId : req.body?.orderId);
  if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'orderId เนเธกเนเธ–เธนเธเธ•เนเธญเธ' });

  // เธ•เธฃเธงเธเธงเนเธฒเธเธฒเธเธเธตเนเน€เธเนเธเธเธญเธเธเธเธเธฑเธเธเธเธเธตเนเธเธฃเธดเธ
  const { data: order } = await supabase
    .from('orders')
    .select('id')
    .eq('id', orderId)
    .eq('driver_id', r.driver.id)
    .maybeSingle();
  if (!order) return res.status(404).json({ error: 'เนเธกเนเธเธเธเธฒเธเธเธตเน' });

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('order_messages')
      .select('id, sender, body, created_at')
      .eq('order_id', orderId)
      .order('id', { ascending: true })
      .limit(200);
    if (error) return res.status(500).json({ error: 'db error' });
    return res.json({ messages: data || [] });
  }

  if (req.method === 'POST') {
    const body = String(req.body?.body || '').trim().slice(0, 300);
    if (!body) return res.status(400).json({ error: 'เธเนเธญเธเธงเธฒเธกเธงเนเธฒเธ' });
    const { error } = await supabase
      .from('order_messages')
      .insert([{ order_id: orderId, sender: 'driver', body }]);
    if (error) return res.status(500).json({ error: 'db error' });
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
