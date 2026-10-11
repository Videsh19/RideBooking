import bcrypt from 'bcryptjs';
import { getDbPool } from '../config/db.js';

/**
 * Secure Admin Provisioning Utility (Non-public CLI process)
 * Usage: node src/database/provisionAdmin.js <email> <password> [name] [phone]
 *
 * Example:
 * node src/database/provisionAdmin.js ops.admin@goride.internal SecureAdminPass123! "Ops Administrator" "+91 98200 88888"
 */
async function provisionAdmin() {
  const args = process.argv.slice(2);
  const email = args[0]?.trim();
  const password = args[1]?.trim();
  const name = args[2]?.trim() || 'GoRide System Administrator';
  const phone = args[3]?.trim() || '+91 98200 99999';

  if (!email || !password) {
    console.error('Usage: node src/database/provisionAdmin.js <email> <password> [name] [phone]');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Error: Administrator password must be at least 8 characters.');
    process.exit(1);
  }

  const pool = getDbPool();
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const normalizedEmail = email.toLowerCase();

    const [existing] = await pool.query('SELECT user_id, role FROM users WHERE email = ?', [normalizedEmail]);

    if (existing.length > 0) {
      await pool.query(
        'UPDATE users SET role = "ADMIN", password_hash = ?, name = ?, phone_no = ? WHERE email = ?',
        [passwordHash, name, phone, normalizedEmail]
      );
      console.log(`[PROVISION_SUCCESS] Existing user '${normalizedEmail}' successfully elevated to ADMIN.`);
    } else {
      const [insert] = await pool.query(
        'INSERT INTO users (name, phone_no, email, password_hash, role) VALUES (?, ?, ?, ?, "ADMIN")',
        [name, phone, normalizedEmail, passwordHash]
      );
      console.log(`[PROVISION_SUCCESS] New administrator '${normalizedEmail}' provisioned successfully with User ID ${insert.insertId}.`);
    }

    process.exit(0);
  } catch (err) {
    console.error('[PROVISION_ERROR]', err.message);
    process.exit(1);
  }
}

provisionAdmin();
