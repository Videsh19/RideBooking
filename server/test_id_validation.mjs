import assert from 'node:assert/strict';
import { parsePositiveIntegerId } from './src/utils/ids.js';

for (const value of [1, '1', 20, '00020']) {
  assert.ok(parsePositiveIntegerId(value) > 0, `Accept positive integer ID ${value}`);
}

for (const value of [0, '0', -1, '-1', 1.2, '1.2', '1junk', '', ' 1', '1 ', '9007199254740992']) {
  assert.equal(parsePositiveIntegerId(value), null, `Reject invalid ID ${value}`);
}
