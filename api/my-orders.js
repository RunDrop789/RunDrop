import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {

  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'method not allowed'
    });
  }

  const lineUserId = String(
    req.query.lineUserId || ''
  ).trim();

  if (!lineUserId) {
    return res.status(400).json({
      error: 'line user id required'
    });
  }

  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      tracking_code,
      status,
      price,
      vehicle_type,
      pickup_place,
      destination,
      created_at
    `)
    .eq('line_user_id', lineUserId)
    .order('created_at', {
      ascending: false
    });

  if (error) {
    return res.status(500).json({
      error: 'db error'
    });
  }

  return res.json({
    orders: data || []
  });
}