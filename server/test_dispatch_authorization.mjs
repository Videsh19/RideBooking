import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const routes = readFileSync(
  new URL('./src/routes/bookingRoutes.js', import.meta.url),
  'utf8'
);
const driverService = readFileSync(
  new URL('./src/services/driverService.js', import.meta.url),
  'utf8'
);

assert.match(
  routes,
  /driverService\.assignNearestDriver\(bookingId,\s*req\.user\)/,
  'Nearest-driver dispatch receives the authenticated requester'
);
assert.match(
  driverService,
  /requester\?\.role === 'RIDER'[\s\S]*?requestedBooking\.user_id[\s\S]*?requester\.user_id/,
  'Nearest-driver dispatch verifies rider ownership'
);
assert.match(
  driverService,
  /if \(!requester \|\| !\['RIDER', 'ADMIN'\]\.includes\(requester\.role\)\)/,
  'Nearest-driver service requires a trusted rider or administrator'
);
assert.match(
  routes,
  /const bookingId = parsePositiveIntegerId\(req\.params\.id\);[\s\S]*?if \(bookingId === null\)/,
  'Nearest-driver route rejects non-positive, partial, decimal, and unsafe IDs'
);
assert.match(
  driverService,
  /typeof isAvailable !== 'boolean'[\s\S]*?INVALID_DUTY_STATUS/,
  'Driver duty service rejects non-boolean state changes'
);
