import { supabase } from '../supabase.js';

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

  if (!name) return res.status(400).json({ error: 'เธเธฃเธธเธ“เธฒเธเธฃเธญเธเธเธทเนเธญ-เธเธฒเธกเธชเธเธธเธฅ' });
  if (!/^0\d{8,9}$/.test(phone)) return res.status(400).json({ error: 'เน€เธเธญเธฃเนเนเธ—เธฃเนเธกเนเธ–เธนเธเธ•เนเธญเธ' });
  if (idCard.length !== 13) return res.status(400).json({ error: 'เน€เธฅเธเธเธฑเธ•เธฃเธเธฃเธฐเธเธฒเธเธเธ•เนเธญเธเธกเธต 13 เธซเธฅเธฑเธ' });
  if (!VEHICLE_TYPES.includes(vehicleType)) return res.status(400).json({ error: 'เธเธฃเธฐเน€เธ เธ—เธฃเธ–เนเธกเนเธ–เธนเธเธ•เนเธญเธ' });
  if (!plateNumber) return res.status(400).json({ error: 'เธเธฃเธธเธ“เธฒเธเธฃเธญเธเธ—เธฐเน€เธเธตเธขเธเธฃเธ–' });

  const { data: existing, error: findErr } = await supabase
    .from('drivers')
    .select('id, status')
    .eq('line_user_id', lineUserId)
    .maybeSingle();
  if (findErr) {
    console.error('register find error:', findErr.code);
    return res.status(500).json({ error: 'db error' });
  }

  const fields = {
    name,
    phone,
    id_card: idCard,
    vehicle_type: vehicleType,
    plate_number: plateNumber
  };

  if (existing) {
    if (existing.status === 'PENDING') {
      return res.status(409).json({
        error: 'เนเธเธชเธกเธฑเธเธฃเธเธญเธเธเธธเธ“เธญเธขเธนเนเธฃเธฐเธซเธงเนเธฒเธเธฃเธญเธ•เธฃเธงเธเธชเธญเธ เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธชเนเธเธเนเธณเนเธ”เน',
        code: 'PENDING'
      });
    }
    if (existing.status === 'APPROVED') {
      return res.status(409).json({ error: 'เธเธฑเธเธเธตเธเธตเนเนเธ”เนเธฃเธฑเธเธเธฒเธฃเธญเธเธธเธกเธฑเธ•เธดเนเธฅเนเธง', code: 'APPROVED' });
    }
    if (existing.status === 'REJECTED') {
      const { error: updErr } = await supabase
        .from('drivers')
        .update({ ...fields, status: 'PENDING', reject_reason: null, reviewed_at: null })
        .eq('id', existing.id);
      if (updErr) {
        console.error('register update error:', updErr.code);
        return res.status(500).json({ error: 'เธเธฑเธเธ—เธถเธเนเธกเนเธชเธณเน€เธฃเนเธ' });
      }
      return res.status(200).json({ ok: true, status: 'PENDING', resubmitted: true });
    }
    return res.status(409).json({ error: 'เธชเธ–เธฒเธเธฐเธเธฑเธเธเธตเนเธกเนเธญเธเธธเธเธฒเธ•เนเธซเนเธชเธกเธฑเธเธฃเธเนเธณ', code: existing.status });
  }

  const { error } = await supabase.from('drivers').insert([{
    ...fields,
    line_user_id: lineUserId,
    status: 'PENDING'
  }]);

  if (error) {
    console.error('register insert error:', error.code);
    return res.status(500).json({ error: 'เธเธฑเธเธ—เธถเธเนเธกเนเธชเธณเน€เธฃเนเธ' });
  }

  return res.status(200).json({ ok: true, status: 'PENDING' });
}
