import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/authMiddleware.js';
import * as ratingService from '../services/ratingService.js';

const router = Router();

// Protect all rating endpoints with authentication
router.use(authenticateToken);

/**
 * POST /api/ratings
 * Submit post-trip rating (1-5 stars) and review for a completed ride
 * Protected: RIDER role only
 */
router.post('/', requireRole(['RIDER']), async (req, res, next) => {
  try {
    const { bookingId, rating, comments } = req.body;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Booking ID is required.' },
      });
    }

    if (rating === undefined || rating === null) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_RATING_VALUE', message: 'Rating is required (1-5 stars).' },
      });
    }

    const result = await ratingService.submitRating({
      userId: req.user.user_id,
      bookingId,
      rating,
      comments,
    });

    res.status(201).json({
      success: true,
      data: result,
      message: 'Rating submitted successfully.',
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'RATING_ERROR',
          message: err.message,
        },
      });
    }
    next(err);
  }
});

/**
 * GET /api/ratings/booking/:bookingId
 * Retrieve rating record for a specific booking
 * Protected: Authenticated users
 */
router.get('/booking/:bookingId', async (req, res, next) => {
  try {
    const rating = await ratingService.getRatingByBookingId(req.params.bookingId);
    res.status(200).json({
      success: true,
      data: rating,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'RATING_ERROR',
          message: err.message,
        },
      });
    }
    next(err);
  }
});

/**
 * GET /api/ratings/driver/:driverId
 * Retrieve ratings submitted for a specific driver partner
 * Protected: Authenticated users
 */
router.get('/driver/:driverId', async (req, res, next) => {
  try {
    const result = await ratingService.getDriverRatings(req.params.driverId);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'RATING_ERROR',
          message: err.message,
        },
      });
    }
    next(err);
  }
});

export default router;
