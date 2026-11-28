import { supabase } from '../lib/supabase.js';
import { verifyLineToken } from '../lib/lineVerify.js';

const CODE_RE = /^RD-[A-Z0-9]{6}$/;
const PHONE_RE = /^0\d{8,9}$/;
const MAX_REASON_LENGTH = 250;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const code = String(req.body?.code || '').trim();
  const phone = String(req.body?.phone || '').replace(/\s/g, '');
  const reason = String(req.body?.reason || '').trim();
  if (!CODE_RE.test(code)) return res.status(400).json({ error: 'รหัสไม่ถูกต้อง' });
  if (reason.length > MAX_REASON_LENGTH) {
    return res.status(400).json({ error: `เหตุผลต้องไม่เกิน ${MAX_REASON_LENGTH} ตัวอักษร` });
  }

  const { data: o, error: findError } = await supabase
    .from('orders')
    .select('id, phone, status, driver_id, line_user_id')
    .eq('tracking_code', code)
    .maybeSingle();
  if (findError) return res.status(500).json({ error: 'db error' });
  if (!o) return res.status(404).json({ error: 'ไม่พบงาน' });

  const phoneMatches = PHONE_RE.test(phone) && o.phone === phone;
  if (!phoneMatches) {
    const idToken = req.headers['x-line-id-token'];
    if (!idToken) return res.status(404).json({ error: 'ไม่พบงาน' });
    const lineUserId = await verifyLineToken(idToken);
    if (!lineUserId) return res.status(401).json({ error: 'LINE token ไม่ถูกต้อง' });
    if (lineUserId !== o.line_user_id) return res.status(404).json({ error: 'ไม่พบงาน' });
  }

  if (o.status === 'CANCELLED') return res.json({ ok: true, status: 'CANCELLED' });

  let status = o.status;
  let driverId = o.driver_id;
  if (status === 'NEW' && driverId === null) {
    const { data: cancelled, error } = await supabase
      .from('orders')
      .update({ status: 'CANCELLED' })
      .eq('id', o.id)
      .eq('status', 'NEW')
      .is('driver_id', null)
      .select('status')
      .maybeSingle();
    if (error) return res.status(500).json({ error: 'db error' });
    if (cancelled?.status === 'CANCELLED') return res.json({ ok: true, status: 'CANCELLED' });

    const { data: latest, error: latestError } = await supabase
      .from('orders')
      .select('status, driver_id')
      .eq('id', o.id)
      .maybeSingle();
    if (latestError) return res.status(500).json({ error: 'db error' });
    if (!latest) return res.status(404).json({ error: 'ไม่พบงาน' });
    status = latest.status;
    driverId = latest.driver_id;
  }

  if (status === 'CANCELLED') return res.json({ ok: true, status: 'CANCELLED' });
  if (status === 'PICKED_UP') {
    return res.status(409).json({ error: 'ยกเลิกไม่ได้หลังคนขับรับสินค้าแล้ว' });
  }
  if (status !== 'ACCEPTED' || driverId === null) {
    return res.status(409).json({ error: 'สถานะงานเปลี่ยนแล้ว ไม่สามารถยกเลิกได้' });
  }
  if (!reason) {
    return res.status(409).json({
      error: 'คนขับรับงานแล้ว กรุณาระบุเหตุผลในการยกเลิก',
      code: 'REASON_REQUIRED'
    });
  }

  const { error: messageError } = await supabase
    .from('order_messages')
    .insert([{ order_id: o.id, sender: 'customer', body: `เหตุผลยกเลิก: ${reason}` }]);
  if (messageError) {
    console.error('customer cancel reason insert error:', messageError.code);
    return res.status(500).json({ error: 'บันทึกเหตุผลยกเลิกไม่สำเร็จ' });
  }

  const { data: cancelled, error: cancelError } = await supabase
    .from('orders')
    .update({ status: 'CANCELLED' })
    .eq('id', o.id)
    .eq('status', 'ACCEPTED')
    .eq('driver_id', driverId)
    .select('status')
    .maybeSingle();
  if (cancelError) return res.status(500).json({ error: 'ยกเลิกงานไม่สำเร็จ' });
  if (cancelled?.status === 'CANCELLED') return res.json({ ok: true, status: 'CANCELLED' });

  const { data: latest, error: latestError } = await supabase
    .from('orders')
    .select('status')
    .eq('id', o.id)
    .maybeSingle();
  if (latestError) return res.status(500).json({ error: 'ตรวจสอบสถานะงานไม่สำเร็จ' });
  if (latest?.status === 'CANCELLED') return res.json({ ok: true, status: 'CANCELLED' });
  return res.status(409).json({
    error: latest?.status === 'PICKED_UP'
      ? 'ยกเลิกไม่ได้หลังคนขับรับสินค้าแล้ว'
      : 'สถานะงานเปลี่ยนแล้ว ไม่สามารถยกเลิกได้',
    status: latest?.status
  });
}