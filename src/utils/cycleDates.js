/**
 * Utility functions for payment cycle date calculations and validations.
 * Handles fixed 15-day, fixed 30-day, and calendar-month cycles with leap-year awareness.
 */

function isLeapYear(year) {
  const y = Number(year);
  return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
}

function getDaysInMonth(year, month1Based) {
  const y = Number(year);
  const m = Number(month1Based);
  if (m === 2) {
    return isLeapYear(y) ? 29 : 28;
  }
  if ([4, 6, 9, 11].includes(m)) {
    return 30;
  }
  return 31;
}

function addDays(isoDateStr, daysToAdd) {
  const [y, m, d] = isoDateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + daysToAdd));
  return date.toISOString().slice(0, 10);
}

function getInclusiveDays(startDateStr, endDateStr) {
  const [y1, m1, d1] = startDateStr.split('-').map(Number);
  const [y2, m2, d2] = endDateStr.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Calculates start_date, end_date, duration_days, and cycle_type based on parameters.
 * Supports:
 * - fixed 15-day cycles (15 calendar dates, e.g. Oct 1 - Oct 15)
 * - fixed 30-day cycles (exactly 30 calendar dates, e.g. Oct 1 - Oct 30)
 * - calendar-month cycles (includes every day of month, e.g. Oct 1 - Oct 31, Feb 1 - Feb 28/29)
 */
function resolveCycleDates({ startDate, endDate, durationDays, cycleType, month, year }) {
  // Normalize cycle type if given
  let resolvedType = cycleType ? String(cycleType).trim().toLowerCase() : null;

  // Handle month / year inputs if passed
  let resolvedStart = startDate;
  if (!resolvedStart && year && month) {
    const y = Number(year);
    const m = Number(month);
    resolvedStart = `${y}-${String(m).padStart(2, '0')}-01`;
    resolvedType = 'calendar_month';
  }

  if (
    resolvedType === 'calendar_month' ||
    durationDays === 'calendar_month' ||
    durationDays === 'month' ||
    durationDays === 'monthly'
  ) {
    resolvedType = 'calendar_month';
    const [y, m] = resolvedStart.split('-').map(Number);
    const daysInMonth = getDaysInMonth(y, m);
    const startStr = `${y}-${String(m).padStart(2, '0')}-01`;
    const endStr = `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    return {
      startDate: startStr,
      endDate: endStr,
      durationDays: daysInMonth,
      cycleType: 'calendar_month',
    };
  }

  // Handle explicit durationDays
  const numDuration = Number(durationDays);
  if (resolvedType === '30_days' || numDuration === 30) {
    const endStr = addDays(resolvedStart, 29); // 1 + 29 = 30 calendar dates
    return {
      startDate: resolvedStart,
      endDate: endStr,
      durationDays: 30,
      cycleType: '30_days',
    };
  }

  if (resolvedType === '15_days' || numDuration === 15 || (!durationDays && !endDate)) {
    const endStr = addDays(resolvedStart, 14); // 1 + 14 = 15 calendar dates
    return {
      startDate: resolvedStart,
      endDate: endStr,
      durationDays: 15,
      cycleType: '15_days',
    };
  }

  // If endDate was explicitly provided
  if (endDate) {
    const inclusive = getInclusiveDays(resolvedStart, endDate);
    let inferredType = 'custom';
    if (inclusive === 15) inferredType = '15_days';
    else if (inclusive === 30) inferredType = '30_days';
    else {
      const [y, m, d] = resolvedStart.split('-').map(Number);
      if (d === 1 && inclusive === getDaysInMonth(y, m)) {
        inferredType = 'calendar_month';
      }
    }
    return {
      startDate: resolvedStart,
      endDate,
      durationDays: inclusive,
      cycleType: inferredType === 'custom' ? (inclusive === 30 ? '30_days' : '15_days') : inferredType,
    };
  }

  // Fallback default: 15 days
  return {
    startDate: resolvedStart,
    endDate: addDays(resolvedStart, 14),
    durationDays: 15,
    cycleType: '15_days',
  };
}

module.exports = {
  isLeapYear,
  getDaysInMonth,
  addDays,
  getInclusiveDays,
  resolveCycleDates,
};
