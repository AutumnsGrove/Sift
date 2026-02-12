// Sift — Cron Expression Parser + Next-Fire Computation
// Lightweight cron parser for schedule management
// Supports: minute hour day-of-month month day-of-week
// Supports ranges (1-5), lists (1,3,5), steps (*/5), and named days (MON-FRI)

const DAY_NAMES: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

const MONTH_NAMES: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

interface CronFields {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
}

/** Parse a cron expression into expanded field sets */
export function parseCron(expr: string): CronFields {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: expected 5 fields, got ${parts.length}`);
  }

  return {
    minutes: parseField(parts[0]!, 0, 59),
    hours: parseField(parts[1]!, 0, 23),
    daysOfMonth: parseField(parts[2]!, 1, 31),
    months: parseField(parts[3]!, 1, 12, MONTH_NAMES),
    daysOfWeek: parseField(parts[4]!, 0, 6, DAY_NAMES),
  };
}

/** Parse a single cron field into a set of valid values */
function parseField(
  field: string,
  min: number,
  max: number,
  names?: Record<string, number>
): Set<number> {
  const values = new Set<number>();

  for (const part of field.split(',')) {
    const trimmed = part.trim().toUpperCase();

    // Replace named values
    let resolved = trimmed;
    if (names) {
      for (const [name, val] of Object.entries(names)) {
        resolved = resolved.replace(new RegExp(`\\b${name}\\b`, 'g'), String(val));
      }
    }

    if (resolved === '*') {
      for (let i = min; i <= max; i++) values.add(i);
    } else if (resolved.includes('/')) {
      // Step: */2 or 1-10/2
      const [rangeStr, stepStr] = resolved.split('/');
      const step = parseInt(stepStr!, 10);
      if (isNaN(step) || step <= 0) throw new Error(`Invalid step: ${part}`);

      let start = min;
      let end = max;
      if (rangeStr !== '*') {
        if (rangeStr!.includes('-')) {
          const [s, e] = rangeStr!.split('-').map(Number);
          start = s!;
          end = e!;
        } else {
          start = parseInt(rangeStr!, 10);
        }
      }

      for (let i = start; i <= end; i += step) {
        if (i >= min && i <= max) values.add(i);
      }
    } else if (resolved.includes('-')) {
      // Range: 1-5
      const [startStr, endStr] = resolved.split('-');
      const start = parseInt(startStr!, 10);
      const end = parseInt(endStr!, 10);
      if (isNaN(start) || isNaN(end)) throw new Error(`Invalid range: ${part}`);

      for (let i = start; i <= end; i++) {
        if (i >= min && i <= max) values.add(i);
      }
    } else {
      // Single value
      const val = parseInt(resolved, 10);
      if (isNaN(val) || val < min || val > max) {
        throw new Error(`Invalid value: ${part} (must be ${min}-${max})`);
      }
      values.add(val);
    }
  }

  if (values.size === 0) {
    throw new Error(`Empty field: ${field}`);
  }

  return values;
}

/** Compute the next fire time after the given date */
export function getNextFire(expr: string, after: Date): Date {
  const fields = parseCron(expr);
  const maxIterations = 366 * 24 * 60; // ~1 year of minutes as safety cap

  // Start from the next minute
  const next = new Date(after);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);

  for (let i = 0; i < maxIterations; i++) {
    const month = next.getMonth() + 1; // 1-indexed
    const dayOfMonth = next.getDate();
    const dayOfWeek = next.getDay(); // 0=Sunday
    const hour = next.getHours();
    const minute = next.getMinutes();

    if (
      fields.months.has(month) &&
      fields.daysOfMonth.has(dayOfMonth) &&
      fields.daysOfWeek.has(dayOfWeek) &&
      fields.hours.has(hour) &&
      fields.minutes.has(minute)
    ) {
      return next;
    }

    // Advance by one minute
    next.setMinutes(next.getMinutes() + 1);
  }

  // Fallback: shouldn't happen with valid cron expressions
  throw new Error(`Could not compute next fire time for "${expr}" within one year`);
}

/** Compute the next fire time as ISO 8601 string */
export function getNextFireISO(expr: string, after: Date): string {
  return getNextFire(expr, after).toISOString();
}

/** Validate a cron expression without computing next fire */
export function isValidCron(expr: string): boolean {
  try {
    parseCron(expr);
    return true;
  } catch {
    return false;
  }
}
