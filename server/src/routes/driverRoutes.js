import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/authMiddleware.js';
import { driverDocumentUpload } from '../middleware/uploadMiddleware.js';
import * as driverService from '../services/driverService.js';

const router = Router();

// Protect all driver routes with authentication and DRIVER role requirement
router.use(authenticateToken);
router.use(requireRole(['DRIVER']));

/**
 * GET /api/driver/profile
 * Retrieve driver operational profile and verification status
 */
router.get('/profile', async (req, res, next) => {
  try {
    const profile = await driverService.getDriverProfile(req.user.user_id);
    res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/driver/duty
 * Toggle driver availability / duty status
 */
router.patch('/duty', async (req, res, next) => {
  try {
    const { isAvailable } = req.body;
    const result = await driverService.setDriverDuty(req.user.user_id, isAvailable);
    res.status(200).json({
      success: true,
      data: result,
      message: `Driver operational status updated to ${result.is_available ? 'ONLINE' : 'OFFLINE'}.`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/driver/location
 * Update driver geographic coordinates (REQ-022)
 */
router.patch('/location', async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body
      : {};
    const { latitude, longitude, fixTimestampMs } = body;
    const result = await driverService.updateDriverLocation(req.user.user_id, {
      latitude,
      longitude,
      fixTimestampMs,
    });
    res.status(200).json({
      success: true,
      data: result,
      message: 'Driver location telemetry updated successfully.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/driver/documents
 * Securely upload driver license and vehicle documents (REQ-013, REQ-014)
 */
router.post('/documents', driverDocumentUpload, async (req, res, next) => {
  try {
    const profile = await driverService.saveDriverDocuments(req.user.user_id, {
      licenseDoc: req.savedDocuments?.licenseDoc,
      vehicleDoc: req.savedDocuments?.vehicleDoc,
    });
    res.status(200).json({
      success: true,
      data: {
        driver_id: profile.driver_id,
        license_doc_path: profile.license_doc_path,
        vehicle_doc_path: profile.vehicle_doc_path,
        uploaded: req.savedDocuments,
      },
      message: 'Driver documents uploaded and verified successfully.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/driver/documents/:docType
 * Private document stream for authenticated driver
 */
router.get('/documents/:docType', async (req, res, next) => {
  try {
    const { docType } = req.params;
    if (docType !== 'license' && docType !== 'vehicle') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_DOC_TYPE', message: "Document type must be 'license' or 'vehicle'." },
      });
    }

    const { fullPath, filename } = await driverService.getDriverDocumentPath({
      reqUser: req.user,
      docType,
    });

    res.sendFile(fullPath);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/driver/dispatch-queue
 * Retrieve eligible ride requests in the dispatch queue
 */
router.get('/dispatch-queue', async (req, res, next) => {
  try {
    const queue = await driverService.getAvailableDispatchQueue(req.user.user_id);
    res.status(200).json({
      success: true,
      data: queue,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/driver/rides/:id/accept
 * Accept a ride request atomically
 */
router.post('/rides/:id/accept', async (req, res, next) => {
  try {
    const bookingId = parseInt(req.params.id, 10);
    if (isNaN(bookingId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Booking ID must be a numeric integer.' },
      });
    }

    const booking = await driverService.acceptBooking(req.user.user_id, bookingId);
    res.status(200).json({
      success: true,
      data: booking,
      message: 'Ride request accepted successfully. Proceed to passenger pickup location.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/driver/rides/:id/reject
 * Reject a ride offer without cancelling rider request
 */
router.post('/rides/:id/reject', async (req, res, next) => {
  try {
    const bookingId = parseInt(req.params.id, 10);
    if (isNaN(bookingId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Booking ID must be a numeric integer.' },
      });
    }

    const result = await driverService.rejectBooking(req.user.user_id, bookingId);
    res.status(200).json({
      success: true,
      data: result,
      message: 'Ride offer declined. The offer remains available to other drivers in the network.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/driver/rides/active
 * Retrieve driver's currently active ride (CONFIRMED or ONGOING)
 */
router.get('/rides/active', async (req, res, next) => {
  try {
    const activeRide = await driverService.getActiveRide(req.user.user_id);
    res.status(200).json({
      success: true,
      data: activeRide,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/driver/rides/:id/start
 * Transition ride status: CONFIRMED -> ONGOING
 */
router.patch('/rides/:id/start', async (req, res, next) => {
  try {
    const bookingId = parseInt(req.params.id, 10);
    if (isNaN(bookingId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Booking ID must be a numeric integer.' },
      });
    }

    const booking = await driverService.startRide(req.user.user_id, bookingId);
    res.status(200).json({
      success: true,
      data: booking,
      message: 'Trip started. En route to destination.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/driver/rides/:id/complete
 * Transition ride status: ONGOING -> COMPLETED
 */
router.patch('/rides/:id/complete', async (req, res, next) => {
  try {
    const bookingId = parseInt(req.params.id, 10);
    if (isNaN(bookingId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Booking ID must be a numeric integer.' },
      });
    }

    const booking = await driverService.completeRide(req.user.user_id, bookingId);
    res.status(200).json({
      success: true,
      data: booking,
      message: 'Trip completed successfully. Final fare calculated.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/driver/rides/history
 * Retrieve driver's completed trips and real earnings
 */
router.get('/rides/history', async (req, res, next) => {
  try {
    const result = await driverService.getDriverHistoryAndEarnings(req.user.user_id);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
