export function parsePositiveIntegerId(value) {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isSafeInteger(numericValue) && numericValue > 0
    ? numericValue
    : null;
}
