import { supabase } from '../../lib/supabase.js';

async function verifyLineToken(idToken) {
  const body = new URLSearchParams({
    id_token: idToken,
    client_id: process.env.LINE_LOGIN_CHANNEL_ID
  });
  const r = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!r.ok) return null;
  const payload = await r.json();
  return payload.sub;
}

const VEHICLE_TYPES = [
  'Motorcycle', 'Sedan', 'Hatchback', 'SUV',
  'Pickup', 'Box Pickup', 'Fence Pickup', 'Box Truck'
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const idToken = req.headers['x-line-id-token'];
  if (!idToken) return res.status(401).json({ error: 'missing token' });

  const lineUserId = await verifyLineToken(idToken);
  if (!lineUserId) return res.status(401).json({ error: 'invalid token' });

  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 100);
  const phone = String(b.phone || '').replace(/\s/g, '');
  const idCard = String(b.idCard || '').replace(/\D/g, '');
  const vehicleType = String(b.vehicleType || '');
  const plateNumber = String(b.plateNumber || '').trim().slice(0, 20);

  if (!name) return res.status(400).json({ error: 'กรุณากรอกชื่อ-นามสกุล' });
  if (!/^0\d{8,9}$/.test(phone)) return res.status(400).json({ error: 'เบอร์โทรไม่ถูกต้อง' });
  if (idCard.length !== 13) return res.status(400).json({ error: 'เลขบัตรประชาชนต้องมี 13 หลัก' });
  if (!VEHICLE_TYPES.includes(vehicleType)) return res.status(400).json({ error: 'ประเภทรถไม่ถูกต้อง' });
  if (!plateNumber) return res.status(400).json({ error: 'กรุณากรอกทะเบียนรถ' });

  // ป้องกันสมัครซ้ำด้วย line_user_id
  const { data: existing, error: findErr } = await supabase
    .from('drivers')
    .select('id, status')
    .eq('line_user_id', lineUserId)
    .maybeSingle();
  if (findErr) {
    console.error('register find error:', findErr.code);
    return res.status(500).json({ error: 'db error' });
  }
  if (existing) return res.status(409).json({ error: 'บัญชีนี้สมัครไว้แล้ว', status: existing.status });

  const { error } = await supabase.from('drivers').insert([{
    name,
    phone,
    id_card: idCard,
    vehicle_type: vehicleType,
    plate_number: plateNumber,
    line_user_id: lineUserId,
    status: 'PENDING'
  }]);

  if (error) {
    console.error('register insert error:', error.code);
    return res.status(500).json({ error: 'บันทึกไม่สำเร็จ' });
  }

  return res.status(200).json({ ok: true, status: 'PENDING' });
}