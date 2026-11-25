import { getDriverFromRequest } from '../driverAuth.js';
import { supabase } from '../supabase.js';

const MAX_BYTES = 3 * 1024 * 1024;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const r = await getDriverFromRequest(req);
  if (r.error) return res.status(r.status).json({ error: r.error });

  const orderId = Number(req.body?.orderId);
  const photoType = req.body?.photoType;
  const mimeType = req.body?.mimeType;
  const data = req.body?.data;
  if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'orderId ไม่ถูกต้อง' });
  if (!['PICKUP', 'DROPOFF'].includes(photoType)) return res.status(400).json({ error: 'photoType ไม่ถูกต้อง' });
  if (mimeType !== 'image/jpeg') return res.status(400).json({ error: 'รองรับเฉพาะรูปจากกล้อง (JPEG)' });
  if (typeof data !== 'string' || !data) return res.status(400).json({ error: 'ไม่มีข้อมูลรูป' });

  const buf = Buffer.from(data, 'base64');
  if (buf.length > MAX_BYTES) return res.status(413).json({ error: 'รูปใหญ่เกินไป' });

  // ตรวจว่างานเป็นของคนขับและอยู่ในสถานะที่ถ่ายได้
  const { data: o, error: findErr } = await supabase
    .from('orders').select('id, status, driver_id')
    .eq('id', orderId).eq('driver_id', r.driver.id).maybeSingle();
  if (findErr) return res.status(500).json({ error: 'db error' });
  if (!o) return res.status(404).json({ error: 'ไม่พบงานนี้' });
  const expected = photoType === 'PICKUP' ? 'ACCEPTED' : 'PICKED_UP';
  if (o.status !== expected) return res.status(409).json({ error: 'สถานะงานไม่ถูกต้องสำหรับรูปนี้' });

  const path = `${orderId}/${photoType}-${Date.now()}.jpg`;
  const { error: upErr } = await supabase.storage
    .from('order-photos').upload(path, buf, { contentType: 'image/jpeg', upsert: false });
  if (upErr) {
    console.error('photo upload error:', upErr.message);
    return res.status(500).json({ error: 'อัปโหลดรูปไม่สำเร็จ' });
  }

  const { error: insErr } = await supabase.from('order_photos').insert([{
    order_id: orderId, driver_id: r.driver.id, photo_type: photoType, storage_path: path
  }]);
  if (insErr) return res.status(500).json({ error: 'db error' });

  return res.json({ ok: true });
}