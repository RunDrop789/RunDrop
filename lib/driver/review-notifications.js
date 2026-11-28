import { supabase } from '../supabase.js';

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const DOCS = [
  { type: 'id_card', label: 'ดูบัตรประชาชน' },
  { type: 'driver_license', label: 'ดูใบขับขี่' },
  { type: 'criminal_record', label: 'ดูใบตรวจประวัติ' },
  { type: 'selfie', label: 'ดูรูปหน้าคนขับ' }
];
const SIGNED_URL_SECONDS = 60 * 60;

function reviewAction(decision, driverId, label, style) {
  return {
    type: 'button',
    style,
    action: {
      type: 'postback',
      label,
      data: `action=${decision}&driverId=${encodeURIComponent(driverId)}`
    }
  };
}

export async function notifyPendingDriverReview(driverId) {
  const adminUserId = process.env.DRIVER_ADMIN_LINE_USER_ID;
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!adminUserId) throw new Error('DRIVER_ADMIN_LINE_USER_ID is not configured');
  if (!accessToken) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured');

  const { data: driver, error: driverError } = await supabase
    .from('drivers')
    .select('id, name, phone, vehicle_type, plate_number, status, review_notified_at')
    .eq('id', driverId)
    .maybeSingle();
  if (driverError) throw new Error(`Could not load driver application (${driverError.code || 'database error'})`);
  if (!driver || driver.status !== 'PENDING' || driver.review_notified_at) return { sent: false };

  const { data: documents, error: documentsError } = await supabase
    .from('driver_documents')
    .select('id, doc_type, storage_path')
    .eq('driver_id', driverId)
    .order('id', { ascending: false });
  if (documentsError) throw new Error(`Could not load driver documents (${documentsError.code || 'database error'})`);

  const latestDocuments = new Map();
  for (const document of documents || []) {
    if (!latestDocuments.has(document.doc_type)) latestDocuments.set(document.doc_type, document);
  }
  if (!DOCS.every(document => latestDocuments.has(document.type))) return { sent: false };

  const documentButtons = await Promise.all(DOCS.map(async document => {
    const stored = latestDocuments.get(document.type);
    const { data, error } = await supabase.storage
      .from('driver-docs')
      .createSignedUrl(stored.storage_path, SIGNED_URL_SECONDS);
    if (error) throw new Error(`Could not create ${document.type} link (${error.message})`);

    return {
      type: 'button',
      style: 'link',
      height: 'sm',
      action: { type: 'uri', label: document.label, uri: data.signedUrl }
    };
  }));

  const message = {
    type: 'flex',
    altText: `ใบสมัคร Driver ใหม่: ${driver.name}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'text', text: 'ใบสมัคร Driver ใหม่', weight: 'bold', size: 'lg', color: '#166534' },
          { type: 'text', text: `ชื่อ: ${driver.name}`, wrap: true, size: 'sm' },
          { type: 'text', text: `โทร: ${driver.phone}`, size: 'sm' },
          { type: 'text', text: `รถ: ${driver.vehicle_type} · ${driver.plate_number}`, wrap: true, size: 'sm' },
          { type: 'text', text: 'กดดูเอกสาร แล้วเลือก Accept หรือ Reject', wrap: true, size: 'xs', color: '#666666' }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'xs',
        contents: [
          ...documentButtons,
          { type: 'separator', margin: 'sm' },
          reviewAction('approve', driver.id, 'Accept', 'primary'),
          reviewAction('reject', driver.id, 'Reject', 'secondary')
        ]
      }
    }
  };

  const response = await fetch(LINE_PUSH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ to: adminUserId, messages: [message] })
  });
  if (!response.ok) throw new Error(`LINE application notification failed (${response.status})`);

  const { error: markError } = await supabase
    .from('drivers')
    .update({ review_notified_at: new Date().toISOString() })
    .eq('id', driverId)
    .eq('status', 'PENDING')
    .is('review_notified_at', null);
  if (markError) throw new Error(`Could not mark driver application as notified (${markError.code || 'database error'})`);

  return { sent: true };
}
