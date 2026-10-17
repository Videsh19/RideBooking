import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDbPool } from '../config/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'goride_development_secret_key_change_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Generate a signed JWT token containing user identity and trusted role
 */
export function generateToken(user) {
  return jwt.sign(
    {
      userId: user.user_id,
      email: user.email,
      role: user.role,
      name: user.name,
      tokenVersion: user.token_version || 1,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Public User Registration
 * Enforces role restriction: Only 'RIDER' or 'DRIVER' accounts can be registered.
 * Public self-registration of 'ADMIN' is strictly forbidden.
 */
export async function register({
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
}) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw { statusCode: 400, code: 'INVALID_NAME', message: 'Full legal name is required.' };
  }
  if (!email || typeof email !== 'string' || !email.trim()) {
    throw { statusCode: 400, code: 'INVALID_EMAIL', message: 'Valid email address is required.' };
  }
  if (!phoneNo || typeof phoneNo !== 'string' || !phoneNo.trim()) {
    throw { statusCode: 400, code: 'INVALID_PHONE', message: 'Mobile phone number is required.' };
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    throw { statusCode: 400, code: 'WEAK_PASSWORD', message: 'Password must be at least 6 characters long.' };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const requestedRole = (role || 'RIDER').toUpperCase();

  // Strict role security: Public users cannot self-assign ADMIN
  if (requestedRole === 'ADMIN') {
    throw {
      statusCode: 403,
      code: 'ADMIN_REGISTRATION_FORBIDDEN',
      message: 'Administrative accounts cannot be self-registered through the public portal. Admin accounts must be pre-provisioned.',
    };
  }

  if (requestedRole !== 'RIDER' && requestedRole !== 'DRIVER') {
    throw {
      statusCode: 400,
      code: 'INVALID_ROLE',
      message: "Role must be either 'RIDER' or 'DRIVER'.",
    };
  }

  // Enforce driver registration requirements
  let cleanVehicleCategory = null;
  if (requestedRole === 'DRIVER') {
    if (!licenseNo || typeof licenseNo !== 'string' || !licenseNo.trim()) {
      throw {
        statusCode: 400,
        code: 'INVALID_LICENSE',
        message: 'Driving license number is required for driver partner registration.',
      };
    }
    if (!vehicleNo || typeof vehicleNo !== 'string' || !vehicleNo.trim()) {
      throw {
        statusCode: 400,
        code: 'INVALID_VEHICLE_NO',
        message: 'Vehicle registration number is required for driver partner registration.',
      };
    }
    if (!vehicleModel || typeof vehicleModel !== 'string' || !vehicleModel.trim()) {
      throw {
        statusCode: 400,
        code: 'INVALID_VEHICLE_MODEL',
        message: 'Vehicle make and model are required for driver partner registration.',
      };
    }

    if (!vehicleCategory || typeof vehicleCategory !== 'string' || !vehicleCategory.trim()) {
      throw {
        statusCode: 400,
        code: 'INVALID_VEHICLE_CATEGORY',
        message: "Vehicle category is required for driver partner registration ('STANDARD', 'COMFORT', or 'XL').",
      };
    }
    cleanVehicleCategory = vehicleCategory.trim().toUpperCase();
    if (!['STANDARD', 'COMFORT', 'XL'].includes(cleanVehicleCategory)) {
      throw {
        statusCode: 400,
        code: 'INVALID_VEHICLE_CATEGORY',
        message: "Vehicle category must be one of 'STANDARD', 'COMFORT', or 'XL'.",
      };
    }
  }

  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Check if email already registered
    const [existing] = await connection.query('SELECT user_id FROM users WHERE email = ?', [normalizedEmail]);
    if (existing.length > 0) {
      throw {
        statusCode: 409,
        code: 'EMAIL_ALREADY_EXISTS',
        message: `An account with email '${normalizedEmail}' is already registered.`,
      };
    }

    // Check if mobile phone number already registered (REQ-003)
    const [existingPhone] = await connection.query('SELECT user_id FROM users WHERE phone_no = ?', [phoneNo.trim()]);
    if (existingPhone.length > 0) {
      throw {
        statusCode: 409,
        code: 'PHONE_ALREADY_REGISTERED',
        message: `Mobile number '${phoneNo.trim()}' is already registered with another account.`,
      };
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user record with trusted role
    const [userResult] = await connection.query(
      `INSERT INTO users (name, phone_no, email, password_hash, role, token_version)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [name.trim(), phoneNo.trim(), normalizedEmail, passwordHash, requestedRole]
    );

    const userId = userResult.insertId;

    // If registering as a Driver, initialize Driver Profile with PENDING approval status
    let driverProfile = null;
    if (requestedRole === 'DRIVER') {
      const cleanLicense = licenseNo.trim();
      const cleanVehicleNo = vehicleNo.trim();
      const cleanVehicleModel = vehicleModel.trim();
      const cleanVehicleColor = (vehicleColor && typeof vehicleColor === 'string' && vehicleColor.trim())
        ? vehicleColor.trim()
        : 'White';
      const cleanPassengerCapacity = parseInt(passengerCapacity, 10) > 0
        ? parseInt(passengerCapacity, 10)
        : (cleanVehicleCategory === 'XL' ? 6 : 4);

      const [driverResult] = await connection.query(
        `INSERT INTO driver_profiles (
           user_id, license_no, vehicle_no, vehicle_model, vehicle_category,
           vehicle_color, passenger_capacity, approval_status, vehicle_approval_status,
           is_vehicle_active, is_available
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', TRUE, FALSE)`,
        [
          userId,
          cleanLicense,
          cleanVehicleNo,
          cleanVehicleModel,
          cleanVehicleCategory,
          cleanVehicleColor,
          cleanPassengerCapacity,
        ]
      );

      driverProfile = {
        driver_id: driverResult.insertId,
        license_no: cleanLicense,
        vehicle_no: cleanVehicleNo,
        vehicle_model: cleanVehicleModel,
        vehicle_category: cleanVehicleCategory,
        vehicle_color: cleanVehicleColor,
        passenger_capacity: cleanPassengerCapacity,
        approval_status: 'PENDING',
        vehicle_approval_status: 'PENDING',
        is_vehicle_active: true,
        is_available: false,
      };
    }

    await connection.commit();

    const newUser = {
      user_id: userId,
      name: name.trim(),
      email: normalizedEmail,
      phone_no: phoneNo.trim(),
      role: requestedRole,
      token_version: 1,
      driver_profile: driverProfile,
    };

    const token = generateToken(newUser);

    return {
      user: newUser,
      token,
      message: requestedRole === 'DRIVER'
        ? 'Driver account created successfully. Verification status is PENDING administrative review.'
        : 'Rider account registered successfully.',
    };
  } catch (err) {
    await connection.rollback();
    // Catch database-level unique constraint violations safely (no HTTP 500)
    if (err.code === 'ER_DUP_ENTRY') {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('phone') || msg.includes('uq_users_phone')) {
        throw {
          statusCode: 409,
          code: 'PHONE_ALREADY_REGISTERED',
          message: `Mobile number '${phoneNo.trim()}' is already registered with another account.`,
        };
      }
      if (msg.includes('email') || msg.includes('users.email')) {
        throw {
          statusCode: 409,
          code: 'EMAIL_ALREADY_EXISTS',
          message: `An account with email '${normalizedEmail}' is already registered.`,
        };
      }
    }
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * User Authentication (Login)
 * Validates credentials and retrieves user's true trusted role from MySQL.
 */
export async function login({ email, password }) {
  if (!email || !password) {
    throw { statusCode: 400, code: 'MISSING_CREDENTIALS', message: 'Email and password are required.' };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const pool = getDbPool();

  const [rows] = await pool.query(
    `SELECT u.user_id, u.name, u.email, u.phone_no, u.password_hash, u.role, u.token_version,
            d.driver_id, d.license_no, d.vehicle_no, d.vehicle_model, d.approval_status, d.is_available, d.rating
     FROM users u
     LEFT JOIN driver_profiles d ON u.user_id = d.user_id
     WHERE u.email = ?`,
    [normalizedEmail]
  );

  if (rows.length === 0) {
    throw { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid email address or password.' };
  }

  const userRow = rows[0];
  const isMatch = await bcrypt.compare(password, userRow.password_hash);

  if (!isMatch) {
    throw { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid email address or password.' };
  }

  let driverProfile = null;
  if (userRow.role === 'DRIVER') {
    driverProfile = {
      driver_id: userRow.driver_id,
      license_no: userRow.license_no,
      vehicle_no: userRow.vehicle_no,
      vehicle_model: userRow.vehicle_model,
      approval_status: userRow.approval_status || 'PENDING',
      is_available: Boolean(userRow.is_available),
      rating: userRow.rating ? Number(userRow.rating) : 5.0,
    };
  }

  const authenticatedUser = {
    user_id: userRow.user_id,
    name: userRow.name,
    email: userRow.email,
    phone_no: userRow.phone_no,
    role: userRow.role,
    token_version: userRow.token_version || 1,
    driver_profile: driverProfile,
  };

  const token = generateToken(authenticatedUser);

  return {
    user: authenticatedUser,
    token,
  };
}

/**
 * Fetch fresh user profile from database by User ID
 */
export async function getUserById(userId) {
  const pool = getDbPool();
  const [rows] = await pool.query(
    `SELECT u.user_id, u.name, u.email, u.phone_no, u.role, u.token_version, u.created_at,
            d.driver_id, d.license_no, d.vehicle_no, d.vehicle_model, d.approval_status, d.is_available, d.rating
     FROM users u
     LEFT JOIN driver_profiles d ON u.user_id = d.user_id
     WHERE u.user_id = ?`,
    [userId]
  );

  if (rows.length === 0) {
    throw { statusCode: 404, code: 'USER_NOT_FOUND', message: 'User record not found.' };
  }

  const row = rows[0];
  let driverProfile = null;
  if (row.role === 'DRIVER') {
    driverProfile = {
      driver_id: row.driver_id,
      license_no: row.license_no,
      vehicle_no: row.vehicle_no,
      vehicle_model: row.vehicle_model,
      approval_status: row.approval_status || 'PENDING',
      is_available: Boolean(row.is_available),
      rating: row.rating ? Number(row.rating) : 5.0,
    };
  }

  return {
    user_id: row.user_id,
    name: row.name,
    email: row.email,
    phone_no: row.phone_no,
    role: row.role,
    token_version: row.token_version || 1,
    created_at: row.created_at,
    driver_profile: driverProfile,
  };
}

/**
 * Request Password Reset (REQ-009)
 * Generates single-use expiring token. Anti-enumeration protection.
 */
export async function requestPasswordReset(email) {
  if (!email || typeof email !== 'string' || !email.trim()) {
    throw { statusCode: 400, code: 'INVALID_EMAIL', message: 'Valid email address is required.' };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const pool = getDbPool();
  const [rows] = await pool.query('SELECT user_id, email, name FROM users WHERE email = ?', [normalizedEmail]);

  // Anti-enumeration guarantee: always return uniform message
  const genericResponse = {
    success: true,
    message: 'If that email address is in our system, password reset instructions have been generated.',
  };

  if (rows.length === 0) {
    return genericResponse;
  }

  const user = rows[0];
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes validity

  await pool.query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at)
     VALUES (?, ?, ?)`,
    [user.user_id, tokenHash, expiresAt]
  );

  // In development environments without real SMTP delivery, include development token
  if (process.env.NODE_ENV !== 'production') {
    return {
      ...genericResponse,
      devResetToken: rawToken,
      devExpiresAt: expiresAt.toISOString(),
      message: `${genericResponse.message} (Development Mode: Reset token generated for local testing)`,
    };
  }

  return genericResponse;
}

/**
 * Reset Password Using Validated Single-Use Token (REQ-009)
 * Hashes new password with bcrypt and revokes existing sessions.
 */
export async function resetPassword({ token, newPassword }) {
  if (!token || typeof token !== 'string' || !token.trim()) {
    throw { statusCode: 400, code: 'INVALID_RESET_TOKEN', message: 'Password reset token is required.' };
  }
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    throw { statusCode: 400, code: 'WEAK_PASSWORD', message: 'Password must be at least 6 characters long.' };
  }

  const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT reset_id, user_id, expires_at, used_at
       FROM password_resets
       WHERE token_hash = ?
       FOR UPDATE`,
      [tokenHash]
    );

    if (rows.length === 0) {
      throw { statusCode: 400, code: 'INVALID_RESET_TOKEN', message: 'Invalid or unrecognized password reset token.' };
    }

    const resetRecord = rows[0];

    if (resetRecord.used_at !== null) {
      throw { statusCode: 400, code: 'TOKEN_ALREADY_USED', message: 'This password reset token has already been used.' };
    }

    if (new Date(resetRecord.expires_at) < new Date()) {
      throw { statusCode: 400, code: 'TOKEN_EXPIRED', message: 'This password reset token has expired. Please request a new one.' };
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update user password and increment token_version to invalidate prior JWT sessions
    await connection.query(
      `UPDATE users
       SET password_hash = ?, token_version = token_version + 1, updated_at = NOW()
       WHERE user_id = ?`,
      [newPasswordHash, resetRecord.user_id]
    );

    // Mark reset token as used
    await connection.query(
      `UPDATE password_resets
       SET used_at = NOW()
       WHERE reset_id = ?`,
      [resetRecord.reset_id]
    );

    await connection.commit();

    return {
      success: true,
      message: 'Password has been reset successfully. All previous sessions have been invalidated. Please sign in with your new password.',
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}
