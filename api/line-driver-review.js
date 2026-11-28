import { createHmac, timingSafeEqual } from 'node:crypto';
import { supabase } from '../lib/supabase.js';

const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const REQUIRED_DOC_TYPES = ['id_card', 'driver_license', 'criminal_record', 'selfie'];
const MAX_REASON_LENGTH = 250;
const REJECTION_SESSION_MS = 15 * 60 * 1000;

export const config = {
  api: { bodyParser: false }
};

async function getRawBody(req) {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (typeof req.rawBody === 'string') return Buffer.from(req.rawBody);

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function hasValidSignature(rawBody, signature, channelSecret) {
  if (typeof signature !== 'string' || !signature) return false;
  const expected = createHmac('sha256', channelSecret).update(rawBody).digest();
  let actual;
  try {
    actual = Buffer.from(signature, 'base64');
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function reply(replyToken, text) {
  if (!replyToken) return;
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured');

  const response = await fetch(LINE_REPLY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }]
    })
  });
  if (!response.ok) throw new Error(`LINE reply failed (${response.status})`);
}

async function updateLineFollower(event) {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return;

  const { error } = await supabase
    .from('line_followers')
    .upsert({
      line_user_id: lineUserId,
      is_following: event.type === 'follow',
      updated_at: new Date().toISOString()
    }, { onConflict: 'line_user_id' });
  if (error) throw new Error(`Could not update LINE follower state (${error.code || 'database error'})`);
}

async function getPendingDriver(driverId) {
  const { data: driver, error } = await supabase
    .from('drivers')
    .select('id, name, status')
    .eq('id', driverId)
    .maybeSingle();
  if (error) throw new Error(`Could not load driver review (${error.code || 'database error'})`);
  if (!driver) return { error: 'ไม่พบใบสมัครนี้' };
  if (driver.status !== 'PENDING') return { driver, error: 'ใบสมัครนี้ได้รับการตรวจสอบไปแล้ว' };

  const { data: documents, error: documentsError } = await supabase
    .from('driver_documents')
    .select('doc_type')
    .eq('driver_id', driverId);
  if (documentsError) throw new Error(`Could not check driver documents (${documentsError.code || 'database error'})`);
  const submittedTypes = new Set((documents || []).map(document => document.doc_type));
  if (!REQUIRED_DOC_TYPES.every(type => submittedTypes.has(type))) {
    return { driver, error: 'เอกสารยังไม่ครบ ไม่สามารถตรวจสอบใบสมัครได้' };
  }

  return { driver };
}

async function handleApproval(event, adminUserId, driverId) {
  const { driver, error } = await getPendingDriver(driverId);
  if (error) return reply(event.replyToken, error);

  const { data: updated, error: updateError } = await supabase
    .from('drivers')
    .update({ status: 'APPROVED', reviewed_at: new Date().toISOString(), reject_reason: null })
    .eq('id', driverId)
    .eq('status', 'PENDING')
    .select('id')
    .maybeSingle();
  if (updateError) throw new Error(`Could not approve driver (${updateError.code || 'database error'})`);
  if (!updated) return reply(event.replyToken, 'สถานะใบสมัครเปลี่ยนไปแล้ว กรุณาตรวจสอบใหม่');

  const { error: sessionDeleteError } = await supabase
    .from('driver_review_sessions')
    .delete()
    .eq('admin_line_user_id', adminUserId);
  if (sessionDeleteError) {
    throw new Error(`Could not clear approval session (${sessionDeleteError.code || 'database error'})`);
  }
  return reply(event.replyToken, `อนุมัติใบสมัครของ ${driver.name} แล้ว`);
}

async function handleRejectionStart(event, adminUserId, driverId) {
  const { driver, error } = await getPendingDriver(driverId);
  if (error) return reply(event.replyToken, error);

  const { error: sessionError } = await supabase
    .from('driver_review_sessions')
    .upsert({
      admin_line_user_id: adminUserId,
      driver_id: String(driverId),
      expires_at: new Date(Date.now() + REJECTION_SESSION_MS).toISOString()
    }, { onConflict: 'admin_line_user_id' });
  if (sessionError) throw new Error(`Could not start rejection review (${sessionError.code || 'database error'})`);

  return reply(event.replyToken, `พิมพ์เหตุผล Reject สำหรับใบสมัครของ ${driver.name} ภายใน 15 นาที (ไม่เกิน ${MAX_REASON_LENGTH} ตัวอักษร) หรือพิมพ์ ยกเลิก`);
}

