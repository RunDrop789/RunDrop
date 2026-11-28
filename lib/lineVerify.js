export async function verifyLineToken(idToken) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const body = new URLSearchParams({
    id_token: idToken,
    client_id: process.env.LINE_LOGIN_CHANNEL_ID
  });
  try {
    const r = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal
    });
    if (!r.ok) return null;
    const payload = await r.json();
    return payload.sub;
  } finally {
    clearTimeout(timeout);
  }
}