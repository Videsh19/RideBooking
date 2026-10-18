import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { paymentMatchesBooking } from './src/utils/paymentConsistency.js';
import { selectPreferredBookingPayment } from './src/utils/paymentDisplay.js';

const legacyCash = {
  payment_method: 'Cash',
  payment_status: 'PENDING',
  cash_collection_status: null,
};
const successfulUpi = {
  payment_method: 'UPI',
  payment_status: 'SUCCESS',
};

assert.equal(
  selectPreferredBookingPayment([successfulUpi, legacyCash]),
  legacyCash,
  'Unverified legacy Cash remains visible ahead of simulated electronic payment'
);
assert.equal(
  selectPreferredBookingPayment([
    successfulUpi,
    { ...legacyCash, cash_collection_status: 'OUTSTANDING' },
  ]).cash_collection_status,
  'OUTSTANDING',
  'Outstanding Cash remains visible ahead of successful electronic payment'
);
assert.equal(selectPreferredBookingPayment([successfulUpi]), successfulUpi);
assert.equal(selectPreferredBookingPayment([]), null);

const validExistingPayment = {
  user_id: 42,
  amount: '123.45',
  payment_method: 'UPI',
  payment_status: 'SUCCESS',
};
const owningBooking = { user_id: 42, total_fare: '123.45' };
assert.equal(paymentMatchesBooking(validExistingPayment, owningBooking), true);
assert.equal(
  paymentMatchesBooking({ ...validExistingPayment, user_id: 43 }, owningBooking),
  false,
  'Payment owned by another user cannot reconcile this booking'
);
assert.equal(
  paymentMatchesBooking({ ...validExistingPayment, amount: '123.46' }, owningBooking),
  false,
  'Payment with a different amount cannot reconcile this booking'
);
assert.equal(
  paymentMatchesBooking({ ...validExistingPayment, amount: null }, owningBooking),
  false,
  'Missing payment amount is treated as inconsistent'
);

const paymentService = readFileSync(
  new URL('./src/services/paymentService.js', import.meta.url),
  'utf8'
);
const bookingService = readFileSync(
  new URL('./src/services/bookingService.js', import.meta.url),
  'utf8'
);
const driverService = readFileSync(
  new URL('./src/services/driverService.js', import.meta.url),
  'utf8'
);

assert.match(
  paymentService,
  /cash_collection_status = 'OUTSTANDING'[\s\S]*?OR cash_collection_status IS NULL/,
  'New electronic payments are blocked by outstanding and unverified legacy Cash'
);
assert.match(
  paymentService,
  /code: hasUnverifiedCash\s*\?\s*'CASH_COLLECTION_UNVERIFIED'/,
  'Unverified legacy Cash produces an explicit conflict'
);
const reconciliationStart = paymentService.indexOf(
  'if (existingSuccess.length > 0) {'
);
const reconciliationEnd = paymentService.indexOf(
  '// 5. Source of truth for fare amount',
  reconciliationStart
);
assert.notEqual(reconciliationStart, -1);
assert.notEqual(reconciliationEnd, -1);
const reconciliationBlock = paymentService.slice(
  reconciliationStart,
  reconciliationEnd
);
assert.match(
  reconciliationBlock,
  /const existingPayment = existingSuccess\[0\];[\s\S]*?paymentMatchesBooking\(existingPayment, booking\)[\s\S]*?UPDATE bookings[\s\S]*?await connection\.commit\(\);[\s\S]*?return \{[\s\S]*?reconciled: true/,
  'Existing successful payment is committed with booking reconciliation and returned'
);
assert.match(
  reconciliationBlock,
  /existingPayment\.payment_method === 'Cash'[\s\S]*?existingPayment\.cash_collection_status !== 'COLLECTED'[\s\S]*?CASH_COLLECTION_UNVERIFIED/,
  'Successful legacy Cash without verified collection is not used to mark a booking paid'
);
const reconciliationCommit = reconciliationBlock.indexOf('await connection.commit();');
assert.notEqual(reconciliationCommit, -1);
assert.doesNotMatch(
  reconciliationBlock.slice(reconciliationCommit),
  /throw\s*\{/,
  'Committed reconciliation is not followed by an error that triggers rollback'
);
assert.match(
  bookingService,
  /candidate\.cash_collection_status = 'OUTSTANDING'[\s\S]*?candidate\.cash_collection_status IS NULL[\s\S]*?ORDER BY \([\s\S]*?candidate\.cash_collection_status = 'OUTSTANDING'[\s\S]*?candidate\.cash_collection_status IS NULL[\s\S]*?DESC,[\s\S]*?\(candidate\.payment_status = 'SUCCESS'\) DESC/
);
assert.match(
  driverService,
  /ORDER BY \([\s\S]*?cash_payment\.cash_collection_status = 'OUTSTANDING'[\s\S]*?cash_payment\.cash_collection_status IS NULL[\s\S]*?\) DESC/
);
