import path from 'path';
import { getDbPool } from '../config/db.js';
import { getBookingById } from './bookingService.js';
import { UPLOADS_DIR } from '../middleware/uploadMiddleware.js';

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
  const profile = await getDriverProfile(userId);

  if (profile.approval_status !== 'APPROVED') {
    throw {
      statusCode: 403,
      code: 'DRIVER_NOT_APPROVED',
      message: 'Cannot toggle duty status. Your driver partner account is pending administrative verification.',
    };
  }

  const availableBool = Boolean(isAvailable);
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

  // 1. Check if driver already has an active ride in CONFIRMED or ONGOING status
  const pool = getDbPool();
  const [activeCheck] = await pool.query(
    `SELECT booking_id FROM bookings WHERE driver_id = ? AND status IN ('CONFIRMED', 'ONGOING') LIMIT 1`,
    [profile.driver_id]
  );
  if (activeCheck.length > 0) {
    throw {
      statusCode: 400,
      code: 'ACTIVE_RIDE_EXISTS',
      message: 'You already have an active ride assignment. Please complete it before accepting another.',
    };
  }

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

    // Category compatibility enforcement: driver vehicle_category must match booking vehicle_tier
    if (
      !profile.vehicle_category ||
      profile.vehicle_category.toUpperCase() !== String(targetRows[0].vehicle_tier).toUpperCase()
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
  await pool.query(
    `UPDATE bookings SET status = 'ONGOING', updated_at = NOW() WHERE booking_id = ?`,
    [bookingId]
  );

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
  await pool.query(
    `UPDATE bookings SET status = 'COMPLETED', completed_at = NOW(), updated_at = NOW() WHERE booking_id = ?`,
    [bookingId]
  );

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
    `UPDATE driver_profiles SET approval_status = 'APPROVED' WHERE driver_id = ?`,
    [driverId]
  );

  if (res.affectedRows === 0) {
    throw { statusCode: 404, code: 'DRIVER_NOT_FOUND', message: `Driver ID ${driverId} not found.` };
  }

  const [rows] = await pool.query(
    `SELECT d.driver_id, d.user_id, u.name, u.email, d.approval_status
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
    `UPDATE driver_profiles SET approval_status = 'REJECTED' WHERE driver_id = ?`,
    [driverId]
  );

  if (res.affectedRows === 0) {
    throw { statusCode: 404, code: 'DRIVER_NOT_FOUND', message: `Driver ID ${driverId} not found.` };
  }

  const [rows] = await pool.query(
    `SELECT d.driver_id, d.user_id, u.name, u.email, d.approval_status
     FROM driver_profiles d
     JOIN users u ON d.user_id = u.user_id
     WHERE d.driver_id = ?`,
    [driverId]
  );

  return rows[0];
}

/**
 * Update driver geographic location coordinates (REQ-022)
 */
export async function updateDriverLocation(userId, { latitude, longitude }) {
  const profile = await getDriverProfile(userId);
  if (profile.approval_status !== 'APPROVED') {
    throw {
      statusCode: 403,
      code: 'DRIVER_NOT_APPROVED',
      message: 'Only approved driver partners can broadcast location telemetry.',
    };
  }

  const numLat = parseFloat(latitude);
  const numLon = parseFloat(longitude);
  if (isNaN(numLat) || isNaN(numLon) || numLat < -90 || numLat > 90 || numLon < -180 || numLon > 180) {
    throw {
      statusCode: 400,
      code: 'INVALID_COORDINATES',
      message: 'Valid numeric latitude [-90, 90] and longitude [-180, 180] are required.',
    };
  }

  const pool = getDbPool();
  await pool.query(
    `UPDATE driver_profiles
     SET current_latitude = ?, current_longitude = ?, location_updated_at = NOW()
     WHERE user_id = ?`,
    [numLat, numLon, userId]
  );

  return {
    latitude: numLat,
    longitude: numLon,
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
            d.current_latitude, d.current_longitude, d.rating
     FROM driver_profiles d
     JOIN users u ON d.user_id = u.user_id
     WHERE d.approval_status = 'APPROVED'
       AND d.is_available = TRUE
       AND d.vehicle_category = ?
       AND d.current_latitude IS NOT NULL
       AND d.current_longitude IS NOT NULL
       AND d.driver_id NOT IN (
         SELECT driver_id FROM driver_booking_rejections WHERE booking_id = ?
       )
       AND d.driver_id NOT IN (
         SELECT driver_id FROM bookings WHERE status IN ('CONFIRMED', 'ONGOING') AND driver_id IS NOT NULL
       )`,
    [bookingCategory, bookingId]
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
export async function assignNearestDriver(bookingId) {
  const booking = await getBookingById(bookingId);
  const ranking = await findNearestAvailableDrivers(bookingId);

  if (!ranking.hasLocations || !ranking.nearest) {
    return {
      assigned: false,
      fallback: 'broadcast_queue',
      compatibleDriversFound: Boolean(ranking.compatibleDriversFound),
      message: `No compatible ${booking.vehicle_tier} drivers available nearby; ride offer remains in broadcast dispatch queue.`,
    };
  }

  const nearestDriver = ranking.nearest;
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

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
        message: 'This ride booking is no longer available in REQUESTED status.',
      };
    }

    if (
      !nearestDriver.vehicle_category ||
      nearestDriver.vehicle_category.toUpperCase() !== String(targetRows[0].vehicle_tier).toUpperCase()
    ) {
      await connection.rollback();
      throw {
        statusCode: 403,
        code: 'INCOMPATIBLE_VEHICLE_CATEGORY',
        message: `Assigned driver category (${nearestDriver.vehicle_category}) does not match booking tier (${targetRows[0].vehicle_tier}).`,
      };
    }

    await connection.query(
      `UPDATE bookings
       SET driver_id = ?, status = 'CONFIRMED', updated_at = NOW()
       WHERE booking_id = ?`,
      [nearestDriver.driver_id, bookingId]
    );

    await connection.commit();

    const updatedBooking = await getBookingById(bookingId);
    return {
      assigned: true,
      driver: nearestDriver,
      booking: updatedBooking,
      driver_id: nearestDriver.driver_id,
      distance_km: nearestDriver.distance_km,
      status: updatedBooking.status,
      message: `Nearest driver ${nearestDriver.name} (${nearestDriver.distance_km} km away) was assigned successfully.`,
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

