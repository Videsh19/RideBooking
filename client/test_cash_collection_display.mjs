import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getCashCollectionDisplayStatus } from './src/utils/cashCollectionDisplay.js';

assert.equal(
  getCashCollectionDisplayStatus('Cash', null),
  'UNVERIFIED',
  'Legacy Cash without collection metadata is not shown as collected'
);
assert.equal(
  getCashCollectionDisplayStatus('Cash', 'OUTSTANDING'),
  'OUTSTANDING'
);
assert.equal(
  getCashCollectionDisplayStatus('Cash', 'COLLECTED'),
  'COLLECTED'
);
assert.equal(
  getCashCollectionDisplayStatus('UPI', null),
  null,
  'Non-cash payments do not use cash collection status'
);

const riderDashboard = readFileSync(
  new URL('./src/pages/RiderDashboardPage.jsx', import.meta.url),
  'utf8'
);
assert.match(
  riderDashboard,
  /paymentReceipt\.payment_method === 'Cash'[\s\S]*?'Driver-Confirmed Cash Collection'[\s\S]*?'Cash Collection Status Unverified'/
);
assert.match(
  riderDashboard,
  /paymentMethod === 'Cash'[\s\S]*?'Cash Collection Record'[\s\S]*?'Simulated Payment Gateway'/
);
assert.match(
  riderDashboard,
  /paymentMethod === 'Cash'[\s\S]*?Cash Collection:[\s\S]*?simulates an electronic payment terminal/
);
