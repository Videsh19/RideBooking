import { Router } from 'express';
import {
  createBookingHandler,
  getBookingHandler,
  getBookingTrackingHandler,
  listBookingsHandler,
  cancelBookingHandler,
  estimateFareHandler,
  searchPlacesHandler,
} from '../controllers/bookingController.js';
import { authenticateToken, requireRole } from '../middleware/authMiddleware.js';
import { validateRequiredFields } from '../middleware/validateRequest.js';
import * as paymentService from '../services/paymentService.js';
import * as ratingService from '../services/ratingService.js';
import * as driverService from '../services/driverService.js';
import { parsePositiveIntegerId } from '../utils/ids.js';

const router = Router();

// Public: Location autocomplete & search
router.get('/places', searchPlacesHandler);
router.get('/autocomplete', searchPlacesHandler);

// Public: Upfront fare estimation
router.post('/estimate', estimateFareHandler);

// Protected: Ride Booking Creation (Booking.bookRide()) — RIDER ONLY
router.post(
  '/',
  authenticateToken,
  requireRole(['RIDER']),
  validateRequiredFields(['pickupAddress', 'destAddress']),
  createBookingHandler
);

// Protected: List passenger bookings — RIDER or ADMIN ONLY
router.get(
  '/',
  authenticateToken,
  requireRole(['RIDER', 'ADMIN']),
  listBookingsHandler
);

// Protected: Rider live tracking for their own active bookings
router.get(
  '/:id/tracking',
  authenticateToken,
  requireRole(['RIDER']),
  getBookingTrackingHandler
);

// Protected: Booking status & details (Booking.getBookingStatus()) — RIDER or ADMIN ONLY
router.get(
  '/:id',
  authenticateToken,
  requireRole(['RIDER', 'ADMIN']),
  getBookingHandler
);

// Protected: Booking cancellation (Booking.cancelRide()) — RIDER or ADMIN ONLY
router.patch(
  '/:id/cancel',
  authenticateToken,
  requireRole(['RIDER', 'ADMIN']),
  cancelBookingHandler
);
router.post(
  '/:id/cancel',
  authenticateToken,
  requireRole(['RIDER', 'ADMIN']),
  cancelBookingHandler
);

// Protected: Assign nearest available driver (REQ-022) — RIDER or ADMIN ONLY
router.post(
  '/:id/assign-nearest',
  authenticateToken,
  requireRole(['RIDER', 'ADMIN']),
  async (req, res, next) => {
    try {
      const bookingId = parsePositiveIntegerId(req.params.id);
      if (bookingId === null) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_ID', message: 'Booking ID must be a positive integer.' },
        });
      }
      const result = await driverService.assignNearestDriver(bookingId, req.user);
      res.status(200).json({
        success: true,
        data: result,
        message: result.message,
      });
    } catch (err) {
      next(err);
    }
  }
);

// Protected: Process simulated payment for completed booking — RIDER ONLY
router.post(
  '/:id/pay',
  authenticateToken,
  requireRole(['RIDER']),
  async (req, res, next) => {
    try {
      const { paymentMethod, simulateFailure } = req.body;
      const payment = await paymentService.processPayment({
        userId: req.user.user_id,
        bookingId: req.params.id,
        paymentMethod,
        simulateFailure: simulateFailure === true,
      });

      res.status(201).json({
        success: true,
        data: payment,
        message: 'Simulated payment completed successfully.',
      });
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({
          success: false,
          error: { code: err.code || 'PAYMENT_ERROR', message: err.message },
          data: err.data || null,
        });
      }
      next(err);
    }
  }
);

// Protected: Submit post-trip rating for completed booking — RIDER ONLY
router.post(
  '/:id/rate',
  authenticateToken,
  requireRole(['RIDER']),
  async (req, res, next) => {
    try {
      const { rating, comments } = req.body;
      const result = await ratingService.submitRating({
        userId: req.user.user_id,
        bookingId: req.params.id,
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
          error: { code: err.code || 'RATING_ERROR', message: err.message },
        });
      }
      next(err);
    }
  }
);

// Protected: View payment details for booking — RIDER or ADMIN
router.get(
  '/:id/payment',
  authenticateToken,
  requireRole(['RIDER', 'ADMIN']),
  async (req, res, next) => {
    try {
      const paymentData = await paymentService.getPaymentByBookingId(req.params.id, req.user);
      res.status(200).json({
        success: true,
        data: paymentData,
      });
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({
          success: false,
          error: { code: err.code || 'PAYMENT_ERROR', message: err.message },
        });
      }
      next(err);
    }
  }
);

// Protected: View rating details for booking
router.get(
  '/:id/rating',
  authenticateToken,
  async (req, res, next) => {
    try {
      const rating = await ratingService.getRatingByBookingId(req.params.id);
      res.status(200).json({
        success: true,
        data: rating,
      });
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({
          success: false,
          error: { code: err.code || 'RATING_ERROR', message: err.message },
        });
      }
      next(err);
    }
  }
);

export default router;
