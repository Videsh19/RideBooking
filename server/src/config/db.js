import mysql from 'mysql2/promise';
import { env } from './env.js';

let pool = null;

/**
 * Lazily initialize the MySQL connection pool
 */
export function getDbPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: env.db.database,
      waitForConnections: true,
      connectionLimit: env.db.connectionLimit,
      queueLimit: 0,
      connectTimeout: 5000,
    });
  }
  return pool;
}

/**
 * Probe real MySQL connectivity.
 * Returns honest status object. Never claims connection unless query succeeds.
 */
export async function testDatabaseConnection() {
  try {
    const dbPool = getDbPool();
    const connection = await dbPool.getConnection();
    try {
      const [rows] = await connection.query('SELECT 1 + 1 AS probeResult, VERSION() AS mysqlVersion');
      return {
        isConnected: true,
        status: 'connected',
        host: env.db.host,
        database: env.db.database,
        mysqlVersion: rows[0]?.mysqlVersion || 'unknown',
        message: 'Successfully established connection to MySQL database.',
      };
    } finally {
      connection.release();
    }
  } catch (err) {
    return {
      isConnected: false,
      status: 'disconnected',
      host: env.db.host,
      database: env.db.database,
      errorCode: err.code || 'CONNECTION_FAILED',
      errorMessage: err.message,
      message: 'MySQL database is unreachable or not yet configured. Relational schema pending Phase 2.',
    };
  }
}
