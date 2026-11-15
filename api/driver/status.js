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

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const idToken = req.headers['x-line-id-token'];
  if (!idToken) return res.status(401).json({ error: 'missing token' });

  const lineUserId = await verifyLineToken(idToken);
  if (!lineUserId) return res.status(401).json({ error: 'invalid token' });

  const { data: driver, error } = await supabase
    .from('drivers')
    .select('id, name, status, reject_reason')
    .eq('line_user_id', lineUserId)
    .maybeSingle();
  if (error) {
    console.error('status find error:', error.message);
    return res.status(500).json({ error: 'db error' });
  }

  if (!driver) return res.status(200).json({ registered: false });

  let docCount = 0;
  const { data: docs } = await supabase
    .from('driver_documents')
    .select('id')
    .eq('driver_id', driver.id);
  docCount = docs?.length ?? 0;

  return res.status(200).json({
    registered: true,
    name: driver.name,
    status: driver.status,
    rejectReason: driver.reject_reason,
    docCount
  });
}