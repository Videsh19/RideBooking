import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/authMiddleware.js';
import * as paymentService from '../services/paymentService.js';

const router = Router();

// Protect all payment endpoints with authentication
router.use(authenticateToken);

/**
 * POST /api/payments
 * Initiate simulated payment for an eligible COMPLETED booking
 * Protected: RIDER role only
 */
router.post('/', requireRole(['RIDER']), async (req, res, next) => {
  try {
    const { bookingId, paymentMethod, simulateFailure } = req.body;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Booking ID is required to process payment.' },
      });
    }

    const payment = await paymentService.processPayment({
      userId: req.user.user_id,
      bookingId,
      paymentMethod,
      simulateFailure: Boolean(simulateFailure),
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
        error: {
          code: err.code || 'PAYMENT_ERROR',
          message: err.message,
        },
        data: err.data || null,
      });
    }
    next(err);
  }
});

/**
 * GET /api/payments/booking/:bookingId
 * Retrieve payment status & records for a specific booking
 * Protected: RIDER (own bookings) or ADMIN
 * Drivers are explicitly forbidden (enforced in service layer)
 */
router.get('/booking/:bookingId', async (req, res, next) => {
  try {
    const paymentData = await paymentService.getPaymentByBookingId(
      req.params.bookingId,
      req.user
    );

    res.status(200).json({
      success: true,
      data: paymentData,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'PAYMENT_ERROR',
          message: err.message,
        },
      });
    }
    next(err);
  }
});

/**
 * GET /api/payments/my-payments
 * Retrieve passenger payment history
 * Protected: RIDER only
 */
router.get('/my-payments', requireRole(['RIDER']), async (req, res, next) => {
  try {
    const payments = await paymentService.listRiderPayments(req.user.user_id);
    res.status(200).json({
      success: true,
      data: payments,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/payments/admin/all
 * Retrieve network payments and financial audit summary
 * Protected: ADMIN only
 */
router.get('/admin/all', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const result = await paymentService.listAdminPayments();
    res.status(200).json({
      success: true,
      data: result.payments,
      summary: result.summary,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/payments/:id/refund
 * Administrative payment refund (UML: Payment.refundPayment())
 * Protected: ADMIN only
 */
router.post('/:id/refund', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const paymentId = parseInt(req.params.id, 10);
    const { reason = 'Administrative refund requested' } = req.body || {};

    if (isNaN(paymentId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Payment ID must be a numeric integer.' },
      });
    }

    const result = await paymentService.refundPayment({
      paymentId,
      adminUserId: req.user.user_id,
      reason,
    });

    res.status(200).json({
      success: true,
      data: result,
      message: result.message,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'REFUND_ERROR',
          message: err.message,
        },
      });
    }
    next(err);
  }
});

export default router;
