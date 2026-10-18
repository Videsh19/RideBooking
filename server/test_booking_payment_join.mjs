import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bookingService = readFileSync(
  new URL('./src/services/bookingService.js', import.meta.url),
  'utf8'
);
const paymentJoins = [
  ...bookingService.matchAll(
    /LEFT JOIN payments pay ON pay\.payment_id = \(([\s\S]*?LIMIT 1)\s*\)/g
  ),
];

assert.equal(paymentJoins.length, 2, 'Both rider booking queries select one payment row');

for (const [, paymentSelection] of paymentJoins) {
  assert.match(paymentSelection, /candidate\.payment_status = 'SUCCESS'/);
  assert.match(paymentSelection, /candidate\.payment_method = 'Cash'/);
  assert.match(paymentSelection, /candidate\.cash_collection_status = 'OUTSTANDING'/);
  assert.match(paymentSelection, /candidate\.cash_collection_status IS NULL/);
  assert.match(
    paymentSelection,
    /ORDER BY \([\s\S]*?candidate\.cash_collection_status IS NULL[\s\S]*?\) DESC,[\s\S]*?\(candidate\.payment_status = 'SUCCESS'\) DESC/
  );
}
