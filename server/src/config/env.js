import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  isUnsafeProductionSecret,
  normalizeNodeEnv,
  resolveJwtSecret,
} from './security.js';

// Load .env relative to server root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const nodeEnv = normalizeNodeEnv(process.env.NODE_ENV);
const jwtSecret = resolveJwtSecret({
  nodeEnv,
  jwtSecret: process.env.JWT_SECRET,
});
const configuredAdminPassword = process.env.ADMIN_INITIAL_PASSWORD?.trim();
if (
  nodeEnv === 'production' &&
  isUnsafeProductionSecret(configuredAdminPassword)
) {
  throw new Error('A non-default ADMIN_INITIAL_PASSWORD must be configured in production.');
}

export const env = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv,
  isProduction: nodeEnv === 'production',
  jwtSecret,
  adminInitialPassword: configuredAdminPassword || 'AdminPassword123!',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'goride_db',
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
    hasCustomPassword: Boolean(process.env.DB_PASSWORD && process.env.DB_PASSWORD !== 'your_mysql_password_here'),
  },
};
