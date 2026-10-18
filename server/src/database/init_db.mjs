import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

async function init() {
  console.log(`Connecting to MySQL host: ${env.db.host}:${env.db.port} as user: ${env.db.user}`);
  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
  });

  try {
    const [dbs] = await connection.query('SHOW DATABASES LIKE ?', [env.db.database]);
    const exists = dbs.length > 0;
    console.log(`Database '${env.db.database}' exists: ${exists}`);

    if (!exists) {
      console.log(`Creating database '${env.db.database}'...`);
      await connection.query(`CREATE DATABASE IF NOT EXISTS \`${env.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      console.log(`Database '${env.db.database}' created successfully.`);
    } else {
      console.log(`Database '${env.db.database}' already exists. Preserving data.`);
    }
  } finally {
    await connection.end();
  }
}

init()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('INIT_DB_ERROR:', err.message);
    process.exit(1);
  });
