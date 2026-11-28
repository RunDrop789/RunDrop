import test from 'node:test';
import assert from 'node:assert/strict';

if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = 'https://example.supabase.co';
if (!process.env.SUPABASE_SECRET_KEY) process.env.SUPABASE_SECRET_KEY = 'test-secret';

const { buildMessage } = await import('./lineJobNotifications.js');

test('LINE job message emphasizes addresses and includes trip distance', () => {
  const message = buildMessage({
    id: 123,
    pickupText: 'Pickup address',
    dropoffText: 'Dropoff address',
    vehicleType: 'Box Pickup',
    distanceKm: 12.3,
    price: 500
  }, null);
  const details = message.contents.body.contents[1].contents;

  assert.equal(details[0].contents[0].text, 'รับที่');
  assert.equal(details[0].contents[0].weight, 'bold');
  assert.equal(details[1].contents[0].text, 'ส่งที่');
  assert.equal(details[1].contents[0].weight, 'bold');
  assert.equal(details[2].contents[1].text, '12.3 กม.');
});
