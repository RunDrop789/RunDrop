const DEFAULT_LINE_LOGIN_CHANNEL_ID = '2012603605';

export async function verifyLineToken(idToken) {
  if (typeof idToken !== 'string' || !idToken.trim()) return null;

  const clientId = String(
    process.env.LINE_LOGIN_CHANNEL_ID || DEFAULT_LINE_LOGIN_CHANNEL_ID
  ).trim().split('-')[0];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const body = new URLSearchParams({
    id_token: idToken.trim(),
    client_id: clientId
  });
  try {
    const r = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal
    });
    if (!r.ok) {
      console.error('LINE ID token verification failed:', r.status);
      return null;
    }
    const payload = await r.json();
    return typeof payload.sub === 'string' ? payload.sub : null;
  } finally {
    clearTimeout(timeout);
  }
}