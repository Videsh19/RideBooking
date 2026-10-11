import { env } from '../config/env.js';

/**
 * Handle requests to endpoints that do not exist
 */
export function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `The requested endpoint '${req.method} ${req.originalUrl}' does not exist on this server.`,
    },
  });
}

/**
 * Centralized application error handling middleware
 */
export function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || err.status;
  if (!statusCode) {
    if (err.name === 'MulterError') {
      statusCode = 400;
    } else {
      statusCode = 500;
    }
  }
  const message = err.message || 'An unexpected internal server error occurred.';

  const response = {
    success: false,
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message,
      timestamp: new Date().toISOString(),
    },
  };

  if (!env.isProduction && err.stack) {
    response.error.stack = err.stack;
  }

  // Log server-side errors
  if (statusCode >= 500) {
    console.error(`[GoRide Error ${statusCode}]`, err);
  }

  res.status(statusCode).json(response);
}
