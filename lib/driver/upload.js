import { supabase } from '../supabase.js';

const DOC_TYPES = ['id_card', 'driver_license', 'criminal_record', 'selfie'];
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 3 * 1024 * 1024;

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
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const idToken = req.headers['x-line-id-token'];
  if (!idToken) return res.status(401).json({ error: 'missing token' });

  const lineUserId = await verifyLineToken(idToken);
  if (!lineUserId) return res.status(401).json({ error: 'invalid token' });

  const { docType, mimeType, data } = req.body || {};
  if (!DOC_TYPES.includes(docType)) return res.status(400).json({ error: 'เธเธฃเธฐเน€เธ เธ—เน€เธญเธเธชเธฒเธฃเนเธกเนเธ–เธนเธเธ•เนเธญเธ' });
  const ext = MIME_EXT[mimeType];
  if (!ext) return res.status(400).json({ error: 'เธฃเธญเธเธฃเธฑเธเน€เธเธเธฒเธฐเนเธเธฅเน JPG, PNG, WEBP' });
  if (typeof data !== 'string' || !data) return res.status(400).json({ error: 'เนเธกเนเธเธเนเธเธฅเน' });

  const buffer = Buffer.from(data, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    return res.status(400).json({ error: 'เนเธเธฅเนเธ•เนเธญเธเธกเธตเธเธเธฒเธ”เนเธกเนเน€เธเธดเธ 3 MB' });
  }

  const { data: driver, error: findErr } = await supabase
    .from('drivers')
    .select('id, status')
    .eq('line_user_id', lineUserId)
    .maybeSingle();
  if (findErr) {
    console.error('upload find error:', findErr.code);
    return res.status(500).json({ error: 'db error' });
  }
  if (!driver) return res.status(403).json({ error: 'เธขเธฑเธเนเธกเนเนเธ”เนเธชเธกเธฑเธเธฃเธเธเธเธฑเธ' });

  if (driver.status === 'APPROVED') {
    return res.status(409).json({ error: 'เนเธ”เนเธฃเธฑเธเธเธฒเธฃเธญเธเธธเธกเธฑเธ•เธดเนเธฅเนเธง', code: 'APPROVED' });
  }
  if (driver.status === 'PENDING') {
    const { count, error: countErr } = await supabase
      .from('driver_documents')
      .select('id', { count: 'exact', head: true })
      .eq('driver_id', driver.id);
    if (countErr) {
  console.error('upload count error:', countErr.message, countErr.code, countErr.details);
  return res.status(500).json({ error: 'db error: ' + countErr.message });
}
    if (count >= DOC_TYPES.length) {
      return res.status(409).json({ error: 'เธญเธขเธนเนเธฃเธฐเธซเธงเนเธฒเธเธฃเธญเธ•เธฃเธงเธเธชเธญเธ เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธชเนเธเน€เธญเธเธชเธฒเธฃเธเนเธณเนเธ”เน', code: 'PENDING' });
    }
  }

  const { data: oldDocs, error: oldErr } = await supabase
    .from('driver_documents')
    .select('id, storage_path')
    .eq('driver_id', driver.id)
    .eq('doc_type', docType);
  if (oldErr) {
    console.error('upload old-doc find error:', oldErr.code);
    return res.status(500).json({ error: 'db error' });
  }

  const path = `${driver.id}/${docType}-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('driver-docs')
    .upload(path, buffer, { contentType: mimeType, upsert: false });
  if (upErr) {
    console.error('storage upload error:', upErr.message);
    return res.status(500).json({ error: 'เธญเธฑเธเนเธซเธฅเธ”เนเธเธฅเนเนเธกเนเธชเธณเน€เธฃเนเธ: ' + upErr.message });
  }

  if (oldDocs?.length) {
    await supabase.storage.from('driver-docs').remove(oldDocs.map(d => d.storage_path));
    await supabase.from('driver_documents').delete().in('id', oldDocs.map(d => d.id));
  }

  const { error: insErr } = await supabase.from('driver_documents').insert([{
    driver_id: driver.id,
    doc_type: docType,
    storage_path: path
  }]);
  if (insErr) {
    console.error('doc insert error:', insErr.code);
    return res.status(500).json({ error: 'เธเธฑเธเธ—เธถเธเธเนเธญเธกเธนเธฅเน€เธญเธเธชเธฒเธฃเนเธกเนเธชเธณเน€เธฃเนเธ: ' + insErr.message });
  }

  return res.status(200).json({ ok: true, docType });
}
