import { Router } from 'express';
import {
  registerHandler,
  loginHandler,
  getMeHandler,
  logoutHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
} from '../controllers/authController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { validateRequiredFields } from '../middleware/validateRequest.js';

const router = Router();

// Public: POST /api/auth/register
router.use(
  '/register',
  (req, res, next) => {
    if (req.method === 'POST') {
      return validateRequiredFields(['name', 'email', 'phoneNo', 'password'])(req, res, next);
    }
    next();
  },
  registerHandler
);

// Public: POST /api/auth/login
router.post(
  '/login',
  validateRequiredFields(['email', 'password']),
  loginHandler
);

// Public: POST /api/auth/forgot-password (REQ-009)
router.post(
  '/forgot-password',
  validateRequiredFields(['email']),
  forgotPasswordHandler
);

// Public: POST /api/auth/reset-password (REQ-009)
router.post(
  '/reset-password',
  validateRequiredFields(['token', 'newPassword']),
  resetPasswordHandler
);

// Protected: GET /api/auth/me
router.get('/me', authenticateToken, getMeHandler);

// Protected: POST /api/auth/logout
router.post('/logout', authenticateToken, logoutHandler);

export default router;
