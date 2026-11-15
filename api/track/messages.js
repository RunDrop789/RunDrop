import { supabase } from '../../lib/supabase.js';

export default async function handler(req, res) {
  const isGet = req.method === 'GET';
  if (!isGet && req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const src = isGet ? req.query : (req.body || {});
  const code = String(src.code || '').trim();
  const phone = String(src.phone || '').replace(/\s/g, '');
  if (!/^RD-[A-Z0-9]{6}$/.test(code)) return res.status(400).json({ error: 'รหัสติดตามไม่ถูกต้อง' });

  const { data: o, error: findErr } = await supabase
    .from('orders').select('id, phone').eq('tracking_code', code).maybeSingle();
  if (findErr) return res.status(500).json({ error: 'db error' });
  if (!o || o.phone !== phone) return res.status(404).json({ error: 'ไม่พบงาน' });

  if (isGet) {
    const { data, error } = await supabase
      .from('order_messages')
      .select('id, sender, body, created_at')
      .eq('order_id', o.id)
      .order('id', { ascending: true })
      .limit(200);
    if (error) return res.status(500).json({ error: 'db error' });
    return res.json({ messages: data || [] });
  }

  const body = String(src.body || '').trim().slice(0, 300);
  if (!body) return res.status(400).json({ error: 'ข้อความว่าง' });
  const { error } = await supabase
    .from('order_messages')
    .insert([{ order_id: o.id, sender: 'customer', body }]);
  if (error) return res.status(500).json({ error: 'db error' });
  return res.json({ ok: true });
}