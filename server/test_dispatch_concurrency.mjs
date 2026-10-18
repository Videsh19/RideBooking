import { getDbPool } from './src/config/db.js';

const BASE_URL = 'http://localhost:5000/api';
const pool = getDbPool();
const results = [];

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const data = await response.json();
  return { status: response.status, data };
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function main() {
  let adminToken;
  let riderToken;
  let driverId;
  let driverToken;
  const bookingIds = [];

  try {
    console.log('=== Automatic Dispatch Concurrency Test ===');

    const admin = await request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@goride.internal',
        password: 'AdminPassword123!',
      }),
    });
    if (admin.status !== 200) throw new Error('Admin login failed');
    adminToken = admin.data.data.token;

    const rider = await request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'rider@goride.internal',
        password: 'Password123!',
      }),
    });
    if (rider.status !== 200) throw new Error('Rider login failed');
    riderToken = rider.data.data.token;

    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const registered = await request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Dispatch Race ${suffix}`,
        email: `dispatch_race_${suffix}@test.internal`,
        password: 'Password123!',
        phoneNo: `+91 9${String(Date.now()).slice(-9)}`,
        role: 'DRIVER',
        licenseNo: `DL-RACE-${String(Date.now()).slice(-8)}`,
        vehicleNo: `MH-01-R${String(Date.now()).slice(-4)}`,
        vehicleModel: 'Dispatch Race Test Vehicle',
        vehicleCategory: 'STANDARD',
      }),
    });
    if (registered.status !== 201) {
      throw new Error(`Test driver registration failed: ${JSON.stringify(registered.data)}`);
    }
    driverToken = registered.data.data.token;

    const profile = await request('/driver/profile', {
      headers: auth(driverToken),
    });
    if (profile.status !== 200) throw new Error('Could not read test driver profile');
    driverId = profile.data.data.driver_id;

    const approval = await request(`/admin/driver-applications/${driverId}/approve`, {
      method: 'PATCH',
      headers: auth(adminToken),
    });
    if (approval.status !== 200) {
      throw new Error(`Test driver approval failed: ${JSON.stringify(approval.data)}`);
    }

    const duty = await request('/driver/duty', {
      method: 'PATCH',
      headers: { ...auth(driverToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAvailable: true }),
    });
    if (duty.status !== 200) throw new Error('Could not put test driver online');

    const location = await request('/driver/location', {
      method: 'PATCH',
      headers: { ...auth(driverToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: 18.9220,
        longitude: 72.8347,
        fixTimestampMs: Date.now(),
      }),
    });
    if (location.status !== 200) {
      throw new Error(`Could not set test driver location: ${JSON.stringify(location.data)}`);
    }

    async function createBooking() {
      const result = await request('/bookings', {
        method: 'POST',
        headers: { ...auth(riderToken), 'Content-Type': 'application/json' },
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
      if (result.status !== 201 || !result.data.data?.booking_id) {
        throw new Error(`Booking creation failed: ${JSON.stringify(result.data)}`);
      }
      bookingIds.push(result.data.data.booking_id);
    }

    await createBooking();
    await createBooking();
    console.log(`Created isolated test bookings: ${bookingIds.join(', ')}`);

    const dispatchResults = await Promise.all(
      bookingIds.map((id) =>
        request(`/bookings/${id}/assign-nearest`, {
          method: 'POST',
          headers: auth(adminToken),
        }).then((result) => ({ bookingId: id, ...result }))
      )
    );

    for (const result of dispatchResults) {
      console.log(
        `Booking ${result.bookingId}: HTTP ${result.status}; ` +
        `${JSON.stringify(result.data.data ?? result.data.error ?? result.data)}`
      );
    }

    const placeholders = bookingIds.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT driver_id, COUNT(*) AS active_count,
              GROUP_CONCAT(booking_id ORDER BY booking_id) AS booking_ids
       FROM bookings
       WHERE booking_id IN (${placeholders})
         AND driver_id IS NOT NULL
         AND status IN ('CONFIRMED', 'ONGOING')
       GROUP BY driver_id
       HAVING COUNT(*) > 1`,
      bookingIds
    );

    if (rows.length > 0) {
      console.error('[FAIL] A driver was assigned to multiple test rides:', rows);
      process.exitCode = 1;
    } else {
      console.log('[PASS] No driver is assigned to both test bookings.');
      console.log('[NOTE] This checks the invariant; it does not guarantee both requests selected the same driver.');
    }

    const [finalRows] = await pool.query(
      `SELECT booking_id, status, driver_id
       FROM bookings WHERE booking_id IN (${placeholders})
       ORDER BY booking_id`,
      bookingIds
    );
    console.log('Final MySQL booking state:', finalRows);
  } catch (error) {
    console.error('[ERROR]', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
