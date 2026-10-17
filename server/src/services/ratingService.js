import { getDbPool } from '../config/db.js';

export function validateRating(rating) {
  if (
    typeof rating !== 'number' ||
    !Number.isFinite(rating) ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    throw {
      statusCode: 400,
      code: 'INVALID_RATING_VALUE',
      message: 'Rating must be an integer between 1 and 5 stars.',
    };
  }

  return rating;
}

/**
 * Submit post-trip star rating and optional written review
 * Derived from SRS Section 3: "Rating and Review Screen: Star Ratings (1–5), Submit Written Reviews"
 * "Ratings and reviews shall be submitted only after ride completion."
 */
export async function submitRating({
  userId,
  bookingId,
  rating,
  comments = null,
}) {
  const numericBookingId = parseInt(bookingId, 10);
  if (isNaN(numericBookingId)) {
    throw { statusCode: 400, code: 'INVALID_ID', message: 'Booking ID must be a numeric integer.' };
  }

  const parsedRating = validateRating(rating);

  const cleanComments = typeof comments === 'string' ? comments.trim() : null;
  if (cleanComments && cleanComments.length > 500) {
    throw {
      statusCode: 400,
      code: 'COMMENT_TOO_LONG',
      message: 'Comments must not exceed 500 characters.',
    };
  }

  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Lock booking record to verify ownership, status, and driver
    const [bookingRows] = await connection.query(
      `SELECT booking_id, user_id, driver_id, status
       FROM bookings
       WHERE booking_id = ?
       FOR UPDATE`,
      [numericBookingId]
    );

    if (bookingRows.length === 0) {
      throw {
        statusCode: 404,
        code: 'BOOKING_NOT_FOUND',
        message: `Booking ID ${numericBookingId} was not found.`,
      };
    }

    const booking = bookingRows[0];

    // 2. Cross-user authorization: Rider must own the booking
    if (booking.user_id !== userId) {
      throw {
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'You are not authorized to rate another passenger’s booking.',
      };
    }

    // 3. Status eligibility: Booking must be COMPLETED
    if (booking.status !== 'COMPLETED') {
      throw {
        statusCode: 400,
        code: 'INVALID_BOOKING_STATUS',
        message: `Ratings can only be submitted for COMPLETED rides. Current ride status: ${booking.status}.`,
      };
    }

    // 4. Must have an assigned driver
    if (!booking.driver_id) {
      throw {
        statusCode: 400,
        code: 'NO_ASSIGNED_DRIVER',
        message: 'This booking has no assigned driver to rate.',
      };
    }

    // 5. Duplicate check: Each booking can only have one rating
    const [existingRating] = await connection.query(
      `SELECT rating_id, rating, comments, created_at
       FROM ratings
       WHERE booking_id = ?
       FOR UPDATE`,
      [numericBookingId]
    );

    if (existingRating.length > 0) {
      throw {
        statusCode: 409,
        code: 'ALREADY_RATED',
        message: `Booking GR-BK-${numericBookingId} has already been rated (${existingRating[0].rating} stars). Duplicate ratings are not allowed.`,
      };
    }

    // 6. Insert rating record
    const [insertResult] = await connection.query(
      `INSERT INTO ratings (booking_id, user_id, driver_id, rating, comments)
       VALUES (?, ?, ?, ?, ?)`,
      [numericBookingId, userId, booking.driver_id, parsedRating, cleanComments || null]
    );

    // 7. Atomically recalculate driver's aggregate rating from all persisted ratings
    const [avgRows] = await connection.query(
      `SELECT ROUND(AVG(rating), 2) AS avg_rating, COUNT(*) AS total_ratings
       FROM ratings
       WHERE driver_id = ?`,
      [booking.driver_id]
    );

    const newAvgRating = avgRows[0]?.avg_rating ? Number(avgRows[0].avg_rating) : parsedRating;

    // Update driver profile rating column
    await connection.query(
      `UPDATE driver_profiles SET rating = ? WHERE driver_id = ?`,
      [newAvgRating, booking.driver_id]
    );

    await connection.commit();

    return {
      ratingId: insertResult.insertId,
      bookingId: numericBookingId,
      userId,
      driverId: booking.driver_id,
      rating: parsedRating,
      comments: cleanComments || null,
      driverNewRating: newAvgRating,
      totalDriverRatings: avgRows[0]?.total_ratings || 1,
      createdAt: new Date().toISOString(),
      message: 'Rating and review submitted successfully. Driver profile rating updated.',
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Retrieve rating details for a specific booking
 */
export async function getRatingByBookingId(bookingId) {
  const numericBookingId = parseInt(bookingId, 10);
  if (isNaN(numericBookingId)) {
    throw { statusCode: 400, code: 'INVALID_ID', message: 'Booking ID must be a numeric integer.' };
  }

  const pool = getDbPool();
  const [rows] = await pool.query(
    `SELECT r.rating_id, r.booking_id, r.user_id, r.driver_id, r.rating, r.comments, r.created_at,
            u.name AS passenger_name,
            ud.name AS driver_name,
            d.vehicle_no, d.vehicle_model
     FROM ratings r
     JOIN users u ON r.user_id = u.user_id
     JOIN driver_profiles d ON r.driver_id = d.driver_id
     JOIN users ud ON d.user_id = ud.user_id
     WHERE r.booking_id = ?`,
    [numericBookingId]
  );

  return rows[0] || null;
}

/**
 * Retrieve ratings submitted for a driver partner
 */
export async function getDriverRatings(driverId) {
  const numericDriverId = parseInt(driverId, 10);
  if (isNaN(numericDriverId)) {
    throw { statusCode: 400, code: 'INVALID_ID', message: 'Driver ID must be a numeric integer.' };
  }

  const pool = getDbPool();
  const [rows] = await pool.query(
    `SELECT r.rating_id, r.booking_id, r.rating, r.comments, r.created_at,
            u.name AS passenger_name
     FROM ratings r
     JOIN users u ON r.user_id = u.user_id
     WHERE r.driver_id = ?
     ORDER BY r.created_at DESC`,
    [numericDriverId]
  );

  const [stats] = await pool.query(
    `SELECT ROUND(AVG(rating), 2) AS averageRating, COUNT(*) AS totalRatings
     FROM ratings
     WHERE driver_id = ?`,
    [numericDriverId]
  );

  return {
    driverId: numericDriverId,
    averageRating: stats[0]?.averageRating ? Number(stats[0].averageRating) : 5.0,
    totalRatings: stats[0]?.totalRatings || 0,
    ratings: rows,
  };
}
