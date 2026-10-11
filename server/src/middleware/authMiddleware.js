import jwt from 'jsonwebtoken';
import { getUserById } from '../services/authService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'goride_development_secret_key_change_in_production';

/**
 * Authenticates requests using trusted JWT tokens.
 * Validates token signature and verifies user exists in database.
 */
export async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication token is required to access this resource. Please sign in.',
        },
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Authentication token is invalid or has expired. Please sign in again.',
        },
      });
    }

    // Always fetch fresh user from database to verify account still exists and role hasn't changed
    const user = await getUserById(decoded.userId);

    // Verify token version for session invalidation (REQ-009)
    if (decoded.tokenVersion && user.token_version && decoded.tokenVersion !== user.token_version) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'SESSION_REVOKED',
          message: 'Your session has been invalidated due to a password reset or security update. Please sign in again.',
        },
      });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Enforces role-based access control (RBAC).
 * Returns HTTP 403 Forbidden if user's trusted role is not in the allowed list.
 *
 * @param {string[]} allowedRoles - Array of allowed roles (e.g. ['RIDER'], ['DRIVER'], ['ADMIN'])
 */
export function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication is required before checking role permissions.',
        },
      });
    }

    const normalizedAllowed = allowedRoles.map((r) => r.toUpperCase());
    const userRole = (req.user.role || '').toUpperCase();

    if (!normalizedAllowed.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. This action requires role: [${allowedRoles.join(' or ')}]. Your authenticated role is: [${userRole}].`,
        },
      });
    }

    next();
  };
}
