// key = ประเภทงานที่ลูกค้าขอ, value = รถที่ใหญ่กว่าหรือเท่ากันซึ่งรับแทนได้
export const FALLBACK = {
  Motorcycle: ['Sedan', 'Hatchback', 'SUV', 'Pickup', 'Box Pickup', 'Fence Pickup', 'Box Truck'],
  Sedan: ['Hatchback', 'SUV', 'Pickup', 'Box Pickup', 'Fence Pickup', 'Box Truck'],
  Hatchback: ['SUV', 'Pickup', 'Box Pickup', 'Fence Pickup', 'Box Truck'],
  SUV: ['Pickup', 'Box Pickup', 'Fence Pickup', 'Box Truck'],
  Pickup: ['Box Pickup', 'Fence Pickup', 'Box Truck'],
  'Box Pickup': ['Box Truck'],
  'Fence Pickup': ['Box Truck'],
  'Box Truck': []
};

export function eligibleVehicleTypes(orderVehicle) {
  return [orderVehicle, ...(FALLBACK[orderVehicle] || [])];
}

// คืน tier: 1 = ประเภทตรง, 2 = รถที่ใหญ่กว่ารับแทนทันที, 0 = ไม่แสดง
export function tierFor(orderVehicle, driverVehicle) {
  if (orderVehicle === driverVehicle) return 1;
  if ((FALLBACK[orderVehicle] || []).includes(driverVehicle)) return 2;
  return 0;
}