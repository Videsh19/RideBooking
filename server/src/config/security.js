export const DEVELOPMENT_JWT_SECRET =
  'goride_development_secret_key_change_in_production';

const KNOWN_UNSAFE_SECRETS = new Set([
  DEVELOPMENT_JWT_SECRET,
  'adminpassword123!',
  'change_me',
  'changeme',
  'your_jwt_secret_here',
  'replace_with_a_strong_random_password',
  'replace_with_a_strong_random_secret',
  'secret',
]);

export function isUnsafeProductionSecret(value) {
  if (typeof value !== 'string') return true;

  const normalizedValue = value.trim().toLowerCase();
  return KNOWN_UNSAFE_SECRETS.has(normalizedValue) ||
    /^(your|replace|change|default|development|dev)[\s_-]/.test(normalizedValue);
}

export function normalizeNodeEnv(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim().toLowerCase()
    : 'development';
}

export function resolveJwtSecret({ nodeEnv, jwtSecret }) {
  const configuredSecret = typeof jwtSecret === 'string' ? jwtSecret.trim() : '';
  if (nodeEnv === 'production') {
    if (!configuredSecret || isUnsafeProductionSecret(configuredSecret)) {
      throw new Error('A non-default JWT_SECRET must be configured in production.');
    }
    return configuredSecret;
  }

  return configuredSecret || DEVELOPMENT_JWT_SECRET;
}
