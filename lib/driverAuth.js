import { supabase } from './supabase.js';

export async function getDriverFromRequest(req) {
  const idToken = req.headers['x-line-id-token'];
  if (!idToken) return { error: 'missing token', status: 401 };

  const body = new URLSearchParams({
    id_token: idToken,
    client_id: process.env.LINE_LOGIN_CHANNEL_ID
  });
  const r = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!r.ok) {
  const t = await r.text();
  console.error('line verify failed:', r.status, t);
  return { error: 'invalid token', status: 401 };
}

  const { data: driver, error } = await supabase
    .from('drivers')
    .select('*')
    .eq('line_user_id', payload.sub)
    .maybeSingle();
  if (error) return { error: 'db error', status: 500 };
  if (!driver) return { error: 'not a registered driver', status: 403 };
  if (driver.status !== 'APPROVED') return { error: 'driver not approved', status: 403 };

  return { driver };
}