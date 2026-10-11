import { getDbPool } from './src/config/db.js';

const BASE_URL = 'http://localhost:5000/api';
const pool = getDbPool();

async function runVehicleCategoryTests() {
  console.log('================================================================');
  console.log(' GoRide - Vehicle Category Classification & Booking Enforcement');
  console.log(' Automated Verification Suite (Tests 1 - 12)');
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
    // SETUP: Authenticate Administrator and Passenger Rider
    // -------------------------------------------------------------------------
    console.log('--- Setup: Authenticating Admin and Rider Accounts ---');

    const adminRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@goride.internal', password: 'AdminPassword123!' }),
    });
    const adminData = await adminRes.json();
    assert(adminRes.status === 200, 'Admin login succeeds');
    const adminToken = adminData.data.token;

    const riderRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rider@goride.internal', password: 'Password123!' }),
    });
    const riderData = await riderRes.json();
    assert(riderRes.status === 200, 'Rider login succeeds');
    const riderToken = riderData.data.token;

    // Helper: Register, approve, and set driver duty
    async function setupDriver(namePrefix, category) {
      const email = `driver_${namePrefix.toLowerCase()}_${Date.now()}_${Math.floor(Math.random()*1000)}@test.internal`;
      const phoneNo = `+91 9${Math.floor(100000000 + Math.random() * 900000000)}`;
      const regRes = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${namePrefix} Driver`,
          email,
          password: 'Password123!',
          phoneNo,
          role: 'DRIVER',
          licenseNo: `DL-${namePrefix.toUpperCase()}-${Date.now().toString().slice(-6)}`,
          vehicleNo: `MH-01-${namePrefix.toUpperCase().slice(0, 2)}-${Math.floor(1000 + Math.random() * 9000)}`,
          vehicleModel: `${category} Class Vehicle`,
          vehicleCategory: category,
        }),
      });
      const regData = await regRes.json();
      if (regRes.status !== 201) {
        throw new Error(`Driver setup failed for ${namePrefix}: ${JSON.stringify(regData)}`);
      }
      const token = regData.data.token;

      // Get driver profile
      const profRes = await fetch(`${BASE_URL}/driver/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const profData = await profRes.json();
      const driverId = profData.data.driver_id;

      // Admin approves driver
      const appRes = await fetch(`${BASE_URL}/admin/driver-applications/${driverId}/approve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (appRes.status !== 200) {
        throw new Error(`Admin approve driver failed: ${appRes.status}`);
      }

      // Driver goes online
      await fetch(`${BASE_URL}/driver/duty`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAvailable: true }),
      });

      return { token, driverId, email, phoneNo, profile: profData.data };
    }

    // -------------------------------------------------------------------------
    // TEST 1: Driver registration saves the chosen category
    // -------------------------------------------------------------------------
    console.log('\n--- Test 1: Driver Registration Persists Chosen Category ---');
    const comfortDriver = await setupDriver('Comfort1', 'COMFORT');
    assert(comfortDriver.profile.vehicle_category === 'COMFORT', 'Driver registration saved vehicle_category as COMFORT in profile response');

    const [dbDriverRow] = await pool.query(
      'SELECT vehicle_category, approval_status FROM driver_profiles WHERE driver_id = ?',
      [comfortDriver.driverId]
    );
    assert(dbDriverRow[0]?.vehicle_category === 'COMFORT', 'MySQL driver_profiles record directly contains vehicle_category = COMFORT');

    // -------------------------------------------------------------------------
    // TEST 2: Invalid categories are rejected
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Invalid Categories Are Rejected ---');
    // 2a: Driver registration with invalid category
    const badCatDriverRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Invalid Cat Driver',
        email: `bad_cat_${Date.now()}@test.internal`,
        password: 'Password123!',
        phoneNo: `+91 9${Math.floor(100000000 + Math.random() * 900000000)}`,
        role: 'DRIVER',
        licenseNo: `DL-BAD-${Date.now().toString().slice(-4)}`,
        vehicleNo: 'MH-01-XX-9999',
        vehicleModel: 'Luxury Cruiser',
        vehicleCategory: 'LUXURY',
      }),
    });
    const badCatDriverData = await badCatDriverRes.json();
    assert(
      badCatDriverRes.status === 400 && badCatDriverData.error?.code === 'INVALID_VEHICLE_CATEGORY',
      `Driver registration with 'LUXURY' rejected with HTTP 400 INVALID_VEHICLE_CATEGORY`
    );

    // 2b: Fare estimation with invalid category
    const badEstimateRes = await fetch(`${BASE_URL}/bookings/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickupAddress: 'Gateway of India, Colaba',
        destAddress: 'Dadar Western Railway Station',
        vehicleTier: 'SUPER_CAR',
      }),
    });
    const badEstimateData = await badEstimateRes.json();
    assert(
      badEstimateRes.status === 400 && badEstimateData.error?.code === 'INVALID_VEHICLE_CATEGORY',
      `Fare estimation with 'SUPER_CAR' rejected with HTTP 400 INVALID_VEHICLE_CATEGORY`
    );

    // 2c: Booking creation with invalid category
    const badBookingRes = await fetch(`${BASE_URL}/bookings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickupAddress: 'Gateway of India, Colaba',
        destAddress: 'Dadar Western Railway Station',
        pickupLat: 18.9220,
        pickupLng: 72.8347,
        destLat: 19.0180,
        destLng: 72.8444,
        vehicleTier: 'HELICOPTER',
      }),
    });
    const badBookingData = await badBookingRes.json();
    assert(
      badBookingRes.status === 400 && badBookingData.error?.code === 'INVALID_VEHICLE_CATEGORY',
      `Booking creation with 'HELICOPTER' rejected with HTTP 400 INVALID_VEHICLE_CATEGORY`
    );

    // -------------------------------------------------------------------------
    // TEST 3: Rider bookings persist the selected category
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: Rider Bookings Persist the Selected Category ---');
    const bookXlRes = await fetch(`${BASE_URL}/bookings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickupAddress: 'Gateway of India, Colaba',
        destAddress: 'Bandra Kurla Complex (BKC)',
        pickupLat: 18.9220,
        pickupLng: 72.8347,
        destLat: 19.0607,
        destLng: 72.8547,
        vehicleTier: 'XL',
      }),
    });
    const bookXlData = await bookXlRes.json();
    const xlBookingId = bookXlData.data?.booking_id;
    assert(bookXlRes.status === 201 && !!xlBookingId, `Rider creates XL booking #${xlBookingId}`);
    assert(bookXlData.data?.vehicle_tier === 'XL', 'Created booking returns vehicle_tier = XL');

    const [dbBookingRow] = await pool.query(
      'SELECT vehicle_tier, total_fare FROM bookings WHERE booking_id = ?',
      [xlBookingId]
    );
    assert(dbBookingRow[0]?.vehicle_tier === 'XL', 'MySQL bookings record persisted vehicle_tier as XL');

    // -------------------------------------------------------------------------
    // TEST 4: Fare estimation respects category-specific rules
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Fare Estimation Respects Category-Specific Rules ---');
    // For 10.00 km:
    // STANDARD: 50 + 10*15 = 200 (min 70)
    // COMFORT:  80 + 10*22 = 300 (min 110)
    // XL:      130 + 10*32 = 450 (min 180)
    const [estStdRes, estComRes, estXlRes] = await Promise.all([
      fetch(`${BASE_URL}/bookings/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickupAddress: 'Gateway of India, Colaba',
          destAddress: 'Bandra Kurla Complex (BKC)',
          vehicleTier: 'STANDARD',
        }),
      }),
      fetch(`${BASE_URL}/bookings/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickupAddress: 'Gateway of India, Colaba',
          destAddress: 'Bandra Kurla Complex (BKC)',
          vehicleTier: 'COMFORT',
        }),
      }),
      fetch(`${BASE_URL}/bookings/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickupAddress: 'Gateway of India, Colaba',
          destAddress: 'Bandra Kurla Complex (BKC)',
          vehicleTier: 'XL',
        }),
      }),
    ]);
    const estStd = await estStdRes.json();
    const estCom = await estComRes.json();
    const estXl = await estXlRes.json();

    assert(
      estStd.data.ratePerKm === 15 && estStd.data.baseFare === 50,
      `STANDARD fare parameters verified: base ₹50, rate ₹15/km (Total: ₹${estStd.data.totalFare})`
    );
    assert(
      estCom.data.ratePerKm === 22 && estCom.data.baseFare === 80,
      `COMFORT fare parameters verified: base ₹80, rate ₹22/km (Total: ₹${estCom.data.totalFare})`
    );
    assert(
      estXl.data.ratePerKm === 32 && estXl.data.baseFare === 130,
      `XL fare parameters verified: base ₹130, rate ₹32/km (Total: ₹${estXl.data.totalFare})`
    );
    assert(
      estStd.data.totalFare < estCom.data.totalFare && estCom.data.totalFare < estXl.data.totalFare,
      `Category pricing hierarchy verified: STANDARD (₹${estStd.data.totalFare}) < COMFORT (₹${estCom.data.totalFare}) < XL (₹${estXl.data.totalFare})`
    );

    // Setup 1 Standard driver, 1 Comfort driver (already created), and 1 XL driver
    const standardDriver = await setupDriver('Standard1', 'STANDARD');
    const xlDriver = await setupDriver('Xl1', 'XL');

    // -------------------------------------------------------------------------
    // TEST 5: Standard bookings exclude Comfort and XL drivers
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Standard Bookings Exclude Comfort and XL Drivers ---');
    const bookStdRes = await fetch(`${BASE_URL}/bookings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickupAddress: 'Gateway of India, Colaba',
        destAddress: 'Marine Drive Promenade',
        pickupLat: 18.9220,
        pickupLng: 72.8347,
        destLat: 18.9432,
        destLng: 72.8230,
        vehicleTier: 'STANDARD',
      }),
    });
    const stdBookingId = (await bookStdRes.json()).data.booking_id;

    // Check queues:
    const qStdForStd = (await (await fetch(`${BASE_URL}/driver/dispatch-queue`, { headers: { Authorization: `Bearer ${standardDriver.token}` } })).json()).data;
    const qStdForCom = (await (await fetch(`${BASE_URL}/driver/dispatch-queue`, { headers: { Authorization: `Bearer ${comfortDriver.token}` } })).json()).data;
    const qStdForXl = (await (await fetch(`${BASE_URL}/driver/dispatch-queue`, { headers: { Authorization: `Bearer ${xlDriver.token}` } })).json()).data;

    assert(qStdForStd.some(b => b.booking_id === stdBookingId), `Standard driver sees STANDARD booking #${stdBookingId}`);
    assert(!qStdForCom.some(b => b.booking_id === stdBookingId), `Comfort driver excluded from STANDARD booking #${stdBookingId}`);
    assert(!qStdForXl.some(b => b.booking_id === stdBookingId), `XL driver excluded from STANDARD booking #${stdBookingId}`);

    // -------------------------------------------------------------------------
    // TEST 6: Comfort bookings exclude Standard and XL drivers
    // -------------------------------------------------------------------------
    console.log('\n--- Test 6: Comfort Bookings Exclude Standard and XL Drivers ---');
    const bookComRes = await fetch(`${BASE_URL}/bookings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickupAddress: 'Worli Sea Face',
        destAddress: 'Dadar Western Railway Station',
        pickupLat: 19.0068,
        pickupLng: 72.8159,
        destLat: 19.0180,
        destLng: 72.8444,
        vehicleTier: 'COMFORT',
      }),
    });
    const comBookingId = (await bookComRes.json()).data.booking_id;

    const qComForCom = (await (await fetch(`${BASE_URL}/driver/dispatch-queue`, { headers: { Authorization: `Bearer ${comfortDriver.token}` } })).json()).data;
    const qComForStd = (await (await fetch(`${BASE_URL}/driver/dispatch-queue`, { headers: { Authorization: `Bearer ${standardDriver.token}` } })).json()).data;
    const qComForXl = (await (await fetch(`${BASE_URL}/driver/dispatch-queue`, { headers: { Authorization: `Bearer ${xlDriver.token}` } })).json()).data;

    assert(qComForCom.some(b => b.booking_id === comBookingId), `Comfort driver sees COMFORT booking #${comBookingId}`);
    assert(!qComForStd.some(b => b.booking_id === comBookingId), `Standard driver excluded from COMFORT booking #${comBookingId}`);
    assert(!qComForXl.some(b => b.booking_id === comBookingId), `XL driver excluded from COMFORT booking #${comBookingId}`);

    // -------------------------------------------------------------------------
    // TEST 7: XL bookings exclude Standard and Comfort drivers
    // -------------------------------------------------------------------------
    console.log('\n--- Test 7: XL Bookings Exclude Standard and Comfort Drivers ---');
    const qXlForXl = (await (await fetch(`${BASE_URL}/driver/dispatch-queue`, { headers: { Authorization: `Bearer ${xlDriver.token}` } })).json()).data;
    const qXlForStd = (await (await fetch(`${BASE_URL}/driver/dispatch-queue`, { headers: { Authorization: `Bearer ${standardDriver.token}` } })).json()).data;
    const qXlForCom = (await (await fetch(`${BASE_URL}/driver/dispatch-queue`, { headers: { Authorization: `Bearer ${comfortDriver.token}` } })).json()).data;

    assert(qXlForXl.some(b => b.booking_id === xlBookingId), `XL driver sees XL booking #${xlBookingId}`);
    assert(!qXlForStd.some(b => b.booking_id === xlBookingId), `Standard driver excluded from XL booking #${xlBookingId}`);
    assert(!qXlForCom.some(b => b.booking_id === xlBookingId), `Comfort driver excluded from XL booking #${xlBookingId}`);

    // -------------------------------------------------------------------------
    // TEST 8: Direct API attempts by incompatible drivers are rejected
    // -------------------------------------------------------------------------
    console.log('\n--- Test 8: Direct API Attempts by Incompatible Drivers Rejected ---');
    // Standard driver attempts to accept COMFORT booking
    const badAccept1Res = await fetch(`${BASE_URL}/driver/rides/${comBookingId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${standardDriver.token}` },
    });
    const badAccept1Data = await badAccept1Res.json();
    assert(
      badAccept1Res.status === 403 && badAccept1Data.error?.code === 'INCOMPATIBLE_VEHICLE_CATEGORY',
      `Standard driver direct accept on COMFORT booking rejected with HTTP 403 INCOMPATIBLE_VEHICLE_CATEGORY`
    );

    // Comfort driver attempts to accept XL booking
    const badAccept2Res = await fetch(`${BASE_URL}/driver/rides/${xlBookingId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${comfortDriver.token}` },
    });
    const badAccept2Data = await badAccept2Res.json();
    assert(
      badAccept2Res.status === 403 && badAccept2Data.error?.code === 'INCOMPATIBLE_VEHICLE_CATEGORY',
      `Comfort driver direct accept on XL booking rejected with HTTP 403 INCOMPATIBLE_VEHICLE_CATEGORY`
    );

    // XL driver attempts to accept STANDARD booking
    const badAccept3Res = await fetch(`${BASE_URL}/driver/rides/${stdBookingId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${xlDriver.token}` },
    });
    const badAccept3Data = await badAccept3Res.json();
    assert(
      badAccept3Res.status === 403 && badAccept3Data.error?.code === 'INCOMPATIBLE_VEHICLE_CATEGORY',
      `XL driver direct accept on STANDARD booking rejected with HTTP 403 INCOMPATIBLE_VEHICLE_CATEGORY`
    );

    // -------------------------------------------------------------------------
    // TEST 9: Unclassified legacy drivers cannot receive category-specific bookings
    // -------------------------------------------------------------------------
    console.log('\n--- Test 9: Unclassified Legacy Drivers Blocked from Queue & Acceptance ---');
    // Create legacy driver with NULL vehicle_category in database
    const legacyDriver = await setupDriver('Legacy', 'STANDARD');
    await pool.query('UPDATE driver_profiles SET vehicle_category = NULL WHERE driver_id = ?', [legacyDriver.driverId]);

    // Unclassified driver checks dispatch queue -> must be empty
    const legQRes = await fetch(`${BASE_URL}/driver/dispatch-queue`, {
      headers: { Authorization: `Bearer ${legacyDriver.token}` },
    });
    const legQData = await legQRes.json();
    assert(
      legQRes.status === 200 && Array.isArray(legQData.data) && legQData.data.length === 0,
      'Unclassified legacy driver receives empty dispatch queue (length: 0)'
    );

    // Unclassified driver direct acceptance -> rejected HTTP 403
    const legAcceptRes = await fetch(`${BASE_URL}/driver/rides/${stdBookingId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${legacyDriver.token}` },
    });
    const legAcceptData = await legAcceptRes.json();
    assert(
      legAcceptRes.status === 403 && legAcceptData.error?.code === 'INCOMPATIBLE_VEHICLE_CATEGORY',
      `Unclassified driver direct accept rejected with HTTP 403 INCOMPATIBLE_VEHICLE_CATEGORY (message: ${legAcceptData.error?.message})`
    );

    // -------------------------------------------------------------------------
    // TEST 10: No-compatible-driver behavior handled correctly
    // -------------------------------------------------------------------------
    console.log('\n--- Test 10: No-Compatible-Driver Behavior Handled Without Silent Substitution ---');
    // Put XL driver offline so no XL drivers are available
    await fetch(`${BASE_URL}/driver/duty`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${xlDriver.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAvailable: false }),
    });

    const assignNoXlRes = await fetch(`${BASE_URL}/bookings/${xlBookingId}/assign-nearest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderToken}` },
    });
    const assignNoXlData = await assignNoXlRes.json();
    assert(
      assignNoXlRes.status === 200 &&
        assignNoXlData.data?.assigned === false &&
        assignNoXlData.data?.compatibleDriversFound === false,
      `No-compatible-driver result returned: assigned=false, compatibleDriversFound=false (Message: "${assignNoXlData.data?.message}")`
    );

    // Verify booking is still in REQUESTED status and has NOT been assigned to Standard or Comfort drivers
    const [checkUnassignedBk] = await pool.query('SELECT status, driver_id FROM bookings WHERE booking_id = ?', [xlBookingId]);
    assert(
      checkUnassignedBk[0]?.status === 'REQUESTED' && checkUnassignedBk[0]?.driver_id === null,
      'Booking remains unassigned in REQUESTED status with driver_id = NULL (No silent category substitution)'
    );

    // -------------------------------------------------------------------------
    // TEST 11: Concurrent acceptance allows at most one driver to win
    // -------------------------------------------------------------------------
    console.log('\n--- Test 11: Concurrent Acceptance Allows at Most One Driver to Win ---');
    // Setup second Comfort driver
    const comfortDriver2 = await setupDriver('Comfort2', 'COMFORT');

    // Both ComfortDriver 1 and ComfortDriver 2 attempt to accept comBookingId concurrently
    const [raceRes1, raceRes2] = await Promise.all([
      fetch(`${BASE_URL}/driver/rides/${comBookingId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${comfortDriver.token}` },
      }),
      fetch(`${BASE_URL}/driver/rides/${comBookingId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${comfortDriver2.token}` },
      }),
    ]);

    const status1 = raceRes1.status;
    const status2 = raceRes2.status;
    const exactlyOneWinner = (status1 === 200 && status2 === 409) || (status1 === 409 && status2 === 200);

    assert(
      exactlyOneWinner,
      `Concurrent acceptance resolved atomically: exactly one driver won (Statuses: ${status1} vs ${status2})`
    );

    const winningComfortDriverToken = status1 === 200 ? comfortDriver.token : comfortDriver2.token;

    // -------------------------------------------------------------------------
    // TEST 12: Existing ride lifecycle, payment, rating, and cancellation work
    // -------------------------------------------------------------------------
    console.log('\n--- Test 12: Ride Lifecycle, Payment, Rating & Cancellation Remain Functional ---');
    // 12a. Winning driver starts the ride (CONFIRMED -> ONGOING)
    const startRideRes = await fetch(`${BASE_URL}/driver/rides/${comBookingId}/start`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${winningComfortDriverToken}` },
    });
    const startRideData = await startRideRes.json();
    assert(
      startRideRes.status === 200 && startRideData.data?.status === 'ONGOING',
      `Winning driver started trip: status transitioned to ONGOING`
    );

    // 12b. Winning driver completes the ride (ONGOING -> COMPLETED)
    const completeRideRes = await fetch(`${BASE_URL}/driver/rides/${comBookingId}/complete`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${winningComfortDriverToken}` },
    });
    const completeRideData = await completeRideRes.json();
    assert(
      completeRideRes.status === 200 && completeRideData.data?.status === 'COMPLETED',
      `Winning driver completed trip: status transitioned to COMPLETED`
    );

    // 12c. Passenger makes payment (COMPLETED ride)
    const payRes = await fetch(`${BASE_URL}/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: comBookingId, paymentMethod: 'UPI' }),
    });
    const payData = await payRes.json();
    assert(
      payRes.status === 201 && payData.data?.payment_status === 'SUCCESS',
      `Simulated UPI payment settled (Payment ID: ${payData.data?.payment_id || payData.data?.paymentId}, Amount: ₹${payData.data?.amount})`
    );

    // 12d. Passenger submits post-trip rating
    const rateRes = await fetch(`${BASE_URL}/ratings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId: comBookingId,
        rating: 5,
        comments: 'Excellent Comfort ride, very clean vehicle!',
      }),
    });
    const rateData = await rateRes.json();
    assert(
      rateRes.status === 201 && rateData.data?.rating === 5,
      `Post-trip 5-star rating submitted and recorded for booking #${comBookingId}`
    );

    // 12e. Passenger cancels an unassigned ride booking (stdBookingId)
    const cancelRes = await fetch(`${BASE_URL}/bookings/${stdBookingId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Changed mind before assignment' }),
    });
    const cancelData = await cancelRes.json();
    assert(
      cancelRes.status === 200 && cancelData.data?.status === 'CANCELLED',
      `Unassigned ride #${stdBookingId} cancelled successfully (Cancellation fee: ₹${cancelData.data?.cancellation_fee || 0})`
    );

    // Close database pool
    await pool.end();

    console.log('\n================================================================');
    console.log(` Vehicle Categories Test Suite Completed: ${passed} Passed, ${failed} Failed`);
    console.log('================================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution aborted due to unexpected error:', err);
    try { await pool.end(); } catch (_) {}
    process.exit(1);
  }
}

runVehicleCategoryTests();
