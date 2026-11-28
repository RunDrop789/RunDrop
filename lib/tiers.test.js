import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleVehicleTypes, tierFor } from './tiers.js';

test('fallback vehicle can take a new job immediately', () => {
  assert.equal(tierFor('Motorcycle', 'Sedan'), 2);
});

test('exact vehicle match remains the first tier', () => {
  assert.equal(tierFor('Sedan', 'Sedan'), 1);
});

test('incompatible vehicle cannot take the job', () => {
  assert.equal(tierFor('Box Truck', 'Motorcycle'), 0);
});

test('LINE eligible vehicle types include the matching fallback drivers', () => {
  assert.deepEqual(eligibleVehicleTypes('Motorcycle'), [
    'Motorcycle', 'Sedan', 'Hatchback', 'SUV', 'Pickup', 'Box Pickup', 'Fence Pickup', 'Box Truck'
  ]);
});
