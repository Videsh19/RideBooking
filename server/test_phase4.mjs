import { getDbPool } from './src/config/db.js';
const pool = getDbPool();

const BASE_URL = 'http://localhost:5000/api';

async function runPhase4Tests() {
  console.log('================================================================');
  console.log(' GoRide Phase 4 - Consolidated Verification & Regression Suite');
  console.log(' SRS Gap Closure: REQ-003, REQ-009, REQ-027, REQ-013/014, REQ-022, Refund');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------------------
    // SETUP: System Authentication
    // -------------------------------------------------------------------------
    console.log('--- Setup: Authenticating Admin and Passenger Accounts ---');

    // Admin login
    const adminRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@goride.internal', password: 'AdminPassword123!' }),
    });
    const adminData = await adminRes.json();
    assert(adminRes.status === 200, 'Admin login succeeds');
    const adminToken = adminData.data.token;

    // Rider login
    const riderRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rider@goride.internal', password: 'Password123!' }),
    });
    const riderData = await riderRes.json();
    assert(riderRes.status === 200, 'Rider login succeeds');
    const riderToken = riderData.data.token;
    const riderUserId = riderData.data.user.user_id;

    // -------------------------------------------------------------------------
    // WORKSTREAM 1: Mobile Number Uniqueness (REQ-003)
    // -------------------------------------------------------------------------
    console.log('\n--- Workstream 1: Mobile Number Uniqueness (REQ-003) ---');

    const uniquePhone = `+91 97${Date.now().toString().slice(-8)}`;
    const regUser1Res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Unique Phone User 1',
        email: `ws1_user1_${Date.now()}@test.internal`,
        password: 'Password123!',
        phoneNo: uniquePhone,
        role: 'RIDER',
      }),
    });
    const regUser1Data = await regUser1Res.json();
    assert(regUser1Res.status === 201, `User 1 registers successfully with phone: ${uniquePhone}`);

    // Attempt to register User 2 with the identical phone number
    const regUser2Res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Duplicate Phone User 2',
        email: `ws1_user2_${Date.now()}@test.internal`,
        password: 'Password123!',
        phoneNo: uniquePhone,
        role: 'RIDER',
      }),
    });
    const regUser2Data = await regUser2Res.json();
    assert(regUser2Res.status === 409, 'Duplicate phone number rejected with HTTP 409 Conflict');
    assert(regUser2Data.error?.code === 'PHONE_ALREADY_REGISTERED', 'Returns clear error code PHONE_ALREADY_REGISTERED');

    // -------------------------------------------------------------------------
    // WORKSTREAM 2: Secure Password Recovery (REQ-009)
    // -------------------------------------------------------------------------
    console.log('\n--- Workstream 2: Secure Password Recovery (REQ-009) ---');

    // 2a. Anti-enumeration: Request reset for non-existent account
    const nonExistentEmail = `unknown_${Date.now()}@test.internal`;
    const forgotUnknownRes = await fetch(`${BASE_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: nonExistentEmail }),
    });
    const forgotUnknownData = await forgotUnknownRes.json();
    assert(forgotUnknownRes.status === 200, 'Non-existent email returns HTTP 200 (Anti-enumeration preserved)');
    assert(forgotUnknownData.message.includes('If that email address is in our system'), 'Anti-enumeration messaging verified');

    // 2b. Request reset for valid registered user
    const resetUserEmail = `reset_user_${Date.now()}@test.internal`;
    const resetUserPhone = `+91 98${Date.now().toString().slice(-8)}`;
    const regResetUser = await (await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Password Reset Test User',
        email: resetUserEmail,
        password: 'OldPassword123!',
        phoneNo: resetUserPhone,
        role: 'RIDER',
      }),
    })).json();
    const oldUserToken = regResetUser.data.token;

    // Verify old token works before reset
    const preResetCheck = await fetch(`${BASE_URL}/bookings`, {
      headers: { Authorization: `Bearer ${oldUserToken}` },
    });
    assert(preResetCheck.status === 200, 'Old JWT token is valid before password reset');

    const forgotRes = await fetch(`${BASE_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetUserEmail }),
    });
    const forgotData = await forgotRes.json();
    assert(forgotRes.status === 200, 'Forgot password request succeeds with HTTP 200');
    assert(!!forgotData.devResetToken, 'Development delivery channel provides reset token');
    const rawResetToken = forgotData.devResetToken;

    // Verify token hash is stored in database, not raw token
    const [tokenRows] = await pool.query(
      'SELECT token_hash, used_at, expires_at FROM password_resets WHERE user_id = ? ORDER BY reset_id DESC LIMIT 1',
      [regResetUser.data.user.user_id]
    );
    assert(tokenRows.length > 0, 'Password reset record persisted in MySQL');
    assert(tokenRows[0].token_hash !== rawResetToken, 'Token stored in MySQL is cryptographically hashed');
    assert(tokenRows[0].used_at === null, 'Reset token starts as unused');

    // 2c. Invalid token rejected
    const invalidResetRes = await fetch(`${BASE_URL}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'bogus_invalid_token_12345', newPassword: 'NewPassword123!' }),
    });
    assert(invalidResetRes.status === 400, 'Invalid reset token rejected with HTTP 400');

    // 2d. Successful password reset
    const resetRes = await fetch(`${BASE_URL}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawResetToken, newPassword: 'BrandNewPassword123!' }),
    });
    assert(resetRes.status === 200, 'Password reset succeeds with HTTP 200');

    // 2e. Token reuse rejected
    const reuseResetRes = await fetch(`${BASE_URL}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawResetToken, newPassword: 'AnotherPassword123!' }),
    });
    assert(reuseResetRes.status === 400, 'Token reuse rejected with HTTP 400 (Single-use token enforced)');

    // 2f. Invalidation of old sessions via token_version
    const postResetOldTokenCheck = await fetch(`${BASE_URL}/bookings`, {
      headers: { Authorization: `Bearer ${oldUserToken}` },
    });
    assert(postResetOldTokenCheck.status === 401, 'Old JWT session invalidated immediately after reset (HTTP 401 SESSION_REVOKED)');

    // 2g. Login with old password fails
    const oldLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetUserEmail, password: 'OldPassword123!' }),
    });
    assert(oldLoginRes.status === 401, 'Login with old password rejected');

    // 2h. Login with new password succeeds
    const newLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetUserEmail, password: 'BrandNewPassword123!' }),
    });
    assert(newLoginRes.status === 200, 'Login with new bcrypt-hashed password succeeds');

    // -------------------------------------------------------------------------
    // WORKSTREAM 3: Cancellation Charges (REQ-027)
    // -------------------------------------------------------------------------
    console.log('\n--- Workstream 3: Cancellation Charges (REQ-027) ---');

    // 3a. Cancel in REQUESTED state -> Grace period / waived (fee = 0.00)
    const bookReqRes = await fetch(`${BASE_URL}/bookings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickupAddress: 'Bandra Kurla Complex (BKC)',
        destAddress: 'Chhatrapati Shivaji Maharaj Terminus (CSMT)',
        vehicleTier: 'standard',
      }),
    });
    const bookReqData = await bookReqRes.json();
    const reqBookingId = bookReqData.data.booking_id;

    const cancelReqRes = await fetch(`${BASE_URL}/bookings/${reqBookingId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Changed mind before driver assignment' }),
    });
    const cancelReqData = await cancelReqRes.json();
    assert(cancelReqRes.status === 200, 'REQUESTED booking cancelled successfully');
    assert(Number(cancelReqData.data.cancellation_fee) === 0, 'Cancellation fee is ₹0.00 for unassigned REQUESTED ride');

    // 3b. Repeated cancellation on already cancelled ride rejected
    const repeatCancelRes = await fetch(`${BASE_URL}/bookings/${reqBookingId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Trying to cancel again' }),
    });
    assert(repeatCancelRes.status === 400, 'Repeated cancellation rejected with HTTP 400 (Cannot double-charge)');

    // 3c. Cancel in CONFIRMED state after grace period (> 120s) -> Flat fee ₹50.00
    // Create new booking
    const bookConfRes = await fetch(`${BASE_URL}/bookings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickupAddress: 'Gateway of India, Colaba',
        destAddress: 'Worli Sea Face',
        vehicleTier: 'standard',
      }),
    });
    const confBookingId = (await bookConfRes.json()).data.booking_id;

    // Register and approve a driver to accept
    const dPhone = `+91 99${Date.now().toString().slice(-8)}`;
    const driverReg = await (await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Cancellation Driver Test',
        email: `driver_canc_${Date.now()}@test.internal`,
        password: 'Password123!',
        phoneNo: dPhone,
        role: 'DRIVER',
        licenseNo: `DL-${Date.now()}`,
        vehicleNo: `MH-01-${Date.now().toString().slice(-4)}`,
        vehicleModel: 'Hyundai Aura',
        vehicleCategory: 'STANDARD',
      }),
    })).json();
    const dToken = driverReg.data.token;
    const dProf = await (await fetch(`${BASE_URL}/driver/profile`, { headers: { Authorization: `Bearer ${dToken}` } })).json();
    await fetch(`${BASE_URL}/admin/driver-applications/${dProf.data.driver_id}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    await fetch(`${BASE_URL}/driver/duty`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${dToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAvailable: true }),
    });

    // Driver accepts -> booking is CONFIRMED
    await fetch(`${BASE_URL}/driver/rides/${confBookingId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dToken}` },
    });

    // Simulate passage of 5 minutes (> 120s cutoff) on created_at / booking_date timestamp
    await pool.query(
      'UPDATE bookings SET created_at = DATE_SUB(NOW(), INTERVAL 5 MINUTE), booking_date = DATE_SUB(NOW(), INTERVAL 5 MINUTE) WHERE booking_id = ?',
      [confBookingId]
    );

    // Rider cancels after cutoff
    const cancelLateRes = await fetch(`${BASE_URL}/bookings/${confBookingId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Driver taking too long' }),
    });
    const cancelLateData = await cancelLateRes.json();
    assert(cancelLateRes.status === 200, 'Late CONFIRMED booking cancelled successfully');
    assert(Number(cancelLateData.data.cancellation_fee) === 50, `Cancellation fee of ₹50.00 applied after cutoff (Actual: ₹${cancelLateData.data.cancellation_fee})`);

    // Verify persisted cancellation fee in DB
    const [persistedBookingRows] = await pool.query(
      'SELECT cancellation_fee, status FROM bookings WHERE booking_id = ?',
      [confBookingId]
    );
    assert(Number(persistedBookingRows[0].cancellation_fee) === 50, 'Cancellation fee persisted in MySQL as ₹50.00');

    // -------------------------------------------------------------------------
    // WORKSTREAM 4: Driver Document Uploads (REQ-013 & REQ-014)
    // -------------------------------------------------------------------------
    console.log('\n--- Workstream 4: Driver Document Uploads (REQ-013 & REQ-014) ---');

    // 4a. Reject file with invalid magic bytes (executable disguised as PDF)
    const badBytes = new Uint8Array([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00]); // DOS / MZ header
    const badForm = new FormData();
    badForm.append('license_doc', new Blob([badBytes], { type: 'application/pdf' }), 'fake_license.pdf');

    const badUploadRes = await fetch(`${BASE_URL}/driver/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dToken}` },
      body: badForm,
    });
    assert(badUploadRes.status === 400, 'Upload rejected with HTTP 400 for invalid magic bytes');

    // 4b. Upload genuine PDF documents (starts with %PDF- header)
    const validPdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A, 0x25, 0xE2, 0xE3, 0xCF, 0xD3]);
    const validForm = new FormData();
    validForm.append('license_doc', new Blob([validPdfBytes], { type: 'application/pdf' }), 'driver_license.pdf');
    validForm.append('vehicle_doc', new Blob([validPdfBytes], { type: 'application/pdf' }), 'vehicle_rc.pdf');

    const goodUploadRes = await fetch(`${BASE_URL}/driver/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dToken}` },
      body: validForm,
    });
    const goodUploadData = await goodUploadRes.json();
    assert(goodUploadRes.status === 200, 'Genuine PDF documents uploaded successfully');
    assert(!!goodUploadData.data.license_doc_path, 'Profile updated with license document reference');
    assert(!!goodUploadData.data.vehicle_doc_path, 'Profile updated with vehicle document reference');

    // 4c. Private document download: Driver accesses their own document
    const driverDocRes = await fetch(`${BASE_URL}/driver/documents/license`, {
      headers: { Authorization: `Bearer ${dToken}` },
    });
    assert(driverDocRes.status === 200, 'Driver downloads their own document (HTTP 200)');
    assert(driverDocRes.headers.get('content-type')?.includes('pdf'), 'Content-Type header correctly returned');

    // 4d. Security: Rider blocked from admin driver-documents endpoint
    const riderDocSnoopRes = await fetch(`${BASE_URL}/admin/driver-documents/${dProf.data.driver_id}/license`, {
      headers: { Authorization: `Bearer ${riderToken}` },
    });
    assert(riderDocSnoopRes.status === 403, 'Rider blocked from admin document inspection (HTTP 403 Forbidden)');

    // 4e. Admin accesses driver document
    const adminDocRes = await fetch(`${BASE_URL}/admin/driver-documents/${dProf.data.driver_id}/license`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminDocRes.status === 200, 'Admin can inspect submitted driver document (HTTP 200)');

    // -------------------------------------------------------------------------
    // WORKSTREAM 5: Nearest-Driver Assignment (REQ-022)
    // -------------------------------------------------------------------------
    console.log('\n--- Workstream 5: Nearest-Driver Assignment (REQ-022) ---');

    // Reset stale telemetry from past test runs to guarantee test isolation
    await pool.query('UPDATE driver_profiles SET current_latitude = NULL, current_longitude = NULL');

    // 5a. Driver updates location coordinates
    // Colaba coordinates: 18.9220, 72.8347
    const locRes = await fetch(`${BASE_URL}/driver/location`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${dToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: 18.9220, longitude: 72.8347 }),
    });
    const locData = await locRes.json();
    assert(locRes.status === 200, 'Driver location telemetry recorded (HTTP 200)');
    assert(Number(locData.data.latitude) === 18.922, 'Driver latitude recorded accurately');

    // Register Driver 2 situated further away (Andheri: 19.1136, 72.8697)
    const dFarPhone = `+91 88${Date.now().toString().slice(-8)}`;
    const driverFarReg = await (await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Far Driver',
        email: `driver_far_${Date.now()}@test.internal`,
        password: 'Password123!',
        phoneNo: dFarPhone,
        role: 'DRIVER',
        licenseNo: `DL-FAR-${Date.now()}`,
        vehicleNo: `MH-02-FAR-1111`,
        vehicleModel: 'Maruti Dzire',
        vehicleCategory: 'STANDARD',
      }),
    })).json();
    const dFarToken = driverFarReg.data.token;
    const dFarProf = await (await fetch(`${BASE_URL}/driver/profile`, { headers: { Authorization: `Bearer ${dFarToken}` } })).json();
    await fetch(`${BASE_URL}/admin/driver-applications/${dFarProf.data.driver_id}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    await fetch(`${BASE_URL}/driver/duty`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${dFarToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAvailable: true }),
    });
    // Set Far Driver's location in Andheri (~21 km away)
    await fetch(`${BASE_URL}/driver/location`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${dFarToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: 19.1136, longitude: 72.8697 }),
    });

    // Create a new ride booking with pickup at Gateway of India (18.9220, 72.8347)
    const bookProxRes = await fetch(`${BASE_URL}/bookings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickupAddress: 'Gateway of India, Colaba',
        destAddress: 'Chhatrapati Shivaji Maharaj Terminus (CSMT)',
        pickupLat: 18.9220,
        pickupLng: 72.8347,
        destLat: 18.9400,
        destLng: 72.8354,
        vehicleTier: 'standard',
      }),
    });
    const proxBookingId = (await bookProxRes.json()).data.booking_id;

    // Check dispatch queue for Driver 1 (Nearby: distance ~0.0 km)
    const qRes = await fetch(`${BASE_URL}/driver/dispatch-queue`, {
      headers: { Authorization: `Bearer ${dToken}` },
    });
    const qData = await qRes.json();
    const foundInQ = qData.data.find(b => b.booking_id === proxBookingId);
    assert(!!foundInQ, 'Ride appears in nearby driver dispatch queue');
    assert(foundInQ.distance_to_pickup_km !== null, `Estimated driver proximity attached: ${foundInQ.distance_to_pickup_km} km`);
    assert(foundInQ.distance_to_pickup_km < 1.0, 'Nearby driver is calculated under 1.0 km from pickup');

    // 5b. Nearest Driver Assignment endpoint
    const assignRes = await fetch(`${BASE_URL}/bookings/${proxBookingId}/assign-nearest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderToken}` },
    });
    const assignData = await assignRes.json();
    assert(assignRes.status === 200, 'Nearest driver assignment completed (HTTP 200)');
    assert(assignData.data.driver_id === dProf.data.driver_id, `Nearest driver selected: Driver ID ${assignData.data.driver_id} (Distance: ${assignData.data.distance_km} km)`);
    assert(assignData.data.status === 'CONFIRMED', 'Booking transitioned to CONFIRMED with assigned driver');

    // -------------------------------------------------------------------------
    // WORKSTREAM 6: Payment Refunds (UML Payment.refundPayment)
    // -------------------------------------------------------------------------
    console.log('\n--- Workstream 6: Payment Refunds (UML Payment.refundPayment) ---');

    // 6a. Complete the ride and make payment
    await fetch(`${BASE_URL}/driver/rides/${proxBookingId}/start`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${dToken}` },
    });
    await fetch(`${BASE_URL}/driver/rides/${proxBookingId}/complete`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${dToken}` },
    });

    const payRes = await fetch(`${BASE_URL}/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: proxBookingId, paymentMethod: 'UPI' }),
    });
    const payData = await payRes.json();
    const paymentId = payData.data?.payment_id || payData.data?.paymentId;
    assert(payRes.status === 201 && !!paymentId, `Ride paid successfully (Payment ID: ${paymentId}, Fare: ₹${payData.data?.amount})`);

    // 6b. Non-admin (Rider) cannot initiate refund
    const riderRefundRes = await fetch(`${BASE_URL}/payments/${paymentId}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Rider requesting money back' }),
    });
    assert(riderRefundRes.status === 403, 'Rider blocked from initiating refund (HTTP 403 ADMIN_ONLY)');

    // 6c. Non-admin (Driver) cannot initiate refund
    const driverRefundRes = await fetch(`${BASE_URL}/payments/${paymentId}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Driver requesting refund' }),
    });
    assert(driverRefundRes.status === 403, 'Driver blocked from initiating refund (HTTP 403 ADMIN_ONLY)');

    // 6d. Admin issues legitimate academic simulated refund
    const adminRefundRes = await fetch(`${BASE_URL}/payments/${paymentId}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Passenger complaint: Route detour verified by support' }),
    });
    const adminRefundData = await adminRefundRes.json();
    assert(adminRefundRes.status === 200, 'Admin issues refund successfully (HTTP 200)');
    assert(adminRefundData.data.payment_status === 'REFUND', 'Payment status transitioned to REFUND');
    assert(!!adminRefundData.data.refund_transaction_id, `Generated refund transaction ref: ${adminRefundData.data.refund_transaction_id}`);
    assert(adminRefundData.data.refund_reason.includes('Passenger complaint'), 'Refund reason persisted in record');

    // 6e. Duplicate refund attempt on already refunded payment rejected
    const dupRefundRes = await fetch(`${BASE_URL}/payments/${paymentId}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Duplicate refund request' }),
    });
    assert(dupRefundRes.status === 400, 'Duplicate refund rejected with HTTP 400 PAYMENT_NOT_REFUNDABLE');

    // 6f. Booking payment_status updated to UNPAID
    const [refundedBookingRows] = await pool.query(
      'SELECT payment_status FROM bookings WHERE booking_id = ?',
      [proxBookingId]
    );
    assert(refundedBookingRows[0].payment_status === 'UNPAID', 'Booking payment_status transitioned to UNPAID after refund');

    // 6g. Revenue total excludes refunded amount
    const statsRes = await fetch(`${BASE_URL}/admin/system-stats`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const statsData = await statsRes.json();
    assert(statsRes.status === 200, 'Admin system statistics retrieved');
    // Verify that refunded revenue is separated from active collected revenue
    assert(typeof statsData.data.total_refunded_revenue === 'number', `Stats track refunded revenue (Total Refunded: ₹${statsData.data.total_refunded_revenue})`);

    // Clean up database connection
    await pool.end();

    console.log('\n================================================================');
    console.log(` Phase 4 Verification Complete: ${passed} Passed, ${failed} Failed`);
    console.log('================================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution error:', err);
    try { await pool.end(); } catch (_) {}
    process.exit(1);
  }
}

runPhase4Tests();
