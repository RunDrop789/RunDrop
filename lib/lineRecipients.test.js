import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleLineRecipients } from './lineRecipients.js';

test('only followed drivers with capacity receive LINE alerts', () => {
  const drivers = [
    { id: 1, line_user_id: 'followed' },
    { id: 2, line_user_id: 'not-followed' },
    { id: 3, line_user_id: 'full-capacity' }
  ];
  const activeOrders = [
    { driver_id: 3, status: 'ACCEPTED' },
    { driver_id: 3, status: 'PICKED_UP' }
  ];

  assert.deepEqual(
    eligibleLineRecipients(drivers, activeOrders, ['followed', 'full-capacity'], 2),
    ['followed']
  );
});
