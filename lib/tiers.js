// รถที่รับงานประเภทนี้แทนได้ (เรียงจากใกล้ที่สุด)
export const FALLBACK = {
  Motorcycle: [],
  Sedan: ['Hatchback', 'SUV'],
  Hatchback: ['SUV'],
  SUV: [],
  Pickup: ['Box Pickup', 'Fence Pickup', 'Box Truck'],
  'Box Pickup': ['Box Truck'],
  'Fence Pickup': ['Box Truck'],
  'Box Truck': []
};

// งานต้องรออย่างน้อยกี่นาทีก่อนจะแสดงให้รถประเภทที่ใช้แทนได้
export const FALLBACK_AFTER_MIN = 5;

// คืน tier: 1 = ประเภทตรง, 2 = ประเภทที่ใช้แทนได้ (งานรอเกินเวลาที่กำหนด), 0 = ไม่แสดง
export function tierFor(orderVehicle, driverVehicle, createdAt, now = Date.now()) {
  if (orderVehicle === driverVehicle) return 1;
  if ((FALLBACK[orderVehicle] || []).includes(driverVehicle)) {
    const waitedMin = (now - new Date(createdAt).getTime()) / 60000;
    if (waitedMin >= FALLBACK_AFTER_MIN) return 2;
  }
  return 0;
}