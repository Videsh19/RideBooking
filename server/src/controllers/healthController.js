import { env } from '../config/env.js';
import { testDatabaseConnection } from '../config/db.js';

/**
 * Controller for GET /api/health
 * Evaluates Express runtime state and MySQL reachability without throwing.
 */
export async function getHealthStatus(req, res, next) {
  try {
    const dbProbe = await testDatabaseConnection();

    const healthData = {
      status: 'operational',
      service: 'GoRide REST API',
      title: 'GoRide — Smart Urban Ride Booking and Management System',
      tagline: 'Move Smarter. Ride Better.',
      version: '1.0.0-phase2',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      environment: env.nodeEnv,
      database: {
        driver: 'mysql2',
        configuredHost: env.db.host,
        configuredDatabase: env.db.database,
        status: dbProbe.status,
        isConnected: dbProbe.isConnected,
        message: dbProbe.message,
        ...(dbProbe.mysqlVersion ? { version: dbProbe.mysqlVersion } : {}),
        ...(dbProbe.errorCode ? { errorCode: dbProbe.errorCode } : {}),
      },
      phase: {
        current: 'Phase 2: MySQL Integration & Ride Booking Management',
        featuresActive: [
          'MySQL relational database connected',
          'UML Booking entities & schema migrated',
          'Booking creation (Booking.bookRide()) operational',
          'Booking cancellation (Booking.cancelRide()) operational',
          'Booking status retrieval (Booking.getBookingStatus()) operational',
          'Service area restricted to Mumbai Metropolitan Region (6 zones)',
        ],
        scopeRestrictions: [
          'No driver matching or assignment algorithms',
          'No driver availability management',
          'No live GPS telemetry tracking',
          'No payment gateway processing',
        ],
      },
    };

    res.status(200).json({
      success: true,
      data: healthData,
    });
  } catch (err) {
    next(err);
  }
}
