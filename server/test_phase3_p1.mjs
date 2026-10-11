const BASE_URL = 'http://localhost:5000/api';

async function runTests() {
  console.log('====================================================');
  console.log(' GoRide Phase 3 Part 1 - Verification Test Suite');
  console.log('====================================================\n');

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
    // 1. Health check
    const healthRes = await fetch(`${BASE_URL}/health`);
    const healthData = await healthRes.json();
    assert(
      healthRes.status === 200 && healthData.success && healthData.data?.status === 'operational',
      `Backend health probe is operational (HTTP ${healthRes.status}, status: ${healthData.data?.status})`
    );

    // 2. Test Admin public registration block
    const testAdminEmail = `hacker_${Date.now()}@test.internal`;
    const regAdminRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Malicious Admin',
        email: testAdminEmail,
        password: 'Password123!',
        phoneNo: '+91 9999999999',
        role: 'ADMIN'
      })
    });
    const regAdminData = await regAdminRes.json();
    assert(
      regAdminRes.status === 403 && regAdminData.error?.code === 'ADMIN_REGISTRATION_FORBIDDEN',
      `Public registration cannot create Admin (HTTP ${regAdminRes.status}, error code: ${regAdminData.error?.code})`
    );

    // 3. Test Rider public registration
    const testRiderEmail = `rider_${Date.now()}@test.internal`;
    const testRiderPhone = `+91 98${Date.now().toString().slice(-8)}`;
    const regRiderRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Rider',
        email: testRiderEmail,
        password: 'Password123!',
        phoneNo: testRiderPhone,
        role: 'RIDER'
      })
    });
    const regRiderData = await regRiderRes.json();
    assert(
      regRiderRes.status === 201 && regRiderData.data?.user?.role === 'RIDER',
      `Public registration creates Rider account with role 'RIDER' (User ID: ${regRiderData.data?.user?.user_id || regRiderData.data?.user?.id})`
    );

    // 4. Test Driver public registration (starts with status PENDING)
    const testDriverEmail = `driver_${Date.now()}@test.internal`;
    const testDriverPhone = `+91 97${Date.now().toString().slice(-8)}`;
    const regDriverRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'New Applicant Driver',
        email: testDriverEmail,
        password: 'Password123!',
        phoneNo: testDriverPhone,
        role: 'DRIVER',
        licenseNo: 'DL-TEST-9988',
        vehicleNo: 'KA-01-AB-1234',
        vehicleModel: 'Maruti Dzire White',
        vehicleCategory: 'STANDARD',
      })
    });
    const regDriverData = await regDriverRes.json();
    assert(
      regDriverRes.status === 201 && regDriverData.data?.user?.role === 'DRIVER',
      `Driver registration creates account with role 'DRIVER'`
    );

    // Check newly registered driver profile status
    const pendingDriverToken = regDriverData.data.token;
    const pendingProfRes = await fetch(`${BASE_URL}/driver/profile`, {
      headers: { Authorization: `Bearer ${pendingDriverToken}` }
    });
    const pendingProfData = await pendingProfRes.json();
    assert(
      pendingProfRes.status === 200 && pendingProfData.data?.approval_status === 'PENDING',
      `New driver profile status is 'PENDING' (${pendingProfData.data?.approval_status})`
    );

    // Verify pending driver CANNOT toggle duty
    const pendingDutyRes = await fetch(`${BASE_URL}/driver/duty`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pendingDriverToken}`
      },
      body: JSON.stringify({ isAvailable: true })
    });
    const pendingDutyData = await pendingDutyRes.json();
    assert(
      pendingDutyRes.status === 403 && pendingDutyData.error?.code === 'DRIVER_NOT_APPROVED',
      `Pending driver duty change is rejected with 403 DRIVER_NOT_APPROVED`
    );

    // 5. Test Seeded logins
    // 5a. Admin login
    const adminLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@goride.internal',
        password: 'AdminPassword123!'
      })
    });
    const adminLoginData = await adminLoginRes.json();
    assert(
      adminLoginRes.status === 200 && adminLoginData.data?.user?.role === 'ADMIN',
      `Admin login succeeds and returns role 'ADMIN'`
    );
    const adminToken = adminLoginData.data.token;

    // 5b. Approved Driver login
    const driverLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'driver@goride.internal',
        password: 'Password123!'
      })
    });
    const driverLoginData = await driverLoginRes.json();
    assert(
      driverLoginRes.status === 200 && driverLoginData.data?.user?.role === 'DRIVER',
      `Approved Driver login succeeds and returns role 'DRIVER'`
    );
    const driverToken = driverLoginData.data.token;

    // 5c. Rider login
    const riderLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'rider@goride.internal',
        password: 'Password123!'
      })
    });
    const riderLoginData = await riderLoginRes.json();
    assert(
      riderLoginRes.status === 200 && riderLoginData.data?.user?.role === 'RIDER',
      `Rider login succeeds and returns role 'RIDER'`
    );
    const riderToken = riderLoginData.data.token;

    // 6. Test RBAC Cross-Role Boundary Protections
    // 6a. Rider trying to access Admin endpoints
    const riderAdminRes = await fetch(`${BASE_URL}/admin/users`, {
      headers: { Authorization: `Bearer ${riderToken}` }
    });
    assert(riderAdminRes.status === 403, `Rider blocked from GET /api/admin/users (HTTP 403)`);

    // 6b. Rider trying to access Driver endpoints
    const riderDriverRes = await fetch(`${BASE_URL}/driver/profile`, {
      headers: { Authorization: `Bearer ${riderToken}` }
    });
    assert(riderDriverRes.status === 403, `Rider blocked from GET /api/driver/profile (HTTP 403)`);

    // 6c. Driver trying to access Admin endpoints
    const driverAdminRes = await fetch(`${BASE_URL}/admin/system-stats`, {
      headers: { Authorization: `Bearer ${driverToken}` }
    });
    assert(driverAdminRes.status === 403, `Driver blocked from GET /api/admin/system-stats (HTTP 403)`);

    // 6d. Driver trying to create Rider booking
    const driverBookingRes = await fetch(`${BASE_URL}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverToken}`
      },
      body: JSON.stringify({
        pickupAddress: 'Test Pickup',
        destAddress: 'Test Dropoff',
        pickupLat: 19.0760,
        pickupLng: 72.8777,
        destLat: 19.0596,
        destLng: 72.8295,
        vehicleTier: 'standard'
      })
    });
    assert(driverBookingRes.status === 403, `Driver blocked from POST /api/bookings (HTTP 403)`);

    // 6e. Admin accessing Admin endpoints (Allowed)
    const adminUsersRes = await fetch(`${BASE_URL}/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminUsersData = await adminUsersRes.json();
    assert(
      adminUsersRes.status === 200 && Array.isArray(adminUsersData.data) && adminUsersData.data.length > 0,
      `Admin successfully accesses GET /api/admin/users (found ${adminUsersData.data?.length} registered users in MySQL)`
    );

    const adminStatsRes = await fetch(`${BASE_URL}/admin/system-stats`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminStatsData = await adminStatsRes.json();
    assert(
      adminStatsRes.status === 200 && adminStatsData.data?.usersByRole?.length > 0,
      `Admin successfully accesses GET /api/admin/system-stats (real DB metrics retrieved)`
    );

    // 6f. Approved Driver accessing Driver duty toggle
    const driverDutyRes = await fetch(`${BASE_URL}/driver/duty`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverToken}`
      },
      body: JSON.stringify({ isAvailable: true })
    });
    const driverDutyData = await driverDutyRes.json();
    assert(
      driverDutyRes.status === 200 && driverDutyData.data?.is_available === true,
      `Approved driver successfully sets duty status to available (ONLINE)`
    );

    // 7. Regression Test on Rider Booking & Routing Features
    // 7a. Fare Estimation with real coordinates (Mumbai: CSMT to Bandra)
    const fareRes = await fetch(`${BASE_URL}/bookings/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickupAddress: 'Chhatrapati Shivaji Maharaj Terminus, Mumbai',
        destAddress: 'Bandra West, Mumbai',
        pickupLat: 18.9400,
        pickupLng: 72.8354,
        destLat: 19.0596,
        destLng: 72.8295,
        vehicleTier: 'standard'
      })
    });
    const fareData = await fareRes.json();
    assert(
      fareRes.status === 200 && fareData.data?.totalFare > 0,
      `Fare estimation calculates real route fare (Standard: ₹${fareData.data?.totalFare}, Distance: ${fareData.data?.distanceKm} km, Duration: ${fareData.data?.durationMinutes} min)`
    );

    // 7b. Rider creates a real booking
    const createBookingRes = await fetch(`${BASE_URL}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${riderToken}`
      },
      body: JSON.stringify({
        pickupAddress: 'Chhatrapati Shivaji Maharaj Terminus, Mumbai',
        destAddress: 'Bandra West, Mumbai',
        pickupLat: 18.9400,
        pickupLng: 72.8354,
        destLat: 19.0596,
        destLng: 72.8295,
        vehicleTier: 'standard'
      })
    });
    const createBookingData = await createBookingRes.json();
    assert(
      createBookingRes.status === 201 && createBookingData.data?.booking_id,
      `Authenticated Rider creates booking successfully (Booking ID: ${createBookingData.data?.booking_id}, Status: ${createBookingData.data?.status})`
    );
    const newBookingId = createBookingData.data?.booking_id;

    // 7c. Rider fetches my-trips history
    const myTripsRes = await fetch(`${BASE_URL}/bookings`, {
      headers: { Authorization: `Bearer ${riderToken}` }
    });
    const myTripsData = await myTripsRes.json();
    const hasBooking = myTripsData.data?.some(t => t.booking_id === newBookingId);
    assert(
      myTripsRes.status === 200 && hasBooking,
      `Rider trip history returns the newly created booking ID ${newBookingId}`
    );

    // 7d. Rider cancels the booking
    const cancelRes = await fetch(`${BASE_URL}/bookings/${newBookingId}/cancel`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${riderToken}`
      },
      body: JSON.stringify({ reason: 'Test verification cancellation' })
    });
    const cancelData = await cancelRes.json();
    assert(
      cancelRes.status === 200 && cancelData.data?.status === 'CANCELLED',
      `Rider cancels booking successfully (Booking status: ${cancelData.data?.status})`
    );

    console.log('\n====================================================');
    console.log(` Test Summary: ${passed} Passed, ${failed} Failed`);
    console.log('====================================================');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Fatal error during test run:', err);
    process.exit(1);
  }
}

runTests();
