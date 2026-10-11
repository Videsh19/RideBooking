const BASE_URL = 'http://localhost:5000/api';

async function runTests() {
  console.log('================================================================');
  console.log(' GoRide Phase 3 Part 2 - Verification Test Suite');
  console.log(' Driver Management, Application Approval, Dispatch & Lifecycle');
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
    // 0. Setup: Log in Administrator
    const adminLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@goride.internal', password: 'AdminPassword123!' }),
    });
    const adminLoginData = await adminLoginRes.json();
    assert(adminLoginRes.status === 200, 'Admin login succeeds');
    const adminToken = adminLoginData.data.token;

    // 0b. Setup: Log in Demo Passenger Rider
    const riderLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rider@goride.internal', password: 'Password123!' }),
    });
    const riderLoginData = await riderLoginRes.json();
    assert(riderLoginRes.status === 200, 'Rider login succeeds');
    const riderToken = riderLoginData.data.token;

    // -------------------------------------------------------------------------
    // TEST SECTION 1: Driver Application Onboarding and Admin Approval / Rejection
    // -------------------------------------------------------------------------
    console.log('\n--- Test Section 1: Driver Application & Admin Approval/Rejection ---');

    // 1a. Register Driver 1 (for Approval testing)
    const driverEmail1 = `driver_test1_${Date.now()}@test.internal`;
    const regDriver1Res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Applicant Driver 1',
        email: driverEmail1,
        password: 'Password123!',
        phoneNo: `+91 91${Date.now().toString().slice(-8)}`,
        role: 'DRIVER',
        licenseNo: 'DL-MH-2026-001',
        vehicleNo: 'MH-01-AB-1001',
        vehicleModel: 'Hyundai Aura White',
        vehicleCategory: 'STANDARD',
      }),
    });
    const regDriver1Data = await regDriver1Res.json();
    assert(regDriver1Res.status === 201, 'Driver 1 registers successfully');
    const driver1Token = regDriver1Data.data.token;

    // 1b. Check Driver 1 starts with PENDING status
    const prof1Res = await fetch(`${BASE_URL}/driver/profile`, {
      headers: { Authorization: `Bearer ${driver1Token}` },
    });
    const prof1Data = await prof1Res.json();
    const driver1Id = prof1Data.data.driver_id;
    assert(prof1Data.data.approval_status === 'PENDING', `Driver 1 profile is PENDING (Driver ID: ${driver1Id})`);

    // 1c. Register Driver 2 (for Rejection testing)
    const driverEmail2 = `driver_test2_${Date.now()}@test.internal`;
    const regDriver2Res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Applicant Driver 2',
        email: driverEmail2,
        password: 'Password123!',
        phoneNo: `+91 92${Date.now().toString().slice(-8)}`,
        role: 'DRIVER',
        licenseNo: 'DL-MH-2026-002',
        vehicleNo: 'MH-01-AB-1002',
        vehicleModel: 'Maruti WagonR Silver',
        vehicleCategory: 'STANDARD',
      }),
    });
    const regDriver2Data = await regDriver2Res.json();
    assert(regDriver2Res.status === 201, 'Driver 2 registers successfully');
    const driver2Token = regDriver2Data.data.token;

    const prof2Res = await fetch(`${BASE_URL}/driver/profile`, {
      headers: { Authorization: `Bearer ${driver2Token}` },
    });
    const prof2Data = await prof2Res.json();
    const driver2Id = prof2Data.data.driver_id;

    // 1d. Admin lists pending driver applications
    const pendingAppsRes = await fetch(`${BASE_URL}/admin/driver-applications`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const pendingAppsData = await pendingAppsRes.json();
    const hasDriver1 = pendingAppsData.data.some((a) => a.driver_id === driver1Id);
    const hasDriver2 = pendingAppsData.data.some((a) => a.driver_id === driver2Id);
    assert(
      pendingAppsRes.status === 200 && hasDriver1 && hasDriver2,
      `Admin lists pending applications and finds Driver 1 & Driver 2 (Total pending: ${pendingAppsData.data.length})`
    );

    // 1e. Admin approves Driver 1
    const approve1Res = await fetch(`${BASE_URL}/admin/driver-applications/${driver1Id}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const approve1Data = await approve1Res.json();
    assert(
      approve1Res.status === 200 && approve1Data.data.approval_status === 'APPROVED',
      `Admin approves Driver 1 (approval_status: ${approve1Data.data.approval_status})`
    );

    // 1f. Admin rejects Driver 2
    const reject2Res = await fetch(`${BASE_URL}/admin/driver-applications/${driver2Id}/reject`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'Commercial insurance policy document expired.' }),
    });
    const reject2Data = await reject2Res.json();
    assert(
      reject2Res.status === 200 && reject2Data.data.approval_status === 'REJECTED',
      `Admin rejects Driver 2 (approval_status: ${reject2Data.data.approval_status})`
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 2: Backend Enforcement of Driver Approval and Duty Status
    // -------------------------------------------------------------------------
    console.log('\n--- Test Section 2: Approval Status Enforcement on Shift Controls ---');

    // 2a. Rejected Driver 2 cannot go online
    const duty2Res = await fetch(`${BASE_URL}/driver/duty`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${driver2Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isAvailable: true }),
    });
    const duty2Data = await duty2Res.json();
    assert(
      duty2Res.status === 403 && duty2Data.error?.code === 'DRIVER_NOT_APPROVED',
      `Rejected driver blocked from going online (HTTP 403, error: ${duty2Data.error?.code})`
    );

    // 2b. Approved Driver 1 successfully goes online
    const duty1Res = await fetch(`${BASE_URL}/driver/duty`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${driver1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isAvailable: true }),
    });
    const duty1Data = await duty1Res.json();
    assert(
      duty1Res.status === 200 && duty1Data.data.is_available === true,
      `Approved Driver 1 successfully sets duty status to ONLINE (is_available: true)`
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 3: Role Boundaries on Driver & Admin Operations
    // -------------------------------------------------------------------------
    console.log('\n--- Test Section 3: Role Boundary Protections ---');

    // 3a. Rider blocked from approving driver applications
    const riderApproveRes = await fetch(`${BASE_URL}/admin/driver-applications/${driver1Id}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${riderToken}` },
    });
    assert(riderApproveRes.status === 403, 'Rider blocked from Admin application approval (HTTP 403)');

    // 3b. Driver blocked from Admin driver applications list
    const driverListAppsRes = await fetch(`${BASE_URL}/admin/driver-applications`, {
      headers: { Authorization: `Bearer ${driver1Token}` },
    });
    assert(driverListAppsRes.status === 403, 'Driver blocked from viewing Admin application list (HTTP 403)');

    // 3c. Rider blocked from Driver dispatch queue
    const riderQueueRes = await fetch(`${BASE_URL}/driver/dispatch-queue`, {
      headers: { Authorization: `Bearer ${riderToken}` },
    });
    assert(riderQueueRes.status === 403, 'Rider blocked from GET /api/driver/dispatch-queue (HTTP 403)');

    // -------------------------------------------------------------------------
    // TEST SECTION 4: Ride Dispatch, Queue Visibility, and Decline Strategy
    // -------------------------------------------------------------------------
    console.log('\n--- Test Section 4: Ride Dispatch, Queue Visibility & Decline Strategy ---');

    // 4a. Passenger Rider creates a new booking
    const booking1Res = await fetch(`${BASE_URL}/bookings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${riderToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pickupAddress: 'Gateway of India, Colaba',
        destAddress: 'Bandra Kurla Complex (BKC)',
        pickupLat: 18.9220,
        pickupLng: 72.8347,
        destLat: 19.0607,
        destLng: 72.8547,
        vehicleTier: 'standard',
      }),
    });
    const booking1Data = await booking1Res.json();
    const testBookingId = booking1Data.data.booking_id;
    assert(
      booking1Res.status === 201 && testBookingId,
      `Passenger creates ride booking #${testBookingId} with status 'REQUESTED'`
    );

    // 4b. Driver 1 retrieves dispatch queue and sees booking #testBookingId
    const queue1Res = await fetch(`${BASE_URL}/driver/dispatch-queue`, {
      headers: { Authorization: `Bearer ${driver1Token}` },
    });
    const queue1Data = await queue1Res.json();
    const foundInQueue1 = queue1Data.data.some((b) => b.booking_id === testBookingId);
    assert(
      queue1Res.status === 200 && foundInQueue1,
      `Driver 1 sees ride #${testBookingId} in live dispatch queue (Route: Gateway of India -> BKC, Fare: ₹${booking1Data.data.total_fare})`
    );

    // 4c. Driver 1 declines/rejects the ride offer
    const rejectOfferRes = await fetch(`${BASE_URL}/driver/rides/${testBookingId}/reject`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${driver1Token}` },
    });
    const rejectOfferData = await rejectOfferRes.json();
    assert(
      rejectOfferRes.status === 200 && rejectOfferData.success,
      `Driver 1 declines ride offer #${testBookingId}`
    );

    // 4d. Verify ride is no longer in Driver 1's dispatch queue
    const queue1AfterRes = await fetch(`${BASE_URL}/driver/dispatch-queue`, {
      headers: { Authorization: `Bearer ${driver1Token}` },
    });
    const queue1AfterData = await queue1AfterRes.json();
    const stillInQueue1 = queue1AfterData.data.some((b) => b.booking_id === testBookingId);
    assert(
      !stillInQueue1,
      `Ride #${testBookingId} is removed from Driver 1's dispatch queue`
    );

    // 4e. Verify rider booking is NOT cancelled and remains in REQUESTED status
    const riderCheckRes = await fetch(`${BASE_URL}/bookings/${testBookingId}`, {
      headers: { Authorization: `Bearer ${riderToken}` },
    });
    const riderCheckData = await riderCheckRes.json();
    assert(
      riderCheckData.data.status === 'REQUESTED' && riderCheckData.data.driver_id === null,
      `Rider's booking #${testBookingId} remains intact with status 'REQUESTED' (not cancelled by driver decline)`
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 5: Competing Drivers & Concurrent Acceptance Race Condition
    // -------------------------------------------------------------------------
    console.log('\n--- Test Section 5: Competing Acceptance & Concurrency Protection ---');

    // Setup: Register and approve Driver 3 and Driver 4
    const driverEmail3 = `driver_test3_${Date.now()}@test.internal`;
    const reg3 = await (await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Applicant Driver 3',
        email: driverEmail3,
        password: 'Password123!',
        phoneNo: `+91 93${Date.now().toString().slice(-8)}`,
        role: 'DRIVER',
        licenseNo: 'DL-MH-2026-003',
        vehicleNo: 'MH-02-CD-3003',
        vehicleModel: 'Honda Amaze Grey',
        vehicleCategory: 'STANDARD',
      }),
    })).json();
    const driver3Token = reg3.data.token;
    const prof3 = await (await fetch(`${BASE_URL}/driver/profile`, { headers: { Authorization: `Bearer ${driver3Token}` } })).json();
    await fetch(`${BASE_URL}/admin/driver-applications/${prof3.data.driver_id}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    await fetch(`${BASE_URL}/driver/duty`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${driver3Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAvailable: true }),
    });

    const driverEmail4 = `driver_test4_${Date.now()}@test.internal`;
    const reg4 = await (await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Applicant Driver 4',
        email: driverEmail4,
        password: 'Password123!',
        phoneNo: `+91 94${Date.now().toString().slice(-8)}`,
        role: 'DRIVER',
        licenseNo: 'DL-MH-2026-004',
        vehicleNo: 'MH-03-EF-4004',
        vehicleModel: 'Toyota Etios Blue',
        vehicleCategory: 'STANDARD',
      }),
    })).json();
    const driver4Token = reg4.data.token;
    const prof4 = await (await fetch(`${BASE_URL}/driver/profile`, { headers: { Authorization: `Bearer ${driver4Token}` } })).json();
    await fetch(`${BASE_URL}/admin/driver-applications/${prof4.data.driver_id}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    await fetch(`${BASE_URL}/driver/duty`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${driver4Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAvailable: true }),
    });

    // Both Driver 3 and Driver 4 attempt to accept booking #testBookingId concurrently
    const [accept3Res, accept4Res] = await Promise.all([
      fetch(`${BASE_URL}/driver/rides/${testBookingId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${driver3Token}` },
      }),
      fetch(`${BASE_URL}/driver/rides/${testBookingId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${driver4Token}` },
      }),
    ]);

    const accept3Status = accept3Res.status;
    const accept4Status = accept4Res.status;
    const oneAccepted = (accept3Status === 200 && accept4Status === 409) || (accept3Status === 409 && accept4Status === 200);

    assert(
      oneAccepted,
      `Transactional row lock guaranteed exactly one driver won acceptance (Status codes: ${accept3Status} vs ${accept4Status})`
    );

    const winnerToken = accept3Status === 200 ? driver3Token : driver4Token;
    const loserToken = accept3Status === 200 ? driver4Token : driver3Token;
    const winnerDriverId = accept3Status === 200 ? prof3.data.driver_id : prof4.data.driver_id;

    // -------------------------------------------------------------------------
    // TEST SECTION 6: Ride Lifecycle State Machine (CONFIRMED -> ONGOING -> COMPLETED)
    // -------------------------------------------------------------------------
    console.log('\n--- Test Section 6: Ride Lifecycle State Machine & Driver Authorization ---');

    // 6a. Non-assigned driver attempts to start the ride
    const loserStartRes = await fetch(`${BASE_URL}/driver/rides/${testBookingId}/start`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${loserToken}` },
    });
    assert(loserStartRes.status === 403, 'Non-assigned driver blocked from starting the ride (HTTP 403 UNAUTHORIZED_DRIVER)');

    // 6b. Assigned winning driver starts the ride (CONFIRMED -> ONGOING)
    const winnerStartRes = await fetch(`${BASE_URL}/driver/rides/${testBookingId}/start`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${winnerToken}` },
    });
    const winnerStartData = await winnerStartRes.json();
    assert(
      winnerStartRes.status === 200 && winnerStartData.data.status === 'ONGOING',
      `Assigned driver starts trip: status transitioned to 'ONGOING'`
    );

    // 6c. Invalid transition: cannot start an already ONGOING ride
    const repeatStartRes = await fetch(`${BASE_URL}/driver/rides/${testBookingId}/start`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${winnerToken}` },
    });
    assert(
      repeatStartRes.status === 400,
      'Attempting to start an already ONGOING ride returns HTTP 400 INVALID_STATUS_TRANSITION'
    );

    // 6d. Rider attempts to cancel while ONGOING (should be rejected)
    const riderCancelOngoingRes = await fetch(`${BASE_URL}/bookings/${testBookingId}/cancel`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${riderToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'Changed mind mid-trip' }),
    });
    const riderCancelOngoingData = await riderCancelOngoingRes.json();
    assert(
      riderCancelOngoingRes.status === 400 && riderCancelOngoingData.error?.code === 'CANNOT_CANCEL_ONGOING',
      `Rider cancellation blocked while ride is ONGOING (HTTP 400, code: ${riderCancelOngoingData.error?.code})`
    );

    // 6e. Non-assigned driver attempts to complete the ride
    const loserCompleteRes = await fetch(`${BASE_URL}/driver/rides/${testBookingId}/complete`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${loserToken}` },
    });
    assert(loserCompleteRes.status === 403, 'Non-assigned driver blocked from completing the ride (HTTP 403)');

    // 6f. Assigned winning driver completes the ride (ONGOING -> COMPLETED)
    const winnerCompleteRes = await fetch(`${BASE_URL}/driver/rides/${testBookingId}/complete`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${winnerToken}` },
    });
    const winnerCompleteData = await winnerCompleteRes.json();
    assert(
      winnerCompleteRes.status === 200 && winnerCompleteData.data.status === 'COMPLETED',
      `Assigned driver completes trip: status transitioned to 'COMPLETED'`
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 7: Rider Transparency & Driver History / Earnings Ledger
    // -------------------------------------------------------------------------
    console.log('\n--- Test Section 7: Rider Transparency & Driver Earnings Ledger ---');

    // 7a. Rider views booking details and sees COMPLETED status + assigned driver details
    const riderFinalBookingRes = await fetch(`${BASE_URL}/bookings/${testBookingId}`, {
      headers: { Authorization: `Bearer ${riderToken}` },
    });
    const riderFinalBookingData = await riderFinalBookingRes.json();
    const finalBk = riderFinalBookingData.data;
    assert(
      riderFinalBookingRes.status === 200 &&
        finalBk.status === 'COMPLETED' &&
        finalBk.driver_id === winnerDriverId &&
        Boolean(finalBk.driver_name) &&
        Boolean(finalBk.driver_vehicle_no) &&
        Boolean(finalBk.completed_at),
      `Rider views completed booking with assigned driver info and completed_at (Driver: ${finalBk.driver_name}, Vehicle: ${finalBk.driver_vehicle_no})`
    );

    // 7b. Winning driver checks history and sees their completed trip
    const winnerHistoryRes = await fetch(`${BASE_URL}/driver/rides/history`, {
      headers: { Authorization: `Bearer ${winnerToken}` },
    });
    const winnerHistoryData = await winnerHistoryRes.json();
    const winnerHist = winnerHistoryData.data;
    const hasTripInWinnerHist = winnerHist.trips.some((t) => t.booking_id === testBookingId);
    assert(
      winnerHistoryRes.status === 200 && hasTripInWinnerHist,
      `Winning driver sees their completed trip GR-BK-${testBookingId} in their ledger`
    );

    // 7c. Non-assigned driver does NOT see this completed trip
    const loserHistoryRes = await fetch(`${BASE_URL}/driver/rides/history`, {
      headers: { Authorization: `Bearer ${loserToken}` },
    });
    const loserHistoryData = await loserHistoryRes.json();
    const loserHist = loserHistoryData.data;
    const hasTripInLoserHist = loserHist.trips.some((t) => t.booking_id === testBookingId);
    assert(
      !hasTripInLoserHist,
      `Other driver (Driver ID ${loserToken === driver3Token ? prof3.data.driver_id : prof4.data.driver_id}) does NOT see Driver ${winnerDriverId}'s completed booking (Ledger Isolation verified)`
    );

    // 7d. Completed booking retains assigned driver in database
    assert(
      finalBk.driver_id === winnerDriverId,
      `Completed booking GR-BK-${testBookingId} retains assigned driver ID ${winnerDriverId}`
    );

    // 7e. No duplicate bookings in driver ledger
    const tripIds = winnerHist.trips.map((t) => t.booking_id);
    const uniqueTripIds = new Set(tripIds);
    assert(
      tripIds.length === uniqueTripIds.size,
      `Driver ledger contains no duplicate bookings (${tripIds.length} total, ${uniqueTripIds.size} unique)`
    );

    // 7f. Earnings calculation strictly equals sum of eligible trips
    const calculatedSum = winnerHist.trips.reduce((sum, t) => sum + Number(t.total_fare), 0);
    assert(
      Math.abs(calculatedSum - winnerHist.totalEarnings) < 0.01,
      `Driver total earnings (₹${winnerHist.totalEarnings}) accurately match sum of completed trips (₹${calculatedSum})`
    );

    // 7g. Same reference and final status between rider and driver
    const winningTripRecord = winnerHist.trips.find((t) => t.booking_id === testBookingId);
    assert(
      winningTripRecord && winningTripRecord.status === finalBk.status && winningTripRecord.booking_id === finalBk.booking_id,
      `Rider and Driver consoles display identical booking reference (GR-BK-${testBookingId}) and final status (COMPLETED)`
    );

    // -------------------------------------------------------------------------
    // TEST SECTION 8: Regression on Phase 2 OSRM Fare Estimation & Cancellation
    // -------------------------------------------------------------------------
    console.log('\n--- Test Section 8: Phase 2 Routing & Booking Regression ---');

    // 8a. Fare estimation with coordinates
    const fareRes = await fetch(`${BASE_URL}/bookings/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickupAddress: 'Marine Drive Promenade',
        destAddress: 'Chhatrapati Shivaji Maharaj International Airport (T2)',
        pickupLat: 18.9432,
        pickupLng: 72.8230,
        destLat: 19.0896,
        destLng: 72.8656,
        vehicleTier: 'comfort',
      }),
    });
    const fareData = await fareRes.json();
    assert(
      fareRes.status === 200 && fareData.data.totalFare > 0 && fareData.data.distanceKm > 0,
      `OSRM Road routing & fare estimation operational (Comfort fare: ₹${fareData.data.totalFare}, Distance: ${fareData.data.distanceKm} km)`
    );

    // 8b. Create and cancel booking before assignment (in REQUESTED state)
    const cancelTestRes = await fetch(`${BASE_URL}/bookings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${riderToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pickupAddress: 'Marine Drive Promenade',
        destAddress: 'Chhatrapati Shivaji Maharaj International Airport (T2)',
        pickupLat: 18.9432,
        pickupLng: 72.8230,
        destLat: 19.0896,
        destLng: 72.8656,
        vehicleTier: 'comfort',
      }),
    });
    const cancelTestData = await cancelTestRes.json();
    const cancelBookingId = cancelTestData.data.booking_id;

    const doCancelRes = await fetch(`${BASE_URL}/bookings/${cancelBookingId}/cancel`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${riderToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'Test pre-pickup cancellation' }),
    });
    const doCancelData = await doCancelRes.json();
    assert(
      doCancelRes.status === 200 && doCancelData.data.status === 'CANCELLED',
      `Passenger cancels REQUESTED booking #${cancelBookingId} successfully`
    );

    console.log('\n================================================================');
    console.log(` Test Suite Complete: ${passed} Passed, ${failed} Failed`);
    console.log('================================================================');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Fatal error during test run:', err);
    process.exit(1);
  }
}

runTests();
