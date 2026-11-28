import { supabase } from './supabase.js';
import { verifyLineToken } from './lineVerify.js';

export async function getDriverFromRequest(req) {
  const idToken = req.headers['x-line-id-token'];
  if (!idToken) return { error: 'missing token', status: 401 };

  const lineUserId = await verifyLineToken(idToken);
  if (!lineUserId) return { error: 'invalid token', status: 401 };

  const { data: driver, error } = await supabase
    .from('drivers')
    .select('id, name, plate_number, status, is_online, vehicle_type, last_lat, last_lng')
    .eq('line_user_id', lineUserId)
    .maybeSingle();

  if (error) {
    console.error('drivers select error:', error.code);
    return { error: 'db error', status: 500 };
  }
  if (!driver) return { error: 'not a registered driver', status: 403 };
  if (driver.status !== 'APPROVED') return { error: 'driver not approved', status: 403 };

  return { driver };
}