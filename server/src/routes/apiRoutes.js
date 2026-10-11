import { Router } from 'express';
import healthRoutes from './healthRoutes.js';
import authRoutes from './authRoutes.js';
import bookingRoutes from './bookingRoutes.js';
import driverRoutes from './driverRoutes.js';
import adminRoutes from './adminRoutes.js';
import paymentRoutes from './paymentRoutes.js';
import ratingRoutes from './ratingRoutes.js';

const router = Router();

// System health probe
router.use('/health', healthRoutes);

// Authentication & Session Management
router.use('/auth', authRoutes);

// Ride Booking Management (Rider role)
router.use('/bookings', bookingRoutes);

// Driver Console Operations (Driver role)
router.use('/driver', driverRoutes);

// Fleet Governance & Admin Operations (Admin role)
router.use('/admin', adminRoutes);

// Payment Management & Simulations (Rider & Admin roles)
router.use('/payments', paymentRoutes);

// Post-Trip Ratings & Reviews (Rider, Driver, Admin roles)
router.use('/ratings', ratingRoutes);

export default router;
