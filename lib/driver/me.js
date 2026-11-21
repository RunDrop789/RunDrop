import { getDriverFromRequest } from '../driverAuth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const r = await getDriverFromRequest(req);
  if (r.error) return res.status(r.status).json({ error: r.error });

  const d = r.driver;
  return res.json({
    id: d.id,
    name: d.name,
    vehicleType: d.vehicle_type,
    plateNumber: d.plate_number,
    isOnline: d.is_online
  });
}
