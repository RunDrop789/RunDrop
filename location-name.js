(() => {
  const cache = new Map();
  let queue = Promise.resolve();
  let lastRequestAt = 0;

  function cleanAddress(value, prefixes) {
    let text = String(value || '').trim();
    prefixes.forEach(prefix => {
      text = text.replace(new RegExp(`^${prefix}\\s*`, 'i'), '');
    });
    return text;
  }

  function formatAddress(result) {
    const address = result.address || {};
    const explicitDistrict = address.city_district || address.district || address.amphoe || address.county;
    const subdistrict = address.subdistrict || address.tambon || address.quarter ||
      address.village || address.hamlet ||
      (explicitDistrict && address.suburb !== explicitDistrict ? address.suburb : '');
    const district = explicitDistrict || address.suburb;
    const province = address.province || address.state || address.city;
    const place = result.name || address.amenity || address.shop || address.tourism ||
      address.leisure || address.building || address.road || address.neighbourhood ||
      String(result.display_name || '').split(',')[0];
    const parts = [];
    const seen = new Set();
    const add = (value, label, prefixes) => {
      const clean = cleanAddress(value, prefixes);
      const key = clean.toLocaleLowerCase();
      if (clean && !seen.has(key)) {
        seen.add(key);
        parts.push(label ? `${label} ${clean}` : clean);
      }
    };

    add(place, '', []);
    add(subdistrict, 'ตำบล/แขวง', ['ตำบล', 'ต\\.', 'แขวง']);
    add(district, 'อำเภอ/เขต', ['อำเภอ', 'อ\\.', 'เขต']);
    add(province, 'จังหวัด', ['จังหวัด', 'จ\\.']);

    if (!parts.length) throw new Error('ไม่พบชื่อสถานที่จากพิกัดนี้');
    return parts.join(' · ');
  }

  function reverseGeocode(lat, lng) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return Promise.reject(new Error('พิกัดไม่ถูกต้อง'));
    }

    const key = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
    if (cache.has(key)) return cache.get(key);

    const lookup = queue.then(async () => {
      const wait = Math.max(0, 1100 - (Date.now() - lastRequestAt));
      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      lastRequestAt = Date.now();

      const query = new URLSearchParams({
        format: 'jsonv2',
        lat: String(latitude),
        lon: String(longitude),
        zoom: '18',
        addressdetails: '1',
        'accept-language': 'th'
      });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${query}`, {
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`ค้นหาสถานที่ไม่สำเร็จ (HTTP ${response.status})`);
        return formatAddress(await response.json());
      } catch (error) {
        if (error.name === 'AbortError') throw new Error('ค้นหาชื่อสถานที่ใช้เวลานานเกินไป');
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    });

    cache.set(key, lookup);
    queue = lookup.catch(() => {});
    lookup.catch(() => cache.delete(key));
    return lookup;
  }

  window.RunDropLocation = Object.freeze({ reverseGeocode });
})();
