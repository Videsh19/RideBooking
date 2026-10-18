import path from 'path';
import { getDbPool } from '../config/db.js';
import { getBookingById } from './bookingService.js';
import { UPLOADS_DIR } from '../middleware/uploadMiddleware.js';

const LOCATION_FIX_MAX_AGE_MS = 5 * 60 * 1000;
const LOCATION_FIX_MAX_FUTURE_MS = 30 * 1000;

/**
 * Haversine distance calculation between two (lat, lon) coordinates in kilometers
 */
export function calculateHaversineKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const numLat1 = Number(lat1);
  const numLon1 = Number(lon1);
  const numLat2 = Number(lat2);
  const numLon2 = Number(lon2);
  if (isNaN(numLat1) || isNaN(numLon1) || isNaN(numLat2) || isNaN(numLon2)) return null;

  const R = 6371; // Earth radius in km
  const dLat = ((numLat2 - numLat1) * Math.PI) / 180;
  const dLon = ((numLon2 - numLon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((numLat1 * Math.PI) / 180) *
    Math.cos((numLat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

/**
 * Retrieve driver partner profile joined with user account
 */
export async function getDriverProfile(userId) {
  const pool = getDbPool();
  const [rows] = await pool.query(
    `SELECT d.driver_id, d.user_id, u.name, u.email, u.phone_no,
            d.license_no, d.vehicle_no, d.vehicle_model, d.vehicle_category,
            d.vehicle_color, d.passenger_capacity, d.vehicle_approval_status, d.is_vehicle_active,
            d.license_doc_path, d.vehicle_doc_path,
            d.current_latitude, d.current_longitude, d.location_updated_at,
            d.rating, d.is_available, d.approval_status, d.created_at
     FROM driver_profiles d
     JOIN users u ON d.user_id = u.user_id
     WHERE d.user_id = ?`,
    [userId]
  );

  if (rows.length === 0) {
    throw { statusCode: 404, code: 'PROFILE_NOT_FOUND', message: 'Driver partner profile not found.' };
  }

  return rows[0];
}

/**
 * Update driver availability duty status
 */
export async function setDriverDuty(userId, isAvailable) {
  if (typeof isAvailable !== 'boolean') {
    throw {
      statusCode: 400,
      code: 'INVALID_DUTY_STATUS',
      message: 'isAvailable must be a boolean.',
    };
  }

  const profile = await getDriverProfile(userId);

  if (profile.approval_status !== 'APPROVED') {
    throw {
      statusCode: 403,
      code: 'DRIVER_NOT_APPROVED',
      message: 'Cannot toggle duty status. Your driver partner account is pending administrative verification.',
    };
  }

  const availableBool = Boolean(isAvailable);
  if (availableBool && (profile.vehicle_approval_status !== 'APPROVED' || !profile.is_vehicle_active)) {
    throw {
      statusCode: 403,
      code: 'VEHICLE_NOT_ACTIVE',
      message: 'Cannot toggle duty status. Your assigned vehicle is either pending approval or deactivated by administration.',
    };
  }

  const pool = getDbPool();
  await pool.query(
    'UPDATE driver_profiles SET is_available = ? WHERE user_id = ?',
    [availableBool, userId]
  );

  return { is_available: availableBool };
}

/**
 * Retrieve eligible ride requests in the dispatch queue for an approved, online driver
 */
export async function getAvailableDispatchQueue(userId) {
  const profile = await getDriverProfile(userId);

  if (profile.approval_status !== 'APPROVED' || !profile.is_available) {
    return [];
  }

  // Ensure unapproved or inactive vehicles cannot receive assignments
  if (profile.vehicle_approval_status !== 'APPROVED' || !profile.is_vehicle_active) {
    return [];
  }

  // Unclassified drivers cannot receive category-specific bookings
  if (!profile.vehicle_category) {
    return [];
  }

  const pool = getDbPool();

  // If driver currently has an active ride in CONFIRMED or ONGOING status, they should focus on that ride
  const [activeCheck] = await pool.query(
    `SELECT booking_id FROM bookings WHERE driver_id = ? AND status IN ('CONFIRMED', 'ONGOING') LIMIT 1`,
    [profile.driver_id]
  );
  if (activeCheck.length > 0) {
    return [];
  }

  // Retrieve unassigned bookings in REQUESTED status matching driver's vehicle category
  const [rows] = await pool.query(
    `SELECT
       b.booking_id,
       b.user_id,
       u.name AS passenger_name,
       u.phone_no AS passenger_phone,
       b.pickup_address,
       b.dest_address,
       b.pickup_zone,
       b.dest_zone,
       b.vehicle_tier,
       b.vehicle_tier AS vehicle_category,
       b.status,
       b.total_fare,
       b.booking_date,
       b.created_at,
       r.distance_km,
       r.estimated_duration_min,
       loc_p.latitude AS pickup_latitude,
       loc_p.longitude AS pickup_longitude,
       loc_d.latitude AS dest_latitude,
       loc_d.longitude AS dest_longitude
     FROM bookings b
     JOIN users u ON b.user_id = u.user_id
     LEFT JOIN routes r ON b.route_id = r.route_id
     LEFT JOIN locations loc_p ON r.pickup_location_id = loc_p.location_id
     LEFT JOIN locations loc_d ON r.dest_location_id = loc_d.location_id
     WHERE b.status = 'REQUESTED'
       AND b.driver_id IS NULL
       AND b.vehicle_tier = ?
       AND b.booking_id NOT IN (
         SELECT booking_id FROM driver_booking_rejections WHERE driver_id = ?
       )
     ORDER BY b.booking_date DESC
     LIMIT 20`,
    [profile.vehicle_category, profile.driver_id]
  );

  const queueWithProximity = rows.map((r) => {
    let distanceToPickup = null;
    if (
      profile.current_latitude != null &&
      profile.current_longitude != null &&
      r.pickup_latitude != null &&
      r.pickup_longitude != null
    ) {
      distanceToPickup = calculateHaversineKm(
        profile.current_latitude,
        profile.current_longitude,
        r.pickup_latitude,
        r.pickup_longitude
      );
    }
    return {
      ...r,
      driver_distance_to_pickup_km: distanceToPickup,
      distance_to_pickup_km: distanceToPickup,
    };
  });

  return queueWithProximity;
}

/**
 * Accept a ride booking atomically using a database transaction and row locking
 */
export async function acceptBooking(userId, bookingId) {
  const profile = await getDriverProfile(userId);

  if (profile.approval_status !== 'APPROVED') {
    throw {
      statusCode: 403,
      code: 'DRIVER_NOT_APPROVED',
      message: 'Only approved driver partners can accept ride requests.',
    };
  }

  if (!profile.is_available) {
    throw {
      statusCode: 400,
      code: 'DRIVER_OFFLINE',
      message: 'You must be online and on-duty to accept ride requests.',
    };
  }

  if (profile.vehicle_approval_status !== 'APPROVED' || !profile.is_vehicle_active) {
    throw {
      statusCode: 403,
      code: 'VEHICLE_NOT_ACTIVE',
      message: 'Cannot accept ride offer. Your vehicle is either pending approval or deactivated by administration.',
    };
  }

  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 2. Lock the specific booking row by primary key (clustered index record lock)
    const [targetRows] = await connection.query(
      `SELECT booking_id, status, driver_id, vehicle_tier FROM bookings WHERE booking_id = ? FOR UPDATE`,
      [bookingId]
    );

    if (
      targetRows.length === 0 ||
      targetRows[0].status !== 'REQUESTED' ||
      targetRows[0].driver_id !== null
    ) {
      await connection.rollback();
      throw {
        statusCode: 409,
        code: 'BOOKING_ALREADY_ASSIGNED',
        message: 'This ride booking offer is no longer available or was accepted by another driver.',
      };
    }

    // Serialize assignments for this driver by locking the driver profile row.
    const [lockedDrivers] = await connection.query(
      `SELECT driver_id, approval_status, is_available, vehicle_approval_status,
              is_vehicle_active, vehicle_category
       FROM driver_profiles
       WHERE driver_id = ?
       FOR UPDATE`,
      [profile.driver_id]
    );

    const lockedDriver = lockedDrivers[0];
    if (
      !lockedDriver ||
      lockedDriver.approval_status !== 'APPROVED' ||
      !lockedDriver.is_available ||
      lockedDriver.vehicle_approval_status !== 'APPROVED' ||
      !lockedDriver.is_vehicle_active
    ) {
      throw {
        statusCode: 409,
        code: 'DRIVER_UNAVAILABLE',
        message: 'Driver or vehicle is no longer eligible to accept this ride.',
      };
    }

    const [activeCheck] = await connection.query(
      `SELECT booking_id FROM bookings
       WHERE driver_id = ? AND status IN ('CONFIRMED', 'ONGOING')
       LIMIT 1`,
      [profile.driver_id]
    );
    if (activeCheck.length > 0) {
      throw {
        statusCode: 409,
        code: 'ACTIVE_RIDE_EXISTS',
        message: 'You already have an active ride assignment.',
      };
    }
    // Category compatibility enforcement: driver vehicle_category must match booking vehicle_tier
    if (
      !lockedDriver.vehicle_category ||
      lockedDriver.vehicle_category.toUpperCase() !== String(targetRows[0].vehicle_tier).toUpperCase()
    ) {
      await connection.rollback();
      throw {
        statusCode: 403,
        code: 'INCOMPATIBLE_VEHICLE_CATEGORY',
        message: `Driver vehicle category (${profile.vehicle_category || 'UNCLASSIFIED'}) is not compatible with requested ride tier (${targetRows[0].vehicle_tier}).`,
      };
    }

    // 3. Assign driver and transition status to CONFIRMED
    await connection.query(
      `UPDATE bookings
       SET driver_id = ?, status = 'CONFIRMED', updated_at = NOW()
       WHERE booking_id = ?`,
      [profile.driver_id, bookingId]
    );

    await connection.commit();
    return await getBookingById(bookingId);
  } catch (err) {
    await connection.rollback();
    if (err.code === 'ER_LOCK_DEADLOCK' || err.errno === 1213) {
      throw {
        statusCode: 409,
        code: 'BOOKING_ALREADY_ASSIGNED',
        message: 'This ride booking offer was claimed concurrently by another driver.',
      };
    }
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Decline/reject a ride booking without cancelling the rider's request
 */
export async function rejectBooking(userId, bookingId) {
  const profile = await getDriverProfile(userId);

  if (profile.approval_status !== 'APPROVED') {
    throw {
      statusCode: 403,
      code: 'DRIVER_NOT_APPROVED',
      message: 'Only approved driver partners can interact with the dispatch queue.',
    };
  }

  const pool = getDbPool();
  await pool.query(
    `INSERT IGNORE INTO driver_booking_rejections (driver_id, booking_id) VALUES (?, ?)`,
    [profile.driver_id, bookingId]
  );

  return { success: true, rejectedBookingId: bookingId };
}

/**
 * Retrieve driver's currently active ride (CONFIRMED or ONGOING)
 */
export async function getActiveRide(userId) {
  const profile = await getDriverProfile(userId);
  const pool = getDbPool();

  const [rows] = await pool.query(
    `SELECT booking_id FROM bookings WHERE driver_id = ? AND status IN ('CONFIRMED', 'ONGOING') LIMIT 1`,
    [profile.driver_id]
  );

  if (rows.length === 0) {
    return null;
  }

  return await getBookingById(rows[0].booking_id);
}

/**
 * Start ride: transition from CONFIRMED -> ONGOING
 */
export async function startRide(userId, bookingId) {
  const profile = await getDriverProfile(userId);
  const booking = await getBookingById(bookingId);

  if (booking.driver_id !== profile.driver_id) {
    throw {
      statusCode: 403,
      code: 'UNAUTHORIZED_DRIVER',
      message: 'You are not the assigned driver for this ride.',
    };
  }

  if (booking.status !== 'CONFIRMED') {
    throw {
      statusCode: 400,
      code: 'INVALID_STATUS_TRANSITION',
      message: `Cannot start ride with status '${booking.status}'. Ride must be in 'CONFIRMED' status.`,
    };
  }

  const pool = getDbPool();
  const [result] = await pool.query(
    `UPDATE bookings
     SET status = 'ONGOING', updated_at = NOW()
     WHERE booking_id = ? AND status = 'CONFIRMED' AND driver_id = ?`,
    [bookingId, profile.driver_id]
  );

  if (result.affectedRows !== 1) {
    throw {
      statusCode: 409,
      code: 'RIDE_STATUS_CONFLICT',
      message: 'Ride status or driver assignment changed before the ride could be started.',
    };
  }

  return await getBookingById(bookingId);
}

/**
 * Complete ride: transition from ONGOING -> COMPLETED
 */
export async function completeRide(userId, bookingId) {
  const profile = await getDriverProfile(userId);
  const booking = await getBookingById(bookingId);

  if (booking.driver_id !== profile.driver_id) {
    throw {
      statusCode: 403,
      code: 'UNAUTHORIZED_DRIVER',
      message: 'You are not the assigned driver for this ride.',
    };
  }

  if (booking.status !== 'ONGOING') {
    throw {
      statusCode: 400,
      code: 'INVALID_STATUS_TRANSITION',
      message: `Cannot complete ride with status '${booking.status}'. Ride must be in 'ONGOING' status.`,
    };
  }

  const pool = getDbPool();
  const [result] = await pool.query(
    `UPDATE bookings
     SET status = 'COMPLETED', completed_at = NOW(), updated_at = NOW()
     WHERE booking_id = ? AND status = 'ONGOING' AND driver_id = ?`,
    [bookingId, profile.driver_id]
  );

  if (result.affectedRows !== 1) {
    throw {
      statusCode: 409,
      code: 'RIDE_STATUS_CONFLICT',
      message: 'Ride status or driver assignment changed before the ride could be completed.',
    };
  }

  return await getBookingById(bookingId);
}

/**
 * Retrieve driver's completed trips and real earnings calculated from MySQL
 */
export async function getDriverHistoryAndEarnings(userId) {
  const profile = await getDriverProfile(userId);
  const pool = getDbPool();

  const [trips] = await pool.query(
    `SELECT
       b.booking_id,
       b.pickup_address,
       b.dest_address,
       b.pickup_zone,
       b.dest_zone,
       b.vehicle_tier,
       b.status,
       b.payment_status,
       b.total_fare,
       cash_pay.payment_method,
       cash_pay.cash_collection_status,
       cash_pay.cash_collected_at,
       cash_pay.cash_collected_by_driver_id,
       b.booking_date,
       COALESCE(b.completed_at, b.updated_at) AS completed_at,
       b.updated_at,
       u.name AS passenger_name,
       u.phone_no AS passenger_phone,
       r.distance_km,
       r.estimated_duration_min
     FROM bookings b
     JOIN users u ON b.user_id = u.user_id
     LEFT JOIN routes r ON b.route_id = r.route_id
     LEFT JOIN payments cash_pay
       ON cash_pay.payment_id = (
         SELECT cash_payment.payment_id
         FROM payments cash_payment
         WHERE cash_payment.booking_id = b.booking_id
           AND cash_payment.payment_method = 'Cash'
         ORDER BY (
                    cash_payment.cash_collection_status = 'OUTSTANDING'
                    OR cash_payment.cash_collection_status IS NULL
                  ) DESC,
                  cash_payment.payment_date DESC,
                  cash_payment.payment_id DESC
         LIMIT 1
       )
     WHERE b.driver_id = ? AND b.status = 'COMPLETED'
     ORDER BY COALESCE(b.completed_at, b.updated_at) DESC`,
    [profile.driver_id]
  );

  const [stats] = await pool.query(
    `SELECT COUNT(*) AS totalCompleted, COALESCE(SUM(total_fare), 0) AS totalEarnings
     FROM bookings
     WHERE driver_id = ? AND status = 'COMPLETED'`,
    [profile.driver_id]
  );

  return {
    trips,
    totalCompleted: stats[0]?.totalCompleted || 0,
    totalEarnings: Number(stats[0]?.totalEarnings || 0),
  };
}

/**
 * Administrator: Retrieve pending driver partner applications (with document paths)
 */
export async function getPendingDriverApplications() {
  const pool = getDbPool();
  const [rows] = await pool.query(
    `SELECT d.driver_id, d.user_id, u.name, u.email, u.phone_no,
            d.license_no, d.vehicle_no, d.vehicle_model, d.vehicle_category,
            d.license_doc_path, d.vehicle_doc_path,
            d.approval_status, d.created_at
     FROM driver_profiles d
     JOIN users u ON d.user_id = u.user_id
     WHERE d.approval_status = 'PENDING'
     ORDER BY d.created_at ASC`
  );
  return rows;
}

/**
 * Administrator: Approve driver application
 */
export async function approveDriverApplication(driverId) {
  const pool = getDbPool();
  const [res] = await pool.query(
    `UPDATE driver_profiles
     SET approval_status = 'APPROVED',
         vehicle_approval_status = 'APPROVED',
         is_vehicle_active = TRUE
     WHERE driver_id = ?`,
    [driverId]
  );

  if (res.affectedRows === 0) {
    throw { statusCode: 404, code: 'DRIVER_NOT_FOUND', message: `Driver ID ${driverId} not found.` };
  }

  const [rows] = await pool.query(
    `SELECT d.driver_id, d.user_id, u.name, u.email, d.approval_status, d.vehicle_approval_status, d.is_vehicle_active
     FROM driver_profiles d
     JOIN users u ON d.user_id = u.user_id
     WHERE d.driver_id = ?`,
    [driverId]
  );

  return rows[0];
}

/**
 * Administrator: Reject driver application
 */
export async function rejectDriverApplication(driverId, reason = 'Application rejected by administration') {
  const pool = getDbPool();
  const [res] = await pool.query(
    `UPDATE driver_profiles
     SET approval_status = 'REJECTED',
         vehicle_approval_status = 'REJECTED',
         is_available = FALSE
     WHERE driver_id = ?`,
    [driverId]
  );

  if (res.affectedRows === 0) {
    throw { statusCode: 404, code: 'DRIVER_NOT_FOUND', message: `Driver ID ${driverId} not found.` };
  }

  const [rows] = await pool.query(
    `SELECT d.driver_id, d.user_id, u.name, u.email, d.approval_status, d.vehicle_approval_status
     FROM driver_profiles d
     JOIN users u ON d.user_id = u.user_id
     WHERE d.driver_id = ?`,
    [driverId]
  );

  return rows[0];
}

/**
 * Administrator: Update vehicle approval and activation status
 */

export async function updateVehicleStatus(
  driverId,
  { vehicleApprovalStatus, isVehicleActive }
) {
  const pool = getDbPool();
  const updates = [];
  const params = [];

  if (vehicleApprovalStatus !== undefined) {
    if (typeof vehicleApprovalStatus !== 'string') {
      throw {
        statusCode: 400,
        code: 'INVALID_VEHICLE_STATUS',
        message: 'Vehicle status must be a string.',
      };
    }

    const cleanStatus = vehicleApprovalStatus.toUpperCase();

    if (!['PENDING', 'APPROVED', 'REJECTED'].includes(cleanStatus)) {
      throw {
        statusCode: 400,
        code: 'INVALID_VEHICLE_STATUS',
        message: "Vehicle status must be 'PENDING', 'APPROVED', or 'REJECTED'.",
      };
    }

    updates.push('vehicle_approval_status = ?');
    params.push(cleanStatus);

    if (cleanStatus !== 'APPROVED') {
      updates.push('is_available = FALSE');
    }
  }

  if (isVehicleActive !== undefined) {
    if (typeof isVehicleActive !== 'boolean') {
      throw {
        statusCode: 400,
        code: 'INVALID_VEHICLE_ACTIVE',
        message: 'isVehicleActive must be a boolean.',
      };
    }

    updates.push('is_vehicle_active = ?');
    params.push(isVehicleActive);

    if (!isVehicleActive) {
      updates.push('is_available = FALSE');
    }
  }

  if (updates.length === 0) {
    throw {
      statusCode: 400,
      code: 'NO_UPDATES',
      message: 'No vehicle status or activation changes provided.',
    };
  }

  params.push(driverId);

  const [res] = await pool.query(
    `UPDATE driver_profiles
     SET ${updates.join(', ')}
     WHERE driver_id = ?`,
    params
  );

  if (res.affectedRows === 0) {
    const [existing] = await pool.query(
      'SELECT driver_id FROM driver_profiles WHERE driver_id = ?',
      [driverId]
    );

    if (existing.length === 0) {
      throw {
        statusCode: 404,
        code: 'DRIVER_NOT_FOUND',
        message: `Driver ID ${driverId} not found.`,
      };
    }
  }

  const [rows] = await pool.query(
    `SELECT d.driver_id, d.user_id, u.name AS driver_name,
            u.phone_no AS driver_phone, d.license_no, d.vehicle_no,
            d.vehicle_model, d.vehicle_category, d.vehicle_color,
            d.passenger_capacity, d.vehicle_approval_status,
            d.is_vehicle_active, d.approval_status, d.is_available
     FROM driver_profiles d
     JOIN users u ON d.user_id = u.user_id
     WHERE d.driver_id = ?`,
    [driverId]
  );

  return rows[0];
}


/**
 * Administrator: Retrieve all fleet vehicles
 */
export async function getAllFleetVehicles() {
  const pool = getDbPool();
  const [rows] = await pool.query(
    `SELECT d.driver_id, d.user_id, u.name AS driver_name, u.phone_no AS driver_phone,
            d.license_no, d.vehicle_no, d.vehicle_model, d.vehicle_category,
            d.vehicle_color, d.passenger_capacity,
            d.vehicle_approval_status, d.is_vehicle_active,
            d.approval_status, d.is_available, d.rating,
            (SELECT COUNT(*) FROM bookings b WHERE b.driver_id = d.driver_id AND b.status IN ('CONFIRMED', 'ONGOING')) AS active_rides_count,
            d.created_at
     FROM driver_profiles d
     JOIN users u ON d.user_id = u.user_id
     ORDER BY d.created_at DESC`
  );
  return rows;
}

/**
 * Record a dispatch failure into MySQL
 */
export async function recordDispatchFailure(bookingId, reason) {
  const pool = getDbPool();
  const [res] = await pool.query(
    `INSERT INTO dispatch_failures (booking_id, reason) VALUES (?, ?)`,
    [bookingId, String(reason || 'No available or compatible driver')]
  );
  return { failure_id: res.insertId, booking_id: bookingId, reason };
}

/**
 * Administrator: List recent dispatch failures
 */
export async function getDispatchFailures(limit = 50) {
  const pool = getDbPool();
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const [rows] = await pool.query(
    `SELECT df.failure_id, df.booking_id, df.reason, df.failed_at,
            b.pickup_address, b.dest_address, b.vehicle_tier, b.total_fare, b.status AS booking_status,
            u.name AS passenger_name, u.phone_no AS passenger_phone
     FROM dispatch_failures df
     JOIN bookings b ON df.booking_id = b.booking_id
     JOIN users u ON b.user_id = u.user_id
     ORDER BY df.failed_at DESC
     LIMIT ?`,
    [parsedLimit]
  );
  return rows;
}

/**
 * Update driver geographic location coordinates (REQ-022)
 */
export async function updateDriverLocation(userId, { latitude, longitude, fixTimestampMs }) {
  const profile = await getDriverProfile(userId);
  if (profile.approval_status !== 'APPROVED') {
    throw {
      statusCode: 403,
      code: 'DRIVER_NOT_APPROVED',
      message: 'Only approved driver partners can broadcast location telemetry.',
    };
  }

  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw {
      statusCode: 400,
      code: 'INVALID_COORDINATES',
      message: 'Latitude and longitude must be finite JSON numbers within [-90, 90] and [-180, 180].',
    };
  }

  if (
    typeof fixTimestampMs !== 'number' ||
    !Number.isSafeInteger(fixTimestampMs) ||
    fixTimestampMs <= 0
  ) {
    throw {
      statusCode: 400,
      code: 'INVALID_FIX_TIMESTAMP',
      message: 'GPS fix timestamp must be a positive integer Unix timestamp in milliseconds.',
    };
  }

  const now = Date.now();
  if (fixTimestampMs < now - LOCATION_FIX_MAX_AGE_MS) {
    throw {
      statusCode: 400,
      code: 'STALE_LOCATION_FIX',
      message: 'GPS fix is more than five minutes old. Submit a fresh location fix.',
    };
  }
  if (fixTimestampMs > now + LOCATION_FIX_MAX_FUTURE_MS) {
    throw {
      statusCode: 400,
      code: 'FUTURE_LOCATION_FIX',
      message: 'GPS fix timestamp is more than 30 seconds in the future.',
    };
  }

  const pool = getDbPool();
  const [result] = await pool.query(
    `UPDATE driver_profiles
     SET current_latitude = ?, current_longitude = ?,
         location_updated_at = NOW(), location_fix_timestamp_ms = ?
     WHERE user_id = ?
       AND (location_fix_timestamp_ms IS NULL OR location_fix_timestamp_ms < ?)`,
    [latitude, longitude, fixTimestampMs, userId, fixTimestampMs]
  );

  if (result.affectedRows !== 1) {
    throw {
      statusCode: 409,
      code: 'LOCATION_FIX_OUT_OF_ORDER',
      message: 'This GPS fix is not newer than the latest stored location.',
    };
  }

  return {
    latitude,
    longitude,
    fix_timestamp_ms: fixTimestampMs,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Save driver document metadata after secure upload (REQ-013, REQ-014)
 */
export async function saveDriverDocuments(userId, { licenseDoc, vehicleDoc } = {}) {
  const profile = await getDriverProfile(userId);
  const pool = getDbPool();

  const updates = [];
  const params = [];

  if (licenseDoc?.filename) {
    updates.push('license_doc_path = ?');
    params.push(licenseDoc.filename);
  }
  if (vehicleDoc?.filename) {
    updates.push('vehicle_doc_path = ?');
    params.push(vehicleDoc.filename);
  }

  if (updates.length > 0) {
    params.push(profile.driver_id);
    await pool.query(
      `UPDATE driver_profiles SET ${updates.join(', ')} WHERE driver_id = ?`,
      params
    );
  }

  return await getDriverProfile(userId);
}

/**
 * Retrieve absolute file path of an uploaded document with access control checks
 */
export async function getDriverDocumentPath({ reqUser, targetDriverId, docType }) {
  const pool = getDbPool();
  let queryDriverId = targetDriverId;

  if (reqUser.role === 'DRIVER') {
    const profile = await getDriverProfile(reqUser.user_id);
    queryDriverId = profile.driver_id;
  } else if (reqUser.role !== 'ADMIN') {
    throw { statusCode: 403, code: 'FORBIDDEN', message: 'You are not authorized to view driver documents.' };
  }

  if (!queryDriverId) {
    throw { statusCode: 400, code: 'MISSING_DRIVER_ID', message: 'Driver ID must be specified.' };
  }

  const [rows] = await pool.query(
    `SELECT driver_id, license_doc_path, vehicle_doc_path FROM driver_profiles WHERE driver_id = ?`,
    [queryDriverId]
  );

  if (rows.length === 0) {
    throw { statusCode: 404, code: 'DRIVER_NOT_FOUND', message: 'Driver profile not found.' };
  }

  const filename = docType === 'license' ? rows[0].license_doc_path : rows[0].vehicle_doc_path;
  if (!filename) {
    throw { statusCode: 404, code: 'DOCUMENT_NOT_FOUND', message: `No ${docType} document uploaded for this driver.` };
  }

  // Prevent path traversal
  const safeFilename = path.basename(filename);
  const fullPath = path.join(UPLOADS_DIR, safeFilename);

  return { fullPath, filename: safeFilename };
}

/**
 * Find and rank online eligible drivers by proximity to booking pickup coordinates (REQ-022)
 */
export async function findNearestAvailableDrivers(bookingId) {
  const booking = await getBookingById(bookingId);
  if (!booking) {
    throw { statusCode: 404, code: 'BOOKING_NOT_FOUND', message: 'Booking not found.' };
  }

  const bookingCategory = String(booking.vehicle_tier || booking.vehicle_category || 'STANDARD').toUpperCase();

  if (booking.pickup_latitude == null || booking.pickup_longitude == null) {
    return {
      hasLocations: false,
      compatibleDriversFound: false,
      drivers: [],
      message: 'Booking pickup location has no geographic coordinates.',
    };
  }

  const pool = getDbPool();
  const [candidates] = await pool.query(
    `SELECT d.driver_id, d.user_id, u.name, u.phone_no, d.vehicle_model, d.vehicle_no, d.vehicle_category,
            d.vehicle_color, d.passenger_capacity, d.vehicle_approval_status, d.is_vehicle_active,
            d.current_latitude, d.current_longitude, d.rating
     FROM driver_profiles d
     JOIN users u ON d.user_id = u.user_id
     WHERE d.approval_status = 'APPROVED'
       AND d.is_available = TRUE
       AND d.vehicle_approval_status = 'APPROVED'
       AND d.is_vehicle_active = TRUE
       AND d.vehicle_category = ?
       AND d.current_latitude IS NOT NULL
       AND d.current_longitude IS NOT NULL
       AND d.location_fix_timestamp_ms IS NOT NULL
       AND d.location_fix_timestamp_ms >= ?
       AND d.driver_id NOT IN (
         SELECT driver_id FROM driver_booking_rejections WHERE booking_id = ?
       )
       AND d.driver_id NOT IN (
         SELECT driver_id FROM bookings WHERE status IN ('CONFIRMED', 'ONGOING') AND driver_id IS NOT NULL
       )`,
    [bookingCategory, Date.now() - LOCATION_FIX_MAX_AGE_MS, bookingId]
  );

  if (candidates.length === 0) {
    return {
      hasLocations: false,
      compatibleDriversFound: false,
      drivers: [],
      message: `No online approved ${bookingCategory} drivers with active location telemetry found.`,
    };
  }

  const ranked = candidates
    .map((d) => {
      const distanceKm = calculateHaversineKm(
        booking.pickup_latitude,
        booking.pickup_longitude,
        d.current_latitude,
        d.current_longitude
      );
      return {
        ...d,
        distance_km: distanceKm,
      };
    })
    .sort((a, b) => (a.distance_km || 0) - (b.distance_km || 0));

  return {
    hasLocations: true,
    compatibleDriversFound: true,
    drivers: ranked,
    nearest: ranked[0] || null,
  };
}

/**
 * Assign the nearest available driver using atomic row-locking (REQ-022)
 * With graceful fallback to broadcast dispatch queue when no locations exist
 */

export async function assignNearestDriver(bookingId, requester) {
  if (!requester || !['RIDER', 'ADMIN'].includes(requester.role)) {
    throw {
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'Only a rider or administrator may dispatch a booking.',
    };
  }

  const requestedBooking = await getBookingById(bookingId);
  if (
    requester?.role === 'RIDER' &&
    Number(requestedBooking.user_id) !== Number(requester.user_id)
  ) {
    throw {
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'You are not authorized to dispatch another passenger’s booking.',
    };
  }

  const maxRefreshes = 5;

  for (let attempt = 0; attempt < maxRefreshes; attempt++) {
    const booking = await getBookingById(bookingId);
    const ranking = await findNearestAvailableDrivers(bookingId);

    if (!ranking.hasLocations || !ranking.nearest) {
      if (!ranking.compatibleDriversFound) {
        try {
          await recordDispatchFailure(
            bookingId,
            `No compatible and active ${booking.vehicle_tier} drivers available nearby.`
          );
        } catch (e) {
          console.warn(
            `[Dispatch Failure] Could not record failure for booking ${bookingId}:`,
            e.code || e.message
          );
        }
      }

      return {
        assigned: false,
        fallback: 'broadcast_queue',
        compatibleDriversFound: Boolean(ranking.compatibleDriversFound),
        message: `No compatible ${booking.vehicle_tier} drivers available nearby; ride offer remains in broadcast dispatch queue.`,
      };
    }

    let refreshCandidates = false;

    for (const candidate of ranking.drivers) {
      const connection = await getDbPool().getConnection();
      let transactionOpen = false;

      try {
        await connection.beginTransaction();
        transactionOpen = true;

        const [targetRows] = await connection.query(
          `SELECT booking_id, status, driver_id, vehicle_tier
           FROM bookings WHERE booking_id = ? FOR UPDATE`,
          [bookingId]
        );

        if (
          targetRows.length === 0 ||
          targetRows[0].status !== 'REQUESTED' ||
          targetRows[0].driver_id !== null
        ) {
          throw {
            statusCode: 409,
            code: 'BOOKING_ALREADY_ASSIGNED',
            message: 'This ride booking is no longer available in REQUESTED status.',
          };
        }

        const tier = String(targetRows[0].vehicle_tier).toUpperCase();

        if (
          !candidate.vehicle_category ||
          candidate.vehicle_category.toUpperCase() !== tier
        ) {
          throw {
            statusCode: 403,
            code: 'INCOMPATIBLE_VEHICLE_CATEGORY',
            message: 'The selected driver category does not match this booking.',
          };
        }

        // Preserve the same booking-then-driver lock order as manual acceptance.
        const [driverRows] = await connection.query(
          `SELECT driver_id, approval_status, is_available,
                  vehicle_approval_status, is_vehicle_active,
                  vehicle_category, current_latitude, current_longitude
           FROM driver_profiles
           WHERE driver_id = ? FOR UPDATE`,
          [candidate.driver_id]
        );

        const driver = driverRows[0];

        if (!driver) {
          refreshCandidates = true;
          continue;
        }

        const [activeRides] = await connection.query(
          `SELECT booking_id FROM bookings
           WHERE driver_id = ?
             AND status IN ('CONFIRMED', 'ONGOING')
           LIMIT 1`,
          [driver.driver_id]
        );

        const [rejections] = await connection.query(
          `SELECT booking_id FROM driver_booking_rejections
           WHERE driver_id = ? AND booking_id = ?
           LIMIT 1`,
          [driver.driver_id, bookingId]
        );

        const [freshnessRows] = await connection.query(
          `SELECT (
             location_fix_timestamp_ms IS NOT NULL
             AND location_fix_timestamp_ms >= ?
           ) AS location_fresh
           FROM driver_profiles WHERE driver_id = ?`,
          [Date.now() - LOCATION_FIX_MAX_AGE_MS, driver.driver_id]
        );

        if (
          driver.approval_status !== 'APPROVED' ||
          !driver.is_available ||
          driver.vehicle_approval_status !== 'APPROVED' ||
          !driver.is_vehicle_active ||
          !driver.vehicle_category ||
          driver.vehicle_category.toUpperCase() !== tier ||
          driver.current_latitude == null ||
          driver.current_longitude == null ||
          !freshnessRows[0]?.location_fresh ||
          activeRides.length > 0 ||
          rejections.length > 0
        ) {
          refreshCandidates = true;
          continue;
        }

        const [updateResult] = await connection.query(
          `UPDATE bookings
           SET driver_id = ?, status = 'CONFIRMED', updated_at = NOW()
           WHERE booking_id = ?
             AND status = 'REQUESTED'
             AND driver_id IS NULL`,
          [driver.driver_id, bookingId]
        );

        if (updateResult.affectedRows !== 1) {
          throw {
            statusCode: 409,
            code: 'BOOKING_ALREADY_ASSIGNED',
            message: 'Another dispatch operation claimed this booking.',
          };
        }

        await connection.commit();
        transactionOpen = false;

        const updatedBooking = await getBookingById(bookingId);

        return {
          assigned: true,
          driver: candidate,
          booking: updatedBooking,
          driver_id: driver.driver_id,
          distance_km: candidate.distance_km,
          status: updatedBooking.status,
          message: `Nearest eligible driver ${candidate.name} (${candidate.distance_km} km away) was assigned successfully.`,
        };
      } catch (err) {
        if (transactionOpen) {
          try {
            await connection.rollback();
          } catch (rollbackError) {
            // Preserve the original error.
          }
          transactionOpen = false;
        }

        if (err.code === 'DRIVER_UNAVAILABLE') {
          refreshCandidates = true;
          continue;
        }

        throw err;
      } finally {
        if (transactionOpen) {
          try {
            await connection.rollback();
          } catch (rollbackError) {
            // Preserve the original error.
          }
        }
        connection.release();
      }
    }

    if (!refreshCandidates) break;
    // Refresh after releasing locks; a concurrent dispatch may have claimed a driver.
  }

    const finalRanking = await findNearestAvailableDrivers(bookingId);

  return {
    assigned: false,
    fallback: 'broadcast_queue',
    compatibleDriversFound: Boolean(finalRanking.compatibleDriversFound),
    message: 'Eligible drivers became unavailable during dispatch; ride remains queued for retry.',
  };
}
