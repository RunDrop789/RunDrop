import { getDriverFromRequest } from '../driverAuth.js';
import { supabase } from '../supabase.js';

const MAX_REASON_LENGTH = 250;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const r = await getDriverFromRequest(req);
  if (r.error) return res.status(r.status).json({ error: r.error });

  const orderId = Number(req.body?.orderId);
  const reason = String(req.body?.reason || '').trim();
  if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'orderId ไม่ถูกต้อง' });
  if (!reason) return res.status(400).json({ error: 'กรุณาระบุเหตุผลในการยกเลิก' });
  if (reason.length > MAX_REASON_LENGTH) {
    return res.status(400).json({ error: `เหตุผลต้องไม่เกิน ${MAX_REASON_LENGTH} ตัวอักษร` });
  }

  const { data: order, error: findError } = await supabase
    .from('orders')
    .select('id, status, driver_id')
    .eq('id', orderId)
    .eq('driver_id', r.driver.id)
    .maybeSingle();
  if (findError) {
    console.error('driver cancel find error:', findError.code);
    return res.status(500).json({ error: 'db error' });
  }
  if (!order) return res.status(404).json({ error: 'ไม่พบงานนี้' });
  if (order.status !== 'ACCEPTED') {
    return res.status(409).json({ error: 'ยกเลิกได้ก่อนรับสินค้าเท่านั้น' });
  }

  const { error: messageError } = await supabase
    .from('order_messages')
    .insert([{ order_id: orderId, sender: 'driver', body: `เหตุผลยกเลิก: ${reason}` }]);
  if (messageError) {
    console.error('driver cancel reason insert error:', messageError.code);
    return res.status(500).json({ error: 'บันทึกเหตุผลยกเลิกไม่สำเร็จ' });
  }

  const { data: cancelled, error: cancelError } = await supabase
    .from('orders')
    .update({ status: 'CANCELLED' })
    .eq('id', orderId)
    .eq('driver_id', r.driver.id)
    .eq('status', 'ACCEPTED')
    .select('status')
    .maybeSingle();
  if (cancelError) {
    console.error('driver cancel update error:', cancelError.code);
    return res.status(500).json({ error: 'ยกเลิกงานไม่สำเร็จ' });
  }
  if (cancelled?.status === 'CANCELLED') return res.json({ ok: true, status: 'CANCELLED' });

  const { data: latest, error: latestError } = await supabase
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .maybeSingle();
  if (latestError) return res.status(500).json({ error: 'ตรวจสอบสถานะงานไม่สำเร็จ' });
  return res.status(409).json({
    error: latest?.status === 'PICKED_UP' ? 'ยกเลิกไม่ได้หลังรับสินค้าแล้ว' : 'สถานะงานเปลี่ยนแล้ว',
    status: latest?.status
  });
}
