import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/authMiddleware.js';
import { getDbPool } from '../config/db.js';
import * as driverService from '../services/driverService.js';

const router = Router();

// Protect all administrative routes with authentication and ADMIN role requirement
router.use(authenticateToken);
router.use(requireRole(['ADMIN']));

/**
 * GET /api/admin/driver-applications
 * List pending driver partner applications for verification
 */
router.get('/driver-applications', async (req, res, next) => {
  try {
    const applications = await driverService.getPendingDriverApplications();
    res.status(200).json({
      success: true,
      data: applications,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/driver-applications/:id/approve
 * Approve driver partner application
 */
router.patch('/driver-applications/:id/approve', async (req, res, next) => {
  try {
    const driverId = parseInt(req.params.id, 10);
    if (isNaN(driverId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Driver ID must be a numeric integer.' },
      });
    }

    const updated = await driverService.approveDriverApplication(driverId);
    res.status(200).json({
      success: true,
      data: updated,
      message: `Driver application ID ${driverId} approved successfully. Operational access granted.`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/driver-applications/:id/reject
 * Reject driver partner application
 */
router.patch('/driver-applications/:id/reject', async (req, res, next) => {
  try {
    const driverId = parseInt(req.params.id, 10);
    if (isNaN(driverId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Driver ID must be a numeric integer.' },
      });
    }

    const reason = req.body?.reason || 'Application rejected by fleet administrator.';
    const updated = await driverService.rejectDriverApplication(driverId, reason);
    res.status(200).json({
      success: true,
      data: updated,
      message: `Driver application ID ${driverId} was rejected.`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/users
 * Administrator management endpoint: view all registered accounts and role statuses
 */
router.get('/users', async (req, res, next) => {
  try {
    const pool = getDbPool();
    const [rows] = await pool.query(
      `SELECT u.user_id, u.name, u.email, u.phone_no, u.role, u.created_at,
              d.driver_id, d.license_no, d.vehicle_no, d.vehicle_model, d.vehicle_category, d.approval_status, d.is_available
       FROM users u
       LEFT JOIN driver_profiles d ON u.user_id = d.user_id
       ORDER BY u.created_at DESC`
    );

    res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/driver-documents/:driverId/:docType
 * Administrator: inspect submitted driving license or vehicle documents (REQ-015)
 */
router.get('/driver-documents/:driverId/:docType', async (req, res, next) => {
  try {
    const driverId = parseInt(req.params.driverId, 10);
    const { docType } = req.params;

    if (isNaN(driverId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Driver ID must be a numeric integer.' },
      });
    }

    if (docType !== 'license' && docType !== 'vehicle') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_DOC_TYPE', message: "Document type must be 'license' or 'vehicle'." },
      });
    }

    const { fullPath } = await driverService.getDriverDocumentPath({
      reqUser: req.user,
      targetDriverId: driverId,
      docType,
    });

    res.sendFile(fullPath);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/system-stats
 * Administrator governance telemetry
 */
router.get('/system-stats', async (req, res, next) => {
  try {
    const pool = getDbPool();

    const [roleCounts] = await pool.query(
      `SELECT role, COUNT(*) as count FROM users GROUP BY role`
    );

    const [driverCounts] = await pool.query(
      `SELECT approval_status, COUNT(*) as count FROM driver_profiles GROUP BY approval_status`
    );

    const [bookingCounts] = await pool.query(
      `SELECT status, COUNT(*) as count FROM bookings GROUP BY status`
    );

    const [totalBookings] = await pool.query(
      `SELECT COUNT(*) as total, COALESCE(SUM(total_fare), 0) as totalRevenue FROM bookings`
    );

    const [paymentStats] = await pool.query(
      `SELECT 
         COUNT(*) as totalPayments,
         COALESCE(SUM(CASE WHEN payment_status = 'SUCCESS' THEN amount ELSE 0 END), 0) as totalCollectedRevenue,
         COALESCE(SUM(CASE WHEN payment_status = 'REFUND' THEN amount ELSE 0 END), 0) as totalRefundedAmount,
         SUM(CASE WHEN payment_status = 'REFUND' THEN 1 ELSE 0 END) as refundedPayments
       FROM payments`
    );

    const [vehicleStats] = await pool.query(
      `SELECT vehicle_category, COUNT(*) as count FROM driver_profiles GROUP BY vehicle_category`
    );

    const [dispatchFailureCount] = await pool.query(
      `SELECT COUNT(*) as count FROM dispatch_failures`
    );

    res.status(200).json({
      success: true,
      data: {
        usersByRole: roleCounts,
        driversByStatus: driverCounts,
        vehiclesByCategory: vehicleStats,
        totalDispatchFailures: dispatchFailureCount[0]?.count || 0,
        bookingsByStatus: bookingCounts,
        totals: totalBookings[0] || { total: 0, totalRevenue: 0 },
        payments: paymentStats[0] || { totalPayments: 0, totalCollectedRevenue: 0 },
        total_refunded_revenue: Number(paymentStats[0]?.totalRefundedAmount || 0),
        total_collected_revenue: Number(paymentStats[0]?.totalCollectedRevenue || 0),
        systemTime: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/vehicles
 * Administrator fleet management: list all vehicles and statuses
 */
router.get('/vehicles', async (req, res, next) => {
  try {
    const vehicles = await driverService.getAllFleetVehicles();
    res.status(200).json({
      success: true,
      data: vehicles,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/vehicles/:id/status
 * Administrator fleet management: approve, reject, or activate/deactivate vehicle
 */
router.patch('/vehicles/:id/status', async (req, res, next) => {
  try {
    const driverId = parseInt(req.params.id, 10);
    if (isNaN(driverId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Driver ID must be a numeric integer.' },
      });
    }

    const { vehicleApprovalStatus, isVehicleActive } = req.body;
    const updated = await driverService.updateVehicleStatus(driverId, {
      vehicleApprovalStatus,
      isVehicleActive,
    });

    res.status(200).json({
      success: true,
      data: updated,
      message: `Vehicle status for driver ID ${driverId} updated successfully.`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/dispatch-failures
 * Administrator fleet management: view dispatch failure audit log
 */
router.get('/dispatch-failures', async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const failures = await driverService.getDispatchFailures(limit);
    res.status(200).json({
      success: true,
      data: failures,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
