import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { getDbPool } from '../config/db.js';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Execute idempotent database schema migration and role-based seeding
 */
export async function runMigrations() {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found at: ${schemaPath}`);
  }

  const rawSql = fs.readFileSync(schemaPath, 'utf-8');
  
  // Split statements by semicolon while ignoring empty segments
  const statements = rawSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    for (const statement of statements) {
      if (statement.trim()) {
        await connection.query(statement);
      }
    }

    // Programmatic migration: Ensure role column exists on users table
    const [roleCol] = await connection.query("SHOW COLUMNS FROM users LIKE 'role'");
    if (roleCol.length === 0) {
      await connection.query(
        "ALTER TABLE users ADD COLUMN role ENUM('RIDER', 'DRIVER', 'ADMIN') NOT NULL DEFAULT 'RIDER' AFTER password_hash"
      );
    }

    // Programmatic migration: Ensure driver_id column exists on bookings table
    const [driverCol] = await connection.query("SHOW COLUMNS FROM bookings LIKE 'driver_id'");
    if (driverCol.length === 0) {
      await connection.query(
        `ALTER TABLE bookings 
         ADD COLUMN driver_id INT NULL AFTER user_id,
         ADD CONSTRAINT fk_bookings_driver FOREIGN KEY (driver_id) REFERENCES driver_profiles(driver_id) ON DELETE SET NULL,
         ADD INDEX idx_booking_driver (driver_id)`
      );
    }

    // Programmatic migration: Ensure completed_at column exists on bookings table
    const [compCol] = await connection.query("SHOW COLUMNS FROM bookings LIKE 'completed_at'");
    if (compCol.length === 0) {
      await connection.query("ALTER TABLE bookings ADD COLUMN completed_at TIMESTAMP NULL AFTER cancelled_at");
      await connection.query("UPDATE bookings SET completed_at = updated_at WHERE status = 'COMPLETED' AND completed_at IS NULL");
    }

    // Programmatic migration: Ensure payment_status column exists on bookings table
    const [payCol] = await connection.query("SHOW COLUMNS FROM bookings LIKE 'payment_status'");
    if (payCol.length === 0) {
      await connection.query("ALTER TABLE bookings ADD COLUMN payment_status ENUM('UNPAID', 'PAID') NOT NULL DEFAULT 'UNPAID' AFTER status");
    }

    // Ensure driver_booking_rejections table exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS driver_booking_rejections (
        rejection_id INT AUTO_INCREMENT PRIMARY KEY,
        driver_id INT NOT NULL,
        booking_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_driver_booking_rej (driver_id, booking_id),
        FOREIGN KEY (driver_id) REFERENCES driver_profiles(driver_id) ON DELETE CASCADE,
        FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure payments table exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS payments (
        payment_id INT AUTO_INCREMENT PRIMARY KEY,
        booking_id INT NOT NULL,
        user_id INT NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        payment_method ENUM('Cash', 'Card', 'UPI', 'Wallet', 'NetBanking') NOT NULL,
        payment_status ENUM('PENDING', 'SUCCESS', 'FAILED', 'REFUND') NOT NULL DEFAULT 'PENDING',
        transaction_id VARCHAR(100) NOT NULL UNIQUE,
        successful_booking_id INT GENERATED ALWAYS AS (IF(payment_status = 'SUCCESS', booking_id, NULL)) STORED,
        payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_successful_payment (successful_booking_id),
        FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        INDEX idx_payment_booking (booking_id),
        INDEX idx_payment_user (user_id),
        INDEX idx_payment_status (payment_status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Cash collection fields are nullable so legacy Cash payment records are not
    // interpreted as collected when this additive migration is applied.
    const [cashCollectionStatusCol] = await connection.query(
      "SHOW COLUMNS FROM payments LIKE 'cash_collection_status'"
    );
    if (cashCollectionStatusCol.length === 0) {
      await connection.query(
        "ALTER TABLE payments ADD COLUMN cash_collection_status ENUM('OUTSTANDING', 'COLLECTED') NULL DEFAULT NULL AFTER payment_status"
      );
    }

    const [cashCollectedAtCol] = await connection.query(
      "SHOW COLUMNS FROM payments LIKE 'cash_collected_at'"
    );
    if (cashCollectedAtCol.length === 0) {
      await connection.query(
        'ALTER TABLE payments ADD COLUMN cash_collected_at TIMESTAMP NULL AFTER cash_collection_status'
      );
    }

    const [cashCollectorCol] = await connection.query(
      "SHOW COLUMNS FROM payments LIKE 'cash_collected_by_driver_id'"
    );
    if (cashCollectorCol.length === 0) {
      await connection.query(
        'ALTER TABLE payments ADD COLUMN cash_collected_by_driver_id INT NULL AFTER cash_collected_at'
      );
    }

    const [cashCollectorForeignKey] = await connection.query(
      `SELECT CONSTRAINT_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'payments'
         AND CONSTRAINT_NAME = 'fk_payments_cash_collector'
       LIMIT 1`
    );
    if (cashCollectorForeignKey.length === 0) {
      await connection.query(
        `ALTER TABLE payments
         ADD CONSTRAINT fk_payments_cash_collector
         FOREIGN KEY (cash_collected_by_driver_id)
         REFERENCES driver_profiles(driver_id) ON DELETE SET NULL`
      );
    }

    const [cashCollectionIndex] = await connection.query(
      "SHOW INDEX FROM payments WHERE Key_name = 'idx_payment_cash_collection'"
    );
    if (cashCollectionIndex.length === 0) {
      await connection.query(
        'ALTER TABLE payments ADD INDEX idx_payment_cash_collection (cash_collection_status)'
      );
    }

    // Ensure ratings table exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS ratings (
        rating_id INT AUTO_INCREMENT PRIMARY KEY,
        booking_id INT NOT NULL UNIQUE,
        user_id INT NOT NULL,
        driver_id INT NOT NULL,
        rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comments VARCHAR(500) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (driver_id) REFERENCES driver_profiles(driver_id) ON DELETE CASCADE,
        INDEX idx_rating_driver (driver_id),
        INDEX idx_rating_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // -------------------------------------------------------------------------
    // Phase 4 Migrations: REQ-003, REQ-009, REQ-013, REQ-014, REQ-022, REQ-027, UML Refund
    // -------------------------------------------------------------------------

    // Phase 4.1: token_version column on users table (for secure JWT session revocation on password reset)
    const [tokenVerCol] = await connection.query("SHOW COLUMNS FROM users LIKE 'token_version'");
    if (tokenVerCol.length === 0) {
      await connection.query("ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 1 AFTER role");
    }

    // Phase 4.2: Audit users.phone_no uniqueness and conditionally apply index if safe (REQ-003)
    const [phoneDuplicates] = await connection.query(
      'SELECT phone_no, COUNT(*) as count, GROUP_CONCAT(user_id) as ids FROM users GROUP BY phone_no HAVING count > 1'
    );
    if (phoneDuplicates.length > 0) {
      console.warn(
        `[MIGRATION_BLOCKED] Unique constraint uq_users_phone cannot be added because duplicate phone numbers exist:`,
        phoneDuplicates.map((d) => `Phone: ${d.phone_no} (IDs: ${d.ids})`).join('; ')
      );
    } else {
      const [phoneIdx] = await connection.query("SHOW INDEX FROM users WHERE Key_name = 'uq_users_phone'");
      if (phoneIdx.length === 0) {
        await connection.query("ALTER TABLE users ADD UNIQUE KEY uq_users_phone (phone_no)");
      }
    }

    // Phase 4.3: password_resets table (REQ-009)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        reset_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token_hash VARCHAR(64) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        INDEX idx_token_hash (token_hash),
        INDEX idx_user_resets (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Phase 4.4: driver_profiles document paths & location coordinates (REQ-013, REQ-014, REQ-022)
    const [licDocCol] = await connection.query("SHOW COLUMNS FROM driver_profiles LIKE 'license_doc_path'");
    if (licDocCol.length === 0) {
      await connection.query("ALTER TABLE driver_profiles ADD COLUMN license_doc_path VARCHAR(255) NULL AFTER vehicle_model");
    }
    const [vehDocCol] = await connection.query("SHOW COLUMNS FROM driver_profiles LIKE 'vehicle_doc_path'");
    if (vehDocCol.length === 0) {
      await connection.query("ALTER TABLE driver_profiles ADD COLUMN vehicle_doc_path VARCHAR(255) NULL AFTER license_doc_path");
    }
    const [curLatCol] = await connection.query("SHOW COLUMNS FROM driver_profiles LIKE 'current_latitude'");
    if (curLatCol.length === 0) {
      await connection.query("ALTER TABLE driver_profiles ADD COLUMN current_latitude DECIMAL(10, 7) NULL AFTER vehicle_doc_path");
    }
    const [curLonCol] = await connection.query("SHOW COLUMNS FROM driver_profiles LIKE 'current_longitude'");
    if (curLonCol.length === 0) {
      await connection.query("ALTER TABLE driver_profiles ADD COLUMN current_longitude DECIMAL(10, 7) NULL AFTER current_latitude");
    }
    const [locUpdCol] = await connection.query("SHOW COLUMNS FROM driver_profiles LIKE 'location_updated_at'");
    if (locUpdCol.length === 0) {
      await connection.query("ALTER TABLE driver_profiles ADD COLUMN location_updated_at TIMESTAMP NULL AFTER current_longitude");
    }
    const [locFixTimestampCol] = await connection.query("SHOW COLUMNS FROM driver_profiles LIKE 'location_fix_timestamp_ms'");
    if (locFixTimestampCol.length === 0) {
      await connection.query("ALTER TABLE driver_profiles ADD COLUMN location_fix_timestamp_ms BIGINT UNSIGNED NULL AFTER location_updated_at");
    }

    // Phase 4.5: cancellation_fee column on bookings table (REQ-027)
    const [cancelFeeCol] = await connection.query("SHOW COLUMNS FROM bookings LIKE 'cancellation_fee'");
    if (cancelFeeCol.length === 0) {
      await connection.query("ALTER TABLE bookings ADD COLUMN cancellation_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER cancellation_reason");
    }

    // Phase 4.6: refund tracking columns on payments table (UML Payment.refundPayment)
    const [refReasonCol] = await connection.query("SHOW COLUMNS FROM payments LIKE 'refund_reason'");
    if (refReasonCol.length === 0) {
      await connection.query("ALTER TABLE payments ADD COLUMN refund_reason VARCHAR(255) NULL AFTER successful_booking_id");
    }
    const [refAtCol] = await connection.query("SHOW COLUMNS FROM payments LIKE 'refunded_at'");
    if (refAtCol.length === 0) {
      await connection.query("ALTER TABLE payments ADD COLUMN refunded_at TIMESTAMP NULL AFTER refund_reason");
    }
    const [refTxnCol] = await connection.query("SHOW COLUMNS FROM payments LIKE 'refund_transaction_id'");
    if (refTxnCol.length === 0) {
      await connection.query("ALTER TABLE payments ADD COLUMN refund_transaction_id VARCHAR(100) NULL AFTER refunded_at");
    }

    // -------------------------------------------------------------------------
    // Phase 4.7 Migrations: Vehicle Category Classification & Enforcement
    // -------------------------------------------------------------------------

    // 1. driver_profiles.vehicle_category column (NULL by default for safe unclassified legacy drivers)
    const [vehCatCol] = await connection.query("SHOW COLUMNS FROM driver_profiles LIKE 'vehicle_category'");
    if (vehCatCol.length === 0) {
      await connection.query(
        "ALTER TABLE driver_profiles ADD COLUMN vehicle_category ENUM('STANDARD', 'COMFORT', 'XL') NULL AFTER vehicle_model, ADD INDEX idx_driver_vehicle_category (vehicle_category)"
      );
    }

    // 2. bookings.vehicle_tier conversion: safely convert to uppercase ENUM while preserving existing rows
    const [bTierCol] = await connection.query("SHOW FULL COLUMNS FROM bookings WHERE Field = 'vehicle_tier'");
    if (bTierCol.length > 0 && bTierCol[0].Type.includes("'standard'")) {
      await connection.query("ALTER TABLE bookings MODIFY COLUMN vehicle_tier VARCHAR(20) NOT NULL DEFAULT 'STANDARD'");
      await connection.query("UPDATE bookings SET vehicle_tier = UPPER(vehicle_tier)");
      await connection.query(
        "ALTER TABLE bookings MODIFY COLUMN vehicle_tier ENUM('STANDARD', 'COMFORT', 'XL') NOT NULL DEFAULT 'STANDARD'"
      );
    }

    const [bTierIdx] = await connection.query("SHOW INDEX FROM bookings WHERE Key_name = 'idx_bookings_vehicle_tier'");
    if (bTierIdx.length === 0) {
      await connection.query("ALTER TABLE bookings ADD INDEX idx_bookings_vehicle_tier (vehicle_tier)");
    }

    // -------------------------------------------------------------------------
    // Phase 1 Fleet Migrations: vehicle_color, passenger_capacity, vehicle_approval_status, is_vehicle_active
    // -------------------------------------------------------------------------
    const [vehCol] = await connection.query("SHOW COLUMNS FROM driver_profiles LIKE 'vehicle_color'");
    if (vehCol.length === 0) {
      await connection.query("ALTER TABLE driver_profiles ADD COLUMN vehicle_color VARCHAR(50) DEFAULT 'White' AFTER vehicle_category");
    }

    const [capCol] = await connection.query("SHOW COLUMNS FROM driver_profiles LIKE 'passenger_capacity'");
    if (capCol.length === 0) {
      await connection.query("ALTER TABLE driver_profiles ADD COLUMN passenger_capacity INT NOT NULL DEFAULT 4 AFTER vehicle_color");
    }

    const [vehAppCol] = await connection.query("SHOW COLUMNS FROM driver_profiles LIKE 'vehicle_approval_status'");
    if (vehAppCol.length === 0) {
      await connection.query("ALTER TABLE driver_profiles ADD COLUMN vehicle_approval_status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'APPROVED' AFTER passenger_capacity");
    }

    const [vehActCol] = await connection.query("SHOW COLUMNS FROM driver_profiles LIKE 'is_vehicle_active'");
    if (vehActCol.length === 0) {
      await connection.query("ALTER TABLE driver_profiles ADD COLUMN is_vehicle_active BOOLEAN NOT NULL DEFAULT TRUE AFTER vehicle_approval_status");
    }

    // Phase 1 Fare Breakdown Persistence
    const [baseFareCol] = await connection.query("SHOW COLUMNS FROM bookings LIKE 'base_fare'");
    if (baseFareCol.length === 0) {
      await connection.query("ALTER TABLE bookings ADD COLUMN base_fare DECIMAL(10, 2) NULL AFTER total_fare");
    }

    const [rateKmCol] = await connection.query("SHOW COLUMNS FROM bookings LIKE 'rate_per_km'");
    if (rateKmCol.length === 0) {
      await connection.query("ALTER TABLE bookings ADD COLUMN rate_per_km DECIMAL(10, 2) NULL AFTER base_fare");
    }

    // Phase 1 Dispatch Failures Table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS dispatch_failures (
        failure_id INT AUTO_INCREMENT PRIMARY KEY,
        booking_id INT NOT NULL,
        reason VARCHAR(255) NOT NULL,
        failed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE,
        INDEX idx_dispatch_failure_booking (booking_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    if (!env.isProduction) {
      // Seed demo identities only in development and test databases.
      const userPassHash = bcrypt.hashSync('Password123!', 10);

      await connection.query(
        `INSERT INTO users (user_id, name, phone_no, email, password_hash, role)
         VALUES (1, 'Videsh Tambe (Rider)', '+91 98200 12345', 'rider@goride.internal', ?, 'RIDER')
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           password_hash = VALUES(password_hash),
           role = 'RIDER'`,
        [userPassHash]
      );

      await connection.query(
        `INSERT INTO users (user_id, name, phone_no, email, password_hash, role)
         VALUES (2, 'Rajesh Kumar (Driver Partner)', '+91 98200 54321', 'driver@goride.internal', ?, 'DRIVER')
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           password_hash = VALUES(password_hash),
           role = 'DRIVER'`,
        [userPassHash]
      );

      await connection.query(
        `INSERT INTO driver_profiles (user_id, license_no, vehicle_no, vehicle_model, vehicle_category, rating, is_available, approval_status)
         VALUES (2, 'MH-01-2022-0045678', 'MH-02-EE-8899', 'Maruti Suzuki Dzire', 'STANDARD', 4.90, TRUE, 'APPROVED')
         ON DUPLICATE KEY UPDATE
           approval_status = 'APPROVED',
           is_available = TRUE,
           vehicle_category = COALESCE(vehicle_category, 'STANDARD')`
      );
    }

    const adminPassHash = bcrypt.hashSync(env.adminInitialPassword, 10);
    await connection.query(
      `INSERT INTO users (name, phone_no, email, password_hash, role)
       VALUES ('GoRide Fleet Administrator', '+91 98200 99999', 'admin@goride.internal', ?, 'ADMIN')
       ON DUPLICATE KEY UPDATE user_id = LAST_INSERT_ID(user_id)`,
      [adminPassHash]
    );
    const [adminRows] = await connection.query(
      `SELECT role FROM users WHERE email = 'admin@goride.internal' LIMIT 1`
    );
    if (adminRows.length !== 1 || adminRows[0].role !== 'ADMIN') {
      throw new Error('The seeded administrator email conflicts with a non-admin account.');
    }

    return {
      success: true,
      message: 'Database schema migrations and role-based seeding applied successfully.',
      statementsExecuted: statements.length,
    };
  } finally {
    connection.release();
  }
}

// Allow standalone script execution: node src/database/migrate.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then((res) => {
      console.log('MIGRATION_RESULT:', res.message, `(${res.statementsExecuted} statements executed)`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('MIGRATION_ERROR:', err.message);
      process.exit(1);
    });
}
