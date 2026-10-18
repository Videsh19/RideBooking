const BASE_URL = 'http://localhost:5000/api';

async function runTests() {
  console.log('================================================================');
  console.log(' GoRide Phase 3 Part 3 - Verification Test Suite');
  console.log(' Payments Management & Post-Trip Ratings');
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
    // SETUP: Authenticate Administrator, Rider 1, Rider 2, and Driver Partner
    // -------------------------------------------------------------------------
    console.log('--- Setup: Account Authentication & Provisioning ---');

    // 1. Admin login
    const adminRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@goride.internal', password: 'AdminPassword123!' }),
    });
    const adminData = await adminRes.json();
    assert(adminRes.status === 200, 'Admin login succeeds');
    const adminToken = adminData.data.token;

    // 2. Rider 1 login
    const rider1Res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rider@goride.internal', password: 'Password123!' }),
    });
    const rider1Data = await rider1Res.json();
    assert(rider1Res.status === 200, 'Rider 1 login succeeds');
    const rider1Token = rider1Data.data.token;
    const rider1Id = rider1Data.data.user.user_id;

    // 3. Register Rider 2 (for cross-user isolation tests)
    const rider2Email = `rider2_${Date.now()}@test.internal`;
    const rider2Res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Rider Two (Cross-User)',
        email: rider2Email,
        password: 'Password123!',
        phoneNo: `+91 95${Date.now().toString().slice(-8)}`,
        role: 'RIDER',
      }),
    });
    const rider2Data = await rider2Res.json();
    assert(rider2Res.status === 201, 'Rider 2 registration succeeds');
    const rider2Token = rider2Data.data.token;

    // 4. Register and Approve Driver Partner
    const driverEmail = `driver_p3_${Date.now()}@test.internal`;
    const driverRegRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Phase 3 Partner Driver',
        email: driverEmail,
        password: 'Password123!',
        phoneNo: `+91 96${Date.now().toString().slice(-8)}`,
        role: 'DRIVER',
        licenseNo: 'DL-MH-2026-P3',
        vehicleNo: 'MH-03-P3-9999',
        vehicleModel: 'Hyundai Aura',
        vehicleCategory: 'STANDARD',
      }),
    });
    const driverRegData = await driverRegRes.json();
    assert(driverRegRes.status === 201, 'Driver registration succeeds');
    const driverToken = driverRegData.data.token;

    // Get Driver Profile to obtain driver_id
    const profRes = await fetch(`${BASE_URL}/driver/profile`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    const profData = await profRes.json();
    const driverProfileId = profData.data.driver_id;

    // Admin approves driver
    const approveRes = await fetch(`${BASE_URL}/admin/driver-applications/${driverProfileId}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    });
    assert(approveRes.status === 200, 'Admin approves test driver partner');

    // Driver goes online
    const dutyRes = await fetch(`${BASE_URL}/driver/duty`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${driverToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAvailable: true }),
    });
    assert(dutyRes.status === 200, 'Approved driver sets duty status to ONLINE');

    // Helper: Create a completed ride with assigned driver
    async function createCompletedTrip(riderTokenToUse) {
      // 1. Create booking
      const bookRes = await fetch(`${BASE_URL}/bookings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${riderTokenToUse}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickupAddress: 'Gateway of India, Colaba',
          destAddress: 'Bandra Kurla Complex (BKC)',
          vehicleTier: 'standard',
        }),
      });
      const bookData = await bookRes.json();
      const bId = bookData.data.booking_id;

      // 2. Driver accepts
      await fetch(`${BASE_URL}/driver/rides/${bId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${driverToken}` },
      });

      // 3. Driver starts
      await fetch(`${BASE_URL}/driver/rides/${bId}/start`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${driverToken}` },
      });

      // 4. Driver completes
      const compRes = await fetch(`${BASE_URL}/driver/rides/${bId}/complete`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${driverToken}` },
      });
      const compData = await compRes.json();

      return {
        bookingId: bId,
        booking: compData.data,
        totalFare: compData.data.total_fare,
      };
    }

    // -------------------------------------------------------------------------
    // TEST SECTION 1: Payment Security, Authentication & Role Boundaries
    // -------------------------------------------------------------------------
    console.log('\n--- Test Section 1: Payment Security & Authorization ---');

    // 1. Unauthenticated users cannot initiate payment
    const unauthPayRes = await fetch(`${BASE_URL}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: 1, paymentMethod: 'UPI' }),
    });
    assert(unauthPayRes.status === 401, 'Unauthenticated payment attempt rejected (HTTP 401)');

    // 2. Create Completed Trip 1 for Rider 1
    const trip1 = await createCompletedTrip(rider1Token);
    assert(trip1.booking.status === 'COMPLETED', `Trip #1 completed successfully (Booking ID: ${trip1.bookingId}, Fare: ₹${trip1.totalFare})`);

    // 3. Driver cannot access private rider payment data
    const driverPayViewRes = await fetch(`${BASE_URL}/payments/booking/${trip1.bookingId}`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    assert(driverPayViewRes.status === 403, 'Driver blocked from viewing private rider payment records (HTTP 403)');

    // 4. Rider 2 cannot pay for Rider 1's booking
    const crossPayRes = await fetch(`${BASE_URL}/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${rider2Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: trip1.bookingId, paymentMethod: 'UPI' }),
    });
    assert(crossPayRes.status === 403, 'Rider cannot pay for another passenger’s booking (HTTP 403)');

    // 5. Rider 2 cannot view Rider 1's payment details
    const crossPayViewRes = await fetch(`${BASE_URL}/payments/booking/${trip1.bookingId}`, {
      headers: { Authorization: `Bearer ${rider2Token}` },
    });
    assert(crossPayViewRes.status === 403, 'Rider cannot view payment details of another rider’s booking (HTTP 403)');

    // -------------------------------------------------------------------------
    // TEST SECTION 2: Ride Status Eligibility for Payment
    // -------------------------------------------------------------------------
    console.log('\n--- Test Section 2: Ride Status Eligibility for Payment ---');

    // Create a new booking in REQUESTED status
    const reqBookRes = await fetch(`${BASE_URL}/bookings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${rider1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickupAddress: 'Gateway of India, Colaba',
        destAddress: 'Worli Sea Face',
        vehicleTier: 'standard',
      }),
    });
    const reqBookData = await reqBookRes.json();
    const reqBookingId = reqBookData.data.booking_id;

    // Payment on REQUESTED ride rejected
    const payReqRes = await fetch(`${BASE_URL}/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${rider1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: reqBookingId, paymentMethod: 'UPI' }),
    });
    assert(payReqRes.status === 400, 'Payment for REQUESTED booking rejected (HTTP 400 INVALID_BOOKING_STATUS)');

    // Driver accepts -> CONFIRMED status
    await fetch(`${BASE_URL}/driver/rides/${reqBookingId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${driverToken}` },
    });

    // Payment on CONFIRMED ride rejected
    const payConfRes = await fetch(`${BASE_URL}/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${rider1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: reqBookingId, paymentMethod: 'UPI' }),
    });
    assert(payConfRes.status === 400, 'Payment for CONFIRMED booking rejected (HTTP 400 INVALID_BOOKING_STATUS)');

    // Driver starts -> ONGOING status
    await fetch(`${BASE_URL}/driver/rides/${reqBookingId}/start`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${driverToken}` },
    });

    // Payment on ONGOING ride rejected
    const payOngRes = await fetch(`${BASE_URL}/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${rider1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: reqBookingId, paymentMethod: 'UPI' }),
    });
    assert(payOngRes.status === 400, 'Payment for ONGOING booking rejected (HTTP 400 INVALID_BOOKING_STATUS)');

    // Complete reqBookingId so driver is free for subsequent trips
    await fetch(`${BASE_URL}/driver/rides/${reqBookingId}/complete`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${driverToken}` },
    });

    // -------------------------------------------------------------------------
    // TEST SECTION 3: Simulated Payment Processing, Fare Source of Truth & Retries
    // -------------------------------------------------------------------------
    console.log('\n--- Test Section 3: Simulated Payment Processing & Retry Policy ---');

    // 1. Client supplies manipulated amount (e.g., ₹1 instead of real fare)
    // Server must use strictly the database fare
    const clientManipulatedAmount = 1.0;
    const failSimPayRes = await fetch(`${BASE_URL}/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${rider1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId: trip1.bookingId,
        paymentMethod: 'UPI',
        amount: clientManipulatedAmount, // Intentionally manipulated
        simulateFailure: true,            // Test deterministic simulated failure
      }),
    });
    const failSimPayData = await failSimPayRes.json();
    assert(failSimPayRes.status === 402, 'Simulated failure returns HTTP 402 PAYMENT_SIMULATION_FAILED');
    assert(failSimPayData.data?.amount === Number(trip1.totalFare), `Stored MySQL fare (₹${trip1.totalFare}) used instead of manipulated client amount (₹${clientManipulatedAmount})`);
    assert(failSimPayData.data?.paymentStatus === 'FAILED', 'Simulated failure recorded with status FAILED');

    // Verify booking is still UNPAID
    const checkBookingUnpaid = await fetch(`${BASE_URL}/bookings/${trip1.bookingId}`, {
      headers: { Authorization: `Bearer ${rider1Token}` },
    });
    const checkBookingData = await checkBookingUnpaid.json();
    assert(checkBookingData.data.payment_status === 'UNPAID', 'Booking remains UNPAID after failed payment attempt');

    // 2. Retry simulated payment with SUCCESS
    const retryPayRes = await fetch(`${BASE_URL}/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${rider1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId: trip1.bookingId,
        paymentMethod: 'Card',
        simulateFailure: false,
      }),
    });
    const retryPayData = await retryPayRes.json();
    assert(retryPayRes.status === 201, 'Retried payment succeeds (HTTP 201)');
    assert(retryPayData.data.paymentStatus === 'SUCCESS', 'Payment status is terminal SUCCESS');
    assert(retryPayData.data.transactionId.startsWith('TXN-GORIDE-'), `Generated demo transaction reference: ${retryPayData.data.transactionId}`);
    assert(Number(retryPayData.data.amount) === Number(trip1.totalFare), `Charged amount strictly matches MySQL booking total_fare (₹${trip1.totalFare})`);

    // Verify booking updated to PAID
    const checkBookingPaid = await fetch(`${BASE_URL}/bookings/${trip1.bookingId}`, {
      headers: { Authorization: `Bearer ${rider1Token}` },
    });
    const checkPaidData = await checkBookingPaid.json();
    assert(checkPaidData.data.payment_status === 'PAID', 'Booking payment_status successfully transitioned to PAID');
    assert(checkPaidData.data.transaction_id === retryPayData.data.transactionId, 'Booking returns linked transaction ID');

    // -------------------------------------------------------------------------
    // TEST SECTION 4: Duplicate & Concurrent Payment Prevention
    // -------------------------------------------------------------------------
    console.log('\n--- Test Section 4: Duplicate & Concurrent Payment Prevention ---');

    // 1. Repeated payment on already-paid booking must be rejected
    const dupPayRes = await fetch(`${BASE_URL}/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${rider1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId: trip1.bookingId,
        paymentMethod: 'UPI',
      }),
    });
    assert(dupPayRes.status === 409, 'Duplicate payment on already-paid booking rejected with HTTP 409 ALREADY_PAID');

    // 2. Test concurrent payment race condition on a fresh completed booking
    const trip2 = await createCompletedTrip(rider1Token);
    assert(trip2.booking.status === 'COMPLETED', `Trip #2 completed (Booking ID: ${trip2.bookingId})`);

    // Fire 2 simultaneous payment requests
    const [concurrentRes1, concurrentRes2] = await Promise.all([
      fetch(`${BASE_URL}/payments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${rider1Token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: trip2.bookingId, paymentMethod: 'UPI' }),
      }),
      fetch(`${BASE_URL}/payments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${rider1Token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: trip2.bookingId, paymentMethod: 'Card' }),
      }),
    ]);

    const statusCodes = [concurrentRes1.status, concurrentRes2.status].sort();
    assert(statusCodes[0] === 201 && statusCodes[1] === 409, `Concurrency test: Exactly 1 payment succeeded (201) and 1 was rejected (409). Actual: [${statusCodes.join(', ')}]`);

    // Verify Rider payment list endpoint
    const myPaymentsRes = await fetch(`${BASE_URL}/payments/my-payments`, {
      headers: { Authorization: `Bearer ${rider1Token}` },
    });
    const myPaymentsData = await myPaymentsRes.json();
    assert(myPaymentsRes.status === 200, 'Rider retrieves payment history list');
    assert(myPaymentsData.data.length >= 2, `Rider payment history contains ${myPaymentsData.data.length} transactions`);

    // Verify Admin payment governance endpoint
    const adminPaymentsRes = await fetch(`${BASE_URL}/payments/admin/all`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminPaymentsData = await adminPaymentsRes.json();
    assert(adminPaymentsRes.status === 200, 'Admin accesses network payment ledger');
    assert(Number(adminPaymentsData.summary.totalSettledRevenue) > 0, `Admin summary reports collected revenue: ₹${adminPaymentsData.summary.totalSettledRevenue}`);

    // -------------------------------------------------------------------------
    // TEST SECTION 5: Post-Trip Rating Eligibility & Scale Constraints
    // -------------------------------------------------------------------------
    console.log('\n--- Test Section 5: Post-Trip Rating Eligibility & Scale Constraints ---');

    // 1. Unauthenticated rating attempt rejected
    const unauthRateRes = await fetch(`${BASE_URL}/ratings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: trip1.bookingId, rating: 5 }),
    });
    assert(unauthRateRes.status === 401, 'Unauthenticated rating attempt rejected (HTTP 401)');

    // 2. Rider cannot rate an uncompleted booking (create a fresh REQUESTED booking)
    const freshReqRes = await fetch(`${BASE_URL}/bookings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${rider1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickupAddress: 'Gateway of India, Colaba',
        destAddress: 'Chhatrapati Shivaji Maharaj Terminus (CST)',
        vehicleTier: 'standard',
      }),
    });
    const freshReqData = await freshReqRes.json();
    const freshReqId = freshReqData.data.booking_id;

    const rateIncompleteRes = await fetch(`${BASE_URL}/ratings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${rider1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: freshReqId, rating: 5 }),
    });
    assert(rateIncompleteRes.status === 400, 'Rating incomplete booking rejected (HTTP 400 INVALID_BOOKING_STATUS)');

    // 3. Rider 2 cannot rate Rider 1's booking
    const crossRateRes = await fetch(`${BASE_URL}/ratings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${rider2Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: trip1.bookingId, rating: 5 }),
    });
    assert(crossRateRes.status === 403, 'Rider cannot rate another passenger’s booking (HTTP 403 FORBIDDEN)');

    // 4. Invalid rating values outside 1-5 scale rejected
    const rateZeroRes = await fetch(`${BASE_URL}/ratings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${rider1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: trip1.bookingId, rating: 0 }),
    });
    assert(rateZeroRes.status === 400, 'Rating 0 stars rejected (HTTP 400 INVALID_RATING_VALUE)');

    const rateSixRes = await fetch(`${BASE_URL}/ratings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${rider1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: trip1.bookingId, rating: 6 }),
    });
    assert(rateSixRes.status === 400, 'Rating 6 stars rejected (HTTP 400 INVALID_RATING_VALUE)');

    const invalidRatingCases = [
      { body: { bookingId: trip1.bookingId, rating: 2.5 }, label: 'Fractional rating' },
      { body: { bookingId: trip1.bookingId, rating: '4abc' }, label: 'Suffixed string rating' },
      { body: { bookingId: trip1.bookingId, rating: null }, label: 'Null rating' },
      { body: { bookingId: trip1.bookingId }, label: 'Missing rating' },
    ];
    for (const { body, label } of invalidRatingCases) {
      const invalidRateRes = await fetch(`${BASE_URL}/ratings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${rider1Token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const invalidRateData = await invalidRateRes.json();
      assert(
        invalidRateRes.status === 400 &&
          invalidRateData.error?.code === 'INVALID_RATING_VALUE',
        `${label} rejected (HTTP 400 INVALID_RATING_VALUE)`
      );
    }

    // 5. Successful post-trip rating submission
    const validRateRes = await fetch(`${BASE_URL}/ratings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${rider1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId: trip1.bookingId,
        rating: 5,
        comments: 'Excellent driving, on time pickup, and very polite driver!',
      }),
    });
    const validRateData = await validRateRes.json();
    assert(validRateRes.status === 201, 'Rider rates completed trip successfully (HTTP 201)');
    assert(validRateData.data.rating === 5, 'Rating score persists as 5 stars');
    assert(validRateData.data.comments.includes('polite driver'), 'Written review comments persist');

    // 6. Duplicate rating prevention
    const dupRateRes = await fetch(`${BASE_URL}/ratings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${rider1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: trip1.bookingId, rating: 4 }),
    });
    assert(dupRateRes.status === 409, 'Duplicate rating for same booking rejected with HTTP 409 ALREADY_RATED');

    // -------------------------------------------------------------------------
    // TEST SECTION 6: Driver Aggregate Rating & Immutability
    // -------------------------------------------------------------------------
    console.log('\n--- Test Section 6: Driver Aggregate Rating Calculation ---');

    // Submit second rating on Trip 2 (e.g. 4 stars)
    const rate2Res = await fetch(`${BASE_URL}/ratings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${rider1Token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId: trip2.bookingId,
        rating: 4,
        comments: 'Good ride, smooth navigation.',
      }),
    });
    const rate2Data = await rate2Res.json();
    assert(rate2Res.status === 201, 'Rider rates second trip with 4 stars');

    // Expected average: (5 + 4) / 2 = 4.50
    assert(rate2Data.data.driverNewRating === 4.5, `Driver running average calculated correctly: ${rate2Data.data.driverNewRating} stars`);

    // Verify driver profile reflects new rating in database
    const driverProfileRes = await fetch(`${BASE_URL}/driver/profile`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    const driverProfileData = await driverProfileRes.json();
    assert(Number(driverProfileData.data.rating) === 4.5, `Driver profile API returns updated aggregate rating: ${driverProfileData.data.rating}`);

    // Verify rating query by booking
    const getRatingRes = await fetch(`${BASE_URL}/ratings/booking/${trip1.bookingId}`, {
      headers: { Authorization: `Bearer ${rider1Token}` },
    });
    const getRatingData = await getRatingRes.json();
    assert(getRatingRes.status === 200, 'Rating retrieved by booking ID');
    assert(getRatingData.data.rating === 5, 'Persisted rating matches submitted score (5 stars)');

    // Verify rider bookings list returns payment and rating details
    const listBookingsRes = await fetch(`${BASE_URL}/bookings`, {
      headers: { Authorization: `Bearer ${rider1Token}` },
    });
    const listBookingsData = await listBookingsRes.json();
    const ratedBooking = listBookingsData.data.find((b) => b.booking_id === trip1.bookingId);
    assert(ratedBooking?.payment_status === 'PAID', 'Bookings list returns payment_status: PAID');
    assert(ratedBooking?.rider_rating === 5, 'Bookings list returns rider_rating: 5');
    assert(Boolean(ratedBooking?.transaction_id), `Bookings list returns transaction ID: ${ratedBooking?.transaction_id}`);

    console.log('\n================================================================');
    console.log(` Test Suite Complete: ${passed} Passed, ${failed} Failed`);
    console.log('================================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('UNEXPECTED TEST SUITE ERROR:', err);
    process.exit(1);
  }
}

runTests();
