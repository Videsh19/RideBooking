import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEVELOPMENT_JWT_SECRET,
  isUnsafeProductionSecret,
  normalizeNodeEnv,
  resolveJwtSecret,
} from './src/config/security.js';

for (const value of ['Production', ' production ', 'PRODUCTION']) {
  assert.equal(
    normalizeNodeEnv(value),
    'production',
    `Normalize ${JSON.stringify(value)} as production`
  );
}
assert.equal(normalizeNodeEnv(undefined), 'development');

assert.equal(
  resolveJwtSecret({ nodeEnv: 'development', jwtSecret: undefined }),
  DEVELOPMENT_JWT_SECRET,
  'Development retains its default JWT secret when none is configured'
);
assert.throws(
  () => resolveJwtSecret({ nodeEnv: 'production', jwtSecret: undefined }),
  /non-default JWT_SECRET/
);
assert.throws(
  () => resolveJwtSecret({
    nodeEnv: 'production',
    jwtSecret: DEVELOPMENT_JWT_SECRET,
  }),
  /non-default JWT_SECRET/
);
assert.throws(
  () => resolveJwtSecret({
    nodeEnv: 'production',
    jwtSecret: 'replace_with_a_strong_random_secret',
  }),
  /non-default JWT_SECRET/
);
assert.throws(
  () => resolveJwtSecret({
    nodeEnv: 'production',
    jwtSecret: 'Development-test-secret',
  }),
  /non-default JWT_SECRET/
);
assert.equal(
  resolveJwtSecret({
    nodeEnv: 'production',
    jwtSecret: 'a-private-production-secret-that-is-not-a-default-value',
  }),
  'a-private-production-secret-that-is-not-a-default-value'
);
assert.equal(isUnsafeProductionSecret('AdminPassword123!'), true);
assert.equal(isUnsafeProductionSecret('replace_with_a_strong_random_password'), true);
assert.equal(
  isUnsafeProductionSecret('a-private-production-secret-that-is-not-a-default-value'),
  false
);

const config = readFileSync(
  new URL('./src/config/env.js', import.meta.url),
  'utf8'
);
const authService = readFileSync(
  new URL('./src/services/authService.js', import.meta.url),
  'utf8'
);
const authMiddleware = readFileSync(
  new URL('./src/middleware/authMiddleware.js', import.meta.url),
  'utf8'
);
const migration = readFileSync(
  new URL('./src/database/migrate.js', import.meta.url),
  'utf8'
);
const exampleConfig = readFileSync(
  new URL('./.env.example', import.meta.url),
  'utf8'
);

assert.match(config, /resolveJwtSecret\(\{[\s\S]*?nodeEnv,[\s\S]*?jwtSecret: process\.env\.JWT_SECRET/);
assert.match(config, /normalizeNodeEnv\(process\.env\.NODE_ENV\)/);
assert.match(config, /nodeEnv === 'production'[\s\S]*?isUnsafeProductionSecret\(configuredAdminPassword\)/);
assert.match(migration, /if \(!env\.isProduction\)/);
assert.doesNotMatch(migration, /process\.env\.NODE_ENV\s*!==?\s*'production'/);
assert.match(authService, /if \(!env\.isProduction\)/);
assert.doesNotMatch(authService, /process\.env\.NODE_ENV\s*!==?\s*'production'/);
assert.match(authService, /import \{ env \} from '\.\.\/config\/env\.js';[\s\S]*?env\.jwtSecret/);
assert.match(authMiddleware, /import \{ env \} from '\.\.\/config\/env\.js';[\s\S]*?env\.jwtSecret/);
assert.doesNotMatch(authService, /goride_development_secret_key_change_in_production/);
assert.doesNotMatch(authMiddleware, /goride_development_secret_key_change_in_production/);
assert.match(exampleConfig, /JWT_SECRET=replace_with_a_strong_random_secret/);
