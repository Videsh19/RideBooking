/**
 * Basic request body validation helper convention.
 * @param {Array<string>} requiredFields - List of property keys that must be present in req.body.
 */
export function validateRequiredFields(requiredFields = []) {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST_BODY',
          message: 'Request body must be a valid JSON object.',
        },
      });
    }

    const missingFields = requiredFields.filter((field) => {
      const val = req.body[field];
      return val === undefined || val === null || (typeof val === 'string' && val.trim() === '');
    });

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: `Missing required request fields: ${missingFields.join(', ')}`,
          missingFields,
        },
      });
    }

    next();
  };
}
