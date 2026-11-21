'use strict';

function parseRepRange(value) {
  const match = String(value || '').match(/(\d+)\s*[–\-]\s*(\d+)/);
  if (match) return { min: parseInt(match[1], 10), max: parseInt(match[2], 10) };
  const single = parseInt(value, 10);
  return isFinite(single) ? { min: single, max: single } : { min: 8, max: 12 };
}

function average(values) {
  const valid = (values || []).filter(v => typeof v === 'number' && isFinite(v));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function compareRepetitionProgress(currentReps, previousSessionAverages) {
  const previous = average(previousSessionAverages);
  if (previous === null) return null;
  return {
    improved: currentReps > previous,
    unchanged: currentReps === previous,
    previousAverage: previous,
    currentReps: currentReps
  };
}

function epley1Rm(weight, reps) {
  if (typeof weight !== 'number' || typeof reps !== 'number' || weight <= 0 || reps <= 0) return null;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseRepRange, average, compareRepetitionProgress, epley1Rm };
}
