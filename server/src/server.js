import app from './app.js';
import { env } from './config/env.js';
import { runMigrations } from './database/migrate.js';

const server = app.listen(env.port, async () => {
  console.log('====================================================');
  console.log(' GoRide Backend Server Started');
  console.log(` Port: ${env.port}`);
  console.log(` Environment: ${env.nodeEnv}`);
  console.log(` Health Probe: http://localhost:${env.port}/api/health`);
  console.log('====================================================');

  try {
    const migrationResult = await runMigrations();
    console.log(`[Database Migration] ${migrationResult.message}`);
  } catch (err) {
    console.warn(`[Database Migration Warning] ${err.message}`);
  }
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('[GoRide Server] SIGTERM signal received. Closing HTTP server...');
  server.close(() => {
    console.log('[GoRide Server] HTTP server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n[GoRide Server] SIGINT signal received. Closing HTTP server...');
  server.close(() => {
    console.log('[GoRide Server] HTTP server closed.');
    process.exit(0);
  });
});

export default server;
