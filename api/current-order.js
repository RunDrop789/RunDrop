import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {

  const lineUserId = String(
    req.query.lineUserId || ''
  ).trim();

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('line_user_id', lineUserId)
    .in('status', [
      'NEW',
      'ACCEPTED',
      'PICKED_UP'
    ])
    .order('created_at', {
      ascending: false
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    return res.status(500).json({
      error: 'db error'
    });
  }

  return res.json({
    order: data
  });
}