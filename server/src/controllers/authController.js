import * as authService from '../services/authService.js';

/**
 * POST /api/auth/register
 * Register a new user account (RIDER or DRIVER only)
 */
export async function registerHandler(req, res, next) {
  try {
    const {
      name,
      email,
      phoneNo,
      password,
      role = 'RIDER',
      licenseNo,
      vehicleNo,
      vehicleModel,
      vehicleCategory,
      vehicleColor,
      passengerCapacity,
    } = req.body;

    const result = await authService.register({
      name,
      email,
      phoneNo,
      password,
      role,
      licenseNo,
      vehicleNo,
      vehicleModel,
      vehicleCategory,
      vehicleColor,
      passengerCapacity,
    });

    res.status(201).json({
      success: true,
      data: {
        user: result.user,
        token: result.token,
      },
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 * Authenticate user and issue JWT with trusted role
 */
export async function loginHandler(req, res, next) {
  try {
    const { email, password } = req.body;

    const result = await authService.login({ email, password });

    res.status(200).json({
      success: true,
      data: {
        user: result.user,
        token: result.token,
      },
      message: `Signed in successfully as ${result.user.role}.`,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me
 * Retrieve currently authenticated user's trusted profile
 */
export async function getMeHandler(req, res, next) {
  try {
    // req.user was populated by authenticateToken middleware
    res.status(200).json({
      success: true,
      data: req.user,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout
 * Client-side session termination confirmation
 */
export async function logoutHandler(req, res, next) {
  try {
    res.status(200).json({
      success: true,
      message: 'Signed out successfully.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/forgot-password
 * Request single-use password reset token (REQ-009)
 */
export async function forgotPasswordHandler(req, res, next) {
  try {
    const { email } = req.body;
    const result = await authService.requestPasswordReset(email);
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/reset-password
 * Reset user password using token (REQ-009)
 */
export async function resetPasswordHandler(req, res, next) {
  try {
    const { token, newPassword } = req.body;
    const result = await authService.resetPassword({ token, newPassword });
    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
}
