import { supabase } from './supabase.js';
import { eligibleLineRecipients } from './lineRecipients.js';
import { eligibleVehicleTypes, FALLBACK } from './tiers.js';

const LINE_MULTICAST_URL = 'https://api.line.me/v2/bot/message/multicast';
const DRIVER_LIFF_ID = process.env.LINE_DRIVER_LIFF_ID || '2012603605-C9Lh060m';
const MAX_ACTIVE_ORDERS = 2;
const MAX_RECIPIENTS_PER_REQUEST = 500;
const DRIVER_QUERY_PAGE_SIZE = 500;

function truncate(value, maxLength) {
  const text = String(value || '').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export function buildMessage(order, imageUrl) {
  const driverUrl = `https://liff.line.me/${DRIVER_LIFF_ID}?orderId=${encodeURIComponent(order.id)}`;
  const fallbackNote = (FALLBACK[order.vehicleType] || []).length
    ? ' · รถที่ใหญ่กว่ารับแทนได้ทันที'
    : '';
  const tripDistance = `${Number(order.distanceKm).toFixed(1)} กม.`;
  const contents = [
    { type: 'text', text: 'มีงานใหม่', weight: 'bold', size: 'xl', color: '#15803d' },
    {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          spacing: 'xs',
          contents: [
            { type: 'text', text: 'รับที่', weight: 'bold', size: 'sm', color: '#15803d' },
            { type: 'text', text: truncate(order.pickupText, 180), wrap: true, size: 'sm' }
          ]
        },
        {
          type: 'box',
          layout: 'vertical',
          spacing: 'xs',
          contents: [
            { type: 'text', text: 'ส่งที่', weight: 'bold', size: 'sm', color: '#dc2626' },
            { type: 'text', text: truncate(order.dropoffText, 180), wrap: true, size: 'sm' }
          ]
        },
        {
          type: 'box',
          layout: 'horizontal',
          margin: 'sm',
          contents: [
            { type: 'text', text: 'ระยะทางจุดรับ–ส่ง', weight: 'bold', size: 'xs', flex: 1 },
            { type: 'text', text: tripDistance, weight: 'bold', size: 'sm', color: '#15803d', align: 'end' }
          ]
        },
        { type: 'text', text: `ประเภทรถ: ${truncate(order.vehicleType, 50)}${fallbackNote}`, wrap: true, size: 'xs', color: '#666666' },
        {
          type: 'box',
          layout: 'horizontal',
          margin: 'md',
          contents: [
            { type: 'text', text: 'ราคา', weight: 'bold', size: 'sm', flex: 1 },
            { type: 'text', text: `${Number(order.price).toLocaleString('th-TH')} บาท`, weight: 'bold', size: 'xl', color: '#16a34a', align: 'end' }
          ]
        }
      ]
    }
  ];

  const bubble = {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [{
        type: 'button',
        style: 'primary',
        color: '#16a34a',
        action: { type: 'uri', label: 'เปิดงานเพื่อปัดรับ', uri: driverUrl }
      }]
    }
  };

  if (imageUrl) {
    bubble.hero = {
      type: 'image',
      url: imageUrl,
      size: 'full',
      aspectRatio: '20:13',
      aspectMode: 'cover',
      action: { type: 'uri', uri: driverUrl }
    };
  }

  return {
    type: 'flex',
    altText: `งานใหม่ รับจาก ${truncate(order.pickupText, 90)} ส่งที่ ${truncate(order.dropoffText, 90)}`,
    contents: bubble
  };
}

async function getEligibleRecipients(vehicleType) {
  const recipients = [];
  for (let offset = 0; ; offset += DRIVER_QUERY_PAGE_SIZE) {
    const { data: drivers, error: driverError } = await supabase
      .from('drivers')
      .select('id, line_user_id')
      .eq('status', 'APPROVED')
      .eq('is_online', true)
      .in('vehicle_type', eligibleVehicleTypes(vehicleType))
      .not('line_user_id', 'is', null)
      .range(offset, offset + DRIVER_QUERY_PAGE_SIZE - 1);

    if (driverError) throw new Error(`Could not load eligible drivers (${driverError.code || 'database error'})`);
    if (!drivers?.length) break;

    const driverIds = drivers.map(driver => driver.id);
    const lineUserIds = drivers.map(driver => driver.line_user_id);
    const [{ data: activeOrders, error: activeError }, { data: followers, error: followerError }] = await Promise.all([
      supabase
        .from('orders')
        .select('driver_id')
        .in('driver_id', driverIds)
        .in('status', ['ACCEPTED', 'PICKED_UP']),
      supabase
        .from('line_followers')
        .select('line_user_id')
        .eq('is_following', true)
        .in('line_user_id', lineUserIds)
    ]);

    if (activeError) throw new Error(`Could not load active driver jobs (${activeError.code || 'database error'})`);
    if (followerError) throw new Error(`Could not load followed LINE drivers (${followerError.code || 'database error'})`);

    recipients.push(...eligibleLineRecipients(
      drivers,
      activeOrders || [],
      (followers || []).map(follower => follower.line_user_id),
      MAX_ACTIVE_ORDERS
    ));

    if (drivers.length < DRIVER_QUERY_PAGE_SIZE) break;
  }

  return [...new Set(recipients)];
}

export async function notifyNewJob(order) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured');

  const recipients = await getEligibleRecipients(order.vehicleType);
  if (!recipients.length) {
    console.info(`LINE new-job alert skipped: no eligible online drivers for ${order.vehicleType}`);
    return { sent: 0 };
  }

  let imageUrl = null;
  if (order.customerPhotoPath) {
    const { data, error } = await supabase.storage
      .from('order-photos')
      .createSignedUrl(order.customerPhotoPath, 60 * 60 * 24);
    if (error) throw new Error(`Could not create LINE photo URL (${error.message})`);
    imageUrl = data.signedUrl;
  }

  const message = buildMessage(order, imageUrl);
  for (let start = 0; start < recipients.length; start += MAX_RECIPIENTS_PER_REQUEST) {
    const to = recipients.slice(start, start + MAX_RECIPIENTS_PER_REQUEST);
    const response = await fetch(LINE_MULTICAST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ to, messages: [message] })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`LINE multicast failed (${response.status}): ${errorBody}`);
    }
  }

  console.info(`LINE new-job alert sent to ${recipients.length} eligible drivers`);
  return { sent: recipients.length };
}