async function handlePostback(event, adminUserId) {
  const params = new URLSearchParams(event.postback?.data || '');
  const driverId = Number(params.get('driverId'));
  if (!Number.isSafeInteger(driverId) || driverId <= 0) {
    return reply(event.replyToken, 'รหัสใบสมัครไม่ถูกต้อง');
  }

  const action = params.get('action');
  if (action === 'approve') return handleApproval(event, adminUserId, driverId);
  if (action === 'reject') return handleRejectionStart(event, adminUserId, driverId);
}

async function handleRejectionReason(event, adminUserId) {
  const { data: session, error: sessionError } = await supabase
    .from('driver_review_sessions')
    .select('driver_id, expires_at')
    .eq('admin_line_user_id', adminUserId)
    .maybeSingle();
  if (sessionError) throw new Error(`Could not load rejection session (${sessionError.code || 'database error'})`);
  if (!session) return;

  const text = String(event.message?.text || '').trim();
  if (/^(ยกเลิก|cancel)$/i.test(text)) {
    const { error } = await supabase
      .from('driver_review_sessions')
      .delete()
      .eq('admin_line_user_id', adminUserId);
    if (error) throw new Error(`Could not cancel rejection (${error.code || 'database error'})`);
    return reply(event.replyToken, 'ยกเลิกการ Reject แล้ว');
  }

  if (Date.parse(session.expires_at) <= Date.now()) {
    const { error } = await supabase
      .from('driver_review_sessions')
      .delete()
      .eq('admin_line_user_id', adminUserId);
    if (error) throw new Error(`Could not clear expired rejection (${error.code || 'database error'})`);
    return reply(event.replyToken, 'หมดเวลาระบุเหตุผลแล้ว กรุณากด Reject ที่ใบสมัครอีกครั้ง');
  }
  if (!text || text.length > MAX_REASON_LENGTH) {
    return reply(event.replyToken, `กรุณาพิมพ์เหตุผล 1-${MAX_REASON_LENGTH} ตัวอักษร`);
  }

  const driverId = Number(session.driver_id);
  const { data: updated, error: updateError } = await supabase
    .from('drivers')
    .update({ status: 'REJECTED', reject_reason: text, reviewed_at: new Date().toISOString() })
    .eq('id', driverId)
    .eq('status', 'PENDING')
    .select('id')
    .maybeSingle();
  if (updateError) throw new Error(`Could not reject driver (${updateError.code || 'database error'})`);

  const { error: deleteError } = await supabase
    .from('driver_review_sessions')
    .delete()
    .eq('admin_line_user_id', adminUserId);
  if (deleteError) throw new Error(`Could not clear rejection session (${deleteError.code || 'database error'})`);

  return reply(
    event.replyToken,
    updated ? 'ปฏิเสธใบสมัครและบันทึกเหตุผลแล้ว' : 'สถานะใบสมัครเปลี่ยนไปแล้ว จึงไม่ได้ Reject'
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const adminUserId = process.env.DRIVER_ADMIN_LINE_USER_ID;
  if (!channelSecret) {
    console.error('LINE driver review webhook is missing required environment configuration');
    return res.status(500).json({ error: 'webhook configuration missing' });
  }

  let payload;
  try {
    const rawBody = await getRawBody(req);
    if (!hasValidSignature(rawBody, req.headers['x-line-signature'], channelSecret)) {
      return res.status(401).json({ error: 'invalid signature' });
    }
    payload = JSON.parse(rawBody.toString('utf8'));
    if (!payload || !Array.isArray(payload.events)) {
      return res.status(400).json({ error: 'invalid event payload' });
    }
  } catch (error) {
    console.error('LINE driver review webhook request invalid:', error.message);
    return res.status(400).json({ error: 'invalid request' });
  }

  try {
    for (const event of payload.events || []) {
      if (event.type === 'follow' || event.type === 'unfollow') {
        await updateLineFollower(event);
        continue;
      }
      if (!adminUserId || event.source?.userId !== adminUserId) continue;
      if (event.type === 'postback') {
        await handlePostback(event, adminUserId);
      } else if (event.type === 'message' && event.message?.type === 'text') {
        await handleRejectionReason(event, adminUserId);
      }
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('LINE driver review webhook failed:', error.message);
    return res.status(500).json({ error: 'webhook processing failed' });
  }
}
