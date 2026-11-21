const test = require('node:test');
const assert = require('node:assert/strict');
const analysis = require('../js/analysis.js');

test('parseRepRange parses ranges and single values', () => {
  assert.deepEqual(analysis.parseRepRange('4–6'), { min: 4, max: 6 });
  assert.deepEqual(analysis.parseRepRange('8-12'), { min: 8, max: 12 });
  assert.deepEqual(analysis.parseRepRange('5'), { min: 5, max: 5 });
});

test('average ignores missing values', () => {
  assert.equal(analysis.average([6, 8, null, 10]), 8);
  assert.equal(analysis.average([]), null);
});

test('plateau comparison detects no repetition improvement', () => {
  assert.equal(analysis.compareRepetitionProgress(6, [7, 8, 7]).improved, false);
  assert.equal(analysis.compareRepetitionProgress(9, [7, 8, 7]).improved, true);
});

test('epley 1RM calculation works', () => {
  assert.equal(analysis.epley1Rm(80, 8), 101.3);
  assert.equal(analysis.epley1Rm(0, 8), null);
});
