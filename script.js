const RATES = {
  motorcycle: { label: "รถจักรยานยนต์", base: 35, perKm: 8 },
  car: { label: "รถยนต์", base: 90, perKm: 12 },
  pickup: { label: "รถกระบะ", base: 140, perKm: 16 },
  "large-4w": { label: "รถ 4 ล้อใหญ่", base: 280, perKm: 24 },
};

const form = document.getElementById("booking-form");
const pickupInput = document.getElementById("pickup");
const destinationInput = document.getElementById("destination");
const vehicleSelect = document.getElementById("vehicle");
const nameInput = document.getElementById("contact-name");
const phoneInput = document.getElementById("phone");
const calculateBtn = document.getElementById("calculate-price");
const priceEl = document.getElementById("estimate-price");
const detailEl = document.getElementById("estimate-detail");
const errorEl = document.getElementById("form-error");
const confirmationEl = document.getElementById("confirmation");
const bookingRefEl = document.getElementById("booking-ref");
const summaryEl = document.getElementById("confirmation-summary");
const newBookingBtn = document.getElementById("new-booking");

const routeFields = [pickupInput, destinationInput, vehicleSelect];
const allFields = [...routeFields, nameInput, phoneInput];

const money = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});

let activeQuote = null;

function routeDistanceKm(pickup, destination) {
  const key = `${pickup.trim().toLowerCase()}|${destination.trim().toLowerCase()}`;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 33 + key.charCodeAt(i)) >>> 0;
  }
  return 3 + (hash % 4200) / 100;
}

function routeSignature() {
  return `${pickupInput.value.trim().toLowerCase()}|${destinationInput.value.trim().toLowerCase()}|${vehicleSelect.value}`;
}

function phoneDigits() {
  return phoneInput.value.replace(/[\s-]/g, "");
}

function buildQuote() {
  const pickup = pickupInput.value.trim();
  const destination = destinationInput.value.trim();
  const vehicle = RATES[vehicleSelect.value];

  if (!pickup || !destination || !vehicle) {
    return { error: "กรอกจุดรับสินค้า จุดส่งสินค้า และประเภทรถก่อนคำนวณราคา" };
  }

  if (pickup.toLowerCase() === destination.toLowerCase()) {
    return { error: "จุดรับสินค้าและจุดส่งสินค้าต้องไม่ใช่ที่เดียวกัน" };
  }

  const km = routeDistanceKm(pickup, destination);
  const amount = Math.round(vehicle.base + km * vehicle.perKm);
  return {
    pickup,
    destination,
    vehicle,
    km,
    amount,
    signature: routeSignature(),
  };
}

function showError(message) {
  errorEl.hidden = false;
  errorEl.textContent = message;
}

function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = "";
}

function markInvalid(input, invalid) {
  input.classList.toggle("is-invalid", invalid);
}

function resetPrice() {
  activeQuote = null;
  priceEl.textContent = "—";
  detailEl.textContent = "กดคำนวณราคาเพื่อดูค่าส่ง";
}

function renderQuote(quote) {
  priceEl.textContent = money.format(quote.amount);
  detailEl.textContent = `${quote.vehicle.label} · ประมาณ ${quote.km.toFixed(1)} กม. · ค่าเริ่มต้น ${money.format(quote.vehicle.base)} + ${money.format(quote.vehicle.perKm)}/กม.`;
}

calculateBtn.addEventListener("click", () => {
  confirmationEl.hidden = true;
  const pickupMissing = pickupInput.value.trim() === "";
  const destinationMissing = destinationInput.value.trim() === "";
  const vehicleMissing = vehicleSelect.value === "";
  markInvalid(pickupInput, pickupMissing);
  markInvalid(destinationInput, destinationMissing);
  markInvalid(vehicleSelect, vehicleMissing);

  const quote = buildQuote();
  if (quote.error) {
    activeQuote = null;
    priceEl.textContent = "—";
    detailEl.textContent = quote.error;
    showError(quote.error);
    return;
  }

  activeQuote = quote;
  clearError();
  renderQuote(quote);
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  confirmationEl.hidden = true;

  const nameMissing = nameInput.value.trim() === "";
  const digits = phoneDigits();
  const phoneInvalid = !/^0\d{9}$/.test(digits);
  markInvalid(nameInput, nameMissing);
  markInvalid(phoneInput, phoneInvalid);

  const quote = buildQuote();
  markInvalid(pickupInput, pickupInput.value.trim() === "");
  markInvalid(destinationInput, destinationInput.value.trim() === "");
  markInvalid(vehicleSelect, vehicleSelect.value === "");

  if (quote.error) {
    showError(quote.error);
    return;
  }

  if (!activeQuote || activeQuote.signature !== quote.signature) {
    showError("กดคำนวณราคาก่อนสร้างออเดอร์");
    return;
  }

  if (nameMissing || phoneInvalid) {
    showError("กรอกชื่อผู้ติดต่อและเบอร์โทรศัพท์ 10 หลักที่ขึ้นต้นด้วย 0");
    return;
  }

  clearError();
  const reference = `RD-${String(10000 + Math.floor(Math.random() * 90000))}`;
  bookingRefEl.textContent = reference;
  summaryEl.textContent = `${quote.vehicle.label} จาก ${quote.pickup} ไป ${quote.destination} ผู้ติดต่อ ${nameInput.value.trim()} โทร ${digits} ราคาประเมิน ${money.format(quote.amount)}`;
  confirmationEl.hidden = false;
});

allFields.forEach((field) => {
  const clearField = () => markInvalid(field, false);
  field.addEventListener("input", clearField);
  field.addEventListener("change", clearField);
});

routeFields.forEach((field) => {
  const staleQuote = () => {
    if (!activeQuote) return;
    if (activeQuote.signature !== routeSignature()) {
      resetPrice();
      detailEl.textContent = "ข้อมูลเปลี่ยนแล้ว กดคำนวณราคาอีกครั้ง";
    }
  };
  field.addEventListener("input", staleQuote);
  field.addEventListener("change", staleQuote);
});

newBookingBtn.addEventListener("click", () => {
  form.reset();
  confirmationEl.hidden = true;
  clearError();
  allFields.forEach((field) => markInvalid(field, false));
  resetPrice();
  pickupInput.focus();
});
