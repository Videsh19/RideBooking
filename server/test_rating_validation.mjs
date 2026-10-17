import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRating } from './src/services/ratingService.js';

test('accepts integer ratings from 1 through 5', () => {
  for (const rating of [1, 2, 3, 4, 5]) {
    assert.equal(validateRating(rating), rating);
  }
});

test('rejects invalid ratings with the standard 400 error without database access', () => {
  const invalidRatings = [
    0,
    6,
    2.5,
    '4abc',
    undefined,
    null,
    NaN,
    Infinity,
    -Infinity,
  ];

  for (const rating of invalidRatings) {
    assert.throws(
      () => validateRating(rating),
      (error) =>
        error.statusCode === 400 &&
        error.code === 'INVALID_RATING_VALUE'
    );
  }
});
