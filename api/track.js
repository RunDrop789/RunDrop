import { supabase } from '../lib/supabase.js';
import { verifyLineToken } from '../lib/lineVerify.js';

const CODE_RE = /^RD-[A-Z0-9]{6}$/;
const PHONE_RE = /^0\d{8,9}$/;

function normPhone(v) {
  return String(v || '').replace(/\s/g, '');
}

async function handleList(req, res, src) {
  const phone = normPhone(src.phone);
  if (!PHONE_RE.test(phone)) return res.status(400).json({ error: 'เบอร์ไม่ถูกต้อง' });

  const { data, error } = await supabase
    .from('orders')
    .select('tracking_code, status, price, pickup_place, destination, created_at')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) {
    console.error('track list error:', error.code);
    return res.status(500).json({ error: 'db error' });
  }

  return res.json({
    orders: (data || []).map(o => ({
      trackingCode: o.tracking_code,
      status: o.status,
      price: o.price,
      pickup: o.pickup_place,
      dropoff: o.destination,
      createdAt: o.created_at
    }))
  });
}

async function handleAccount(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  const idToken = req.headers['x-line-id-token'];
  if (!idToken) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ LINE' });
  const lineUserId = await verifyLineToken(idToken);
  if (!lineUserId) return res.status(401).json({ error: 'LINE token ไม่ถูกต้อง' });

  const date = String(req.query?.date || '');
  let dateRange = null;
  if (date) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) return res.status(400).json({ error: 'วันที่ไม่ถูกต้อง' });
    const [, yearText, monthText, dayText] = match;
    const utcDate = Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText));
    if (new Date(utcDate).toISOString().slice(0, 10) !== date) {
      return res.status(400).json({ error: 'วันที่ไม่ถูกต้อง' });
    }

    const start = utcDate - 7 * 60 * 60 * 1000;
    dateRange = {
      start: new Date(start).toISOString(),
      end: new Date(start + 24 * 60 * 60 * 1000).toISOString()
    };
  }

  const columns = 'tracking_code, status, price, pickup_place, destination, created_at';
  let ordersQuery = supabase
    .from('orders')
    .select(columns)
    .eq('line_user_id', lineUserId)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (dateRange) {
    ordersQuery = ordersQuery.gte('created_at', dateRange.start).lt('created_at', dateRange.end);
  }

  const [ordersResult, currentResult] = await Promise.all([
    ordersQuery,
    supabase
      .from('orders')
      .select(columns)
      .eq('line_user_id', lineUserId)
      .in('status', ['NEW', 'ACCEPTED', 'PICKED_UP'])
      .order('created_at', { ascending: false })
      .limit(100)
  ]);
  if (ordersResult.error || currentResult.error) {
    console.error('track account list error:', ordersResult.error?.code || currentResult.error?.code);
    return res.status(500).json({ error: 'โหลดประวัติไม่สำเร็จ' });
  }

  const mapOrder = o => ({
    trackingCode: o.tracking_code,
    status: o.status,
    price: o.price,
    pickup: o.pickup_place,
    dropoff: o.destination,
    createdAt: o.created_at
  });
  const allOrders = (ordersResult.data || []).map(mapOrder);
  const activeStatuses = new Set(['NEW', 'ACCEPTED', 'PICKED_UP']);
  const historyOrders = allOrders.filter(o => !activeStatuses.has(o.status));

  return res.json({
    currentOrders: (currentResult.data || []).map(mapOrder),
    orders: historyOrders
  });
}

async function canAccessOrder(req, order, phone) {
  if (PHONE_RE.test(phone) && order.phone === phone) return true;
  const idToken = req.headers['x-line-id-token'];
  if (!idToken || !order.line_user_id) return false;
  const lineUserId = await verifyLineToken(idToken);
  return lineUserId === order.line_user_id;
}

async function handleStatus(req, res, src) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const code = String(src.code || '').trim();
  const phone = normPhone(src.phone);
  if (!CODE_RE.test(code)) return res.status(400).json({ error: 'รหัสติดตามไม่ถูกต้อง' });

  const { data: o, error } = await supabase
    .from('orders')
    .select('id, tracking_code, status, price, phone, line_user_id, pickup_place, destination, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, driver_id, created_at')
    .eq('tracking_code', code)
    .maybeSingle();
  if (error) {
    console.error('track find error:', error.code);
    return res.status(500).json({ error: 'db error' });
  }
  if (!o || !(await canAccessOrder(req, o, phone))) return res.status(404).json({ error: 'ไม่พบงาน หรือไม่มีสิทธิ์ดูงานนี้' });

  let driver = null;
  if (o.driver_id) {
    const { data: d } = await supabase
      .from('drivers')
      .select('name, vehicle_type, plate_number, last_lat, last_lng, location_updated_at')
      .eq('id', o.driver_id)
      .maybeSingle();
    const live = ['ACCEPTED', 'PICKED_UP'].includes(o.status);
    if (d) {
      driver = {
        name: d.name,
        vehicle: d.vehicle_type,
        plate: d.plate_number,
        lat: live ? d.last_lat : null,
        lng: live ? d.last_lng : null,
        updatedAt: live ? d.location_updated_at : null
      };
    }
  }

  return res.json({
    order: {
      trackingCode: o.tracking_code,
      status: o.status,
      price: o.price,
      createdAt: o.created_at,
      pickup: { place: o.pickup_place, lat: o.pickup_lat, lng: o.pickup_lng },
      dropoff: { place: o.destination, lat: o.dropoff_lat, lng: o.dropoff_lng }
    },
    driver
  });
}

async function handleMessages(req, res, src) {
  const code = String(src.code || '').trim();
  const phone = normPhone(src.phone);
  if (!CODE_RE.test(code)) return res.status(400).json({ error: 'รหัสติดตามไม่ถูกต้อง' });

  const { data: o, error: findErr } = await supabase
    .from('orders').select('id, phone, line_user_id').eq('tracking_code', code).maybeSingle();
  if (findErr) return res.status(500).json({ error: 'db error' });
  if (!o || !(await canAccessOrder(req, o, phone))) return res.status(404).json({ error: 'ไม่พบงาน หรือไม่มีสิทธิ์ดูงานนี้' });

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('order_messages')
      .select('id, sender, body, created_at')
      .eq('order_id', o.id)
      .order('id', { ascending: true })
      .limit(200);
    if (error) return res.status(500).json({ error: 'db error' });
    return res.json({ messages: data || [] });
  }

  const body = String(src.body || '').trim().slice(0, 300);
  if (!body) return res.status(400).json({ error: 'ข้อความว่าง' });
  const { error } = await supabase
    .from('order_messages')
    .insert([{ order_id: o.id, sender: 'customer', body }]);
  if (error) return res.status(500).json({ error: 'db error' });
  return res.json({ ok: true });
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }
  const src = req.method === 'GET' ? req.query : (req.body || {});
  const type = req.query?.type || src.type || 'status';

  if (type === 'list') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
    return handleList(req, res, src);
  }
  if (type === 'account') return handleAccount(req, res);
  if (type === 'messages') return handleMessages(req, res, src);
  return handleStatus(req, res, src);
}