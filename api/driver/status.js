import { supabase } from '../../lib/supabase.js';
import { verifyLineToken } from '../../lib/lineVerify.js';

const DOC_TYPES = ['id_card', 'driver_license', 'criminal_record', 'selfie'];

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const idToken = req.headers['x-line-id-token'];
  if (!idToken) return res.status(401).json({ error: 'missing token' });
  const lineUserId = await verifyLineToken(idToken);
  if (!lineUserId) return res.status(401).json({ error: 'invalid token' });

  const { data: driver, error } = await supabase
    .from('drivers')
    .select('id, name, status, reject_reason, vehicle_type, plate_number, is_online')
    .eq('line_user_id', lineUserId)
    .maybeSingle();
  if (error) {
    console.error('status find error:', error.code);
    return res.status(500).json({ error: 'db error' });
  }
  if (!driver) return res.status(200).json({ registered: false });

  const { data: docs } = await supabase
    .from('driver_documents')
    .select('doc_type, storage_path, id')
    .eq('driver_id', driver.id)
    .order('id', { ascending: false });

  const latest = {};
  for (const d of docs || []) if (!latest[d.doc_type]) latest[d.doc_type] = d;

  let selfieUrl = null;
  if (latest.selfie) {
    const { data: s } = await supabase.storage
      .from('driver-docs')
      .createSignedUrl(latest.selfie.storage_path, 600);
    selfieUrl = s?.signedUrl ?? null;
  }

  return res.status(200).json({
    registered: true,
    name: driver.name,
    status: driver.status,
    rejectReason: driver.reject_reason,
    vehicleType: driver.vehicle_type,
    plateNumber: driver.plate_number,
    isOnline: driver.is_online,
    docs: DOC_TYPES.map(t => ({ type: t, uploaded: !!latest[t] })),
    docCount: Object.keys(latest).length,
    selfieUrl
  });
}