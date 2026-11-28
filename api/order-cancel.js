import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const code = String(req.body?.code || '').trim();
  const phone = String(req.body?.phone || '').replace(/\s/g, '');
  if (!/^RD-[A-Z0-9]{6}$/.test(code)) return res.status(400).json({ error: 'รหัสไม่ถูกต้อง' });

  const { data: o } = await supabase
    .from('orders').select('id, phone, status, driver_id').eq('tracking_code', code).maybeSingle();
  if (!o || o.phone !== phone) return res.status(404).json({ error: 'ไม่พบงาน' });
  if (o.status !== 'NEW' || o.driver_id !== null) return res.json({ ok: true, status: o.status });

  const { data: cancelled, error } = await supabase
    .from('orders').update({ status: 'CANCELLED' })
    .eq('id', o.id).eq('status', 'NEW').is('driver_id', null)
    .select('status').maybeSingle();
  if (error) return res.status(500).json({ error: 'db error' });
  if (cancelled?.status === 'CANCELLED') return res.json({ ok: true, status: 'CANCELLED' });

  const { data: latest, error: latestError } = await supabase
    .from('orders').select('status').eq('id', o.id).maybeSingle();
  if (latestError) return res.status(500).json({ error: 'db error' });
  return res.json({ ok: true, status: latest?.status || 'CANCELLED' });
}