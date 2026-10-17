import * as bookingService from '../services/bookingService.js';

/**
 * POST /api/bookings
 * Create new ride booking (Booking.bookRide())
 * Protected: Rider only. Uses authenticated req.user.user_id.
 */
export async function createBookingHandler(req, res, next) {
  try {
    const {
      pickupAddress,
      pickupLat,
      pickupLng,
      destAddress,
      destLat,
      destLng,
      vehicleTier,
      vehicleCategory,
    } = req.body;

    // Use trusted user ID from authentication token
    const userId = req.user ? req.user.user_id : (parseInt(req.body.userId, 10) || 1);

    const booking = await bookingService.createBooking({
      userId,
      pickupAddress,
      pickupLat,
      pickupLng,
      destAddress,
      destLat,
      destLng,
      vehicleTier,
      vehicleCategory,
    });

    res.status(201).json({
      success: true,
      data: booking,
      message: 'Ride booking request initiated successfully.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/bookings/:id
 * Retrieve booking status and details (Booking.getBookingStatus())
 */
export async function getBookingHandler(req, res, next) {
  try {
    const bookingId = parseInt(req.params.id, 10);
    if (isNaN(bookingId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Booking ID must be a numeric integer.' },
      });
    }

    const booking = await bookingService.getBookingById(bookingId);

    // Cross-user authorization check: Riders can only view their own bookings
    if (req.user && req.user.role === 'RIDER' && booking.user_id !== req.user.user_id) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You are not authorized to view another passenger’s booking.' },
      });
    }

    res.status(200).json({
      success: true,
      data: booking,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/bookings/:id/tracking
 * Retrieve live driver location for the authenticated rider's own booking.
 */
export async function getBookingTrackingHandler(req, res, next) {
  try {
    const bookingIdParam = req.params.id;
    const bookingId = /^[0-9]+$/.test(bookingIdParam)
      ? Number(bookingIdParam)
      : NaN;
    if (!Number.isSafeInteger(bookingId) || bookingId <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Booking ID must be a numeric integer.' },
      });
    }

    const tracking = await bookingService.getBookingTracking({
      bookingId,
      userId: req.user.user_id,
      includeRouteGeometry: req.query.includeRouteGeometry === 'true',
    });

    res.status(200).json({
      success: true,
      data: tracking,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/bookings
 * List passenger bookings
 */
export async function listBookingsHandler(req, res, next) {
  try {
    // If authenticated as RIDER, enforce viewing only their own bookings
    let userId = req.user ? req.user.user_id : (parseInt(req.query.userId, 10) || 1);
    if (req.user && req.user.role === 'ADMIN' && req.query.userId) {
      userId = parseInt(req.query.userId, 10);
    }

    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = parseInt(req.query.offset, 10) || 0;

    const result = await bookingService.listBookings({ userId, limit, offset });
    res.status(200).json({
      success: true,
      data: result.bookings,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/bookings/:id/cancel
 * Cancel ride booking before pickup (Booking.cancelRide())
 */
export async function cancelBookingHandler(req, res, next) {
  try {
    const bookingId = parseInt(req.params.id, 10);
    if (isNaN(bookingId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Booking ID must be a numeric integer.' },
      });
    }

    const booking = await bookingService.getBookingById(bookingId);

    // Check ownership
    if (req.user && req.user.role === 'RIDER' && booking.user_id !== req.user.user_id) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You are not authorized to cancel another passenger’s booking.' },
      });
    }

    const reason = req.body?.reason || 'Cancelled by passenger before pickup';
    const updated = await bookingService.cancelBooking(bookingId, { reason });

    res.status(200).json({
      success: true,
      data: updated,
      message: 'Ride booking was cancelled successfully.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/bookings/estimate
 * Upfront route and fare estimation using actual road routing (SRS REQ-020, REQ-021)
 */
export async function estimateFareHandler(req, res, next) {
  try {
    const {
      pickupAddress,
      pickupLat,
      pickupLng,
      destAddress,
      destLat,
      destLng,
      vehicleTier,
      vehicleCategory,
    } = req.body;

    if ((!pickupAddress && (pickupLat === undefined || pickupLng === undefined)) ||
        (!destAddress && (destLat === undefined || destLng === undefined))) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_ROUTE_POINTS',
          message: 'Both pickup and destination locations (addresses or coordinates) are required for fare estimation.',
        },
      });
    }

    const estimate = await bookingService.estimateFare({
      pickupAddress,
      pickupLat,
      pickupLng,
      destAddress,
      destLat,
      destLng,
      vehicleTier,
      vehicleCategory,
    });

    res.status(200).json({
      success: true,
      data: estimate,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/bookings/places
 * Search places and landmarks across Mumbai MMR with location autocomplete
 */
export async function searchPlacesHandler(req, res, next) {
  try {
    const query = req.query.q || req.query.query || '';
    const places = await bookingService.searchPlaces(query);

    res.status(200).json({
      success: true,
      data: places,
    });
  } catch (err) {
    next(err);
  }
}
