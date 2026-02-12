// Sift — Schedule CRUD Operations

import type { Schedule, TaskPriority } from '../types';
import { getNextFireISO, isValidCron } from '../scheduler/cron';

export interface CreateScheduleInput {
  title: string;
  description?: string;
  category?: string;
  priority?: TaskPriority;
  tags?: string[];
  cron_expr: string;
  timezone?: string;
  human_rule: string;
  auto_create?: boolean;
  notify?: boolean;
  template?: string;
  max_fires?: number;
  expires_at?: string;
}

/** Create a new schedule with precomputed next_fire */
export async function createSchedule(
  db: D1Database,
  input: CreateScheduleInput
): Promise<Schedule> {
  if (!isValidCron(input.cron_expr)) {
    throw new Error(`Invalid cron expression: ${input.cron_expr}`);
  }

  const nextFire = getNextFireISO(input.cron_expr, new Date());
  const tags = input.tags ? JSON.stringify(input.tags) : null;

  const result = await db
    .prepare(
      `INSERT INTO schedules (
        title, description, category, priority, tags,
        cron_expr, timezone, human_rule,
        auto_create, notify, template,
        next_fire, max_fires, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *`
    )
    .bind(
      input.title,
      input.description ?? null,
      input.category ?? null,
      input.priority ?? 'medium',
      tags,
      input.cron_expr,
      input.timezone ?? 'America/New_York',
      input.human_rule,
      input.auto_create !== false ? 1 : 0,
      input.notify !== false ? 1 : 0,
      input.template ?? null,
      nextFire,
      input.max_fires ?? null,
      input.expires_at ?? null
    )
    .first<Schedule>();

  if (!result) {
    throw new Error('Failed to create schedule');
  }
  return result;
}

/** Get all active schedules */
export async function getActiveSchedules(db: D1Database): Promise<Schedule[]> {
  const { results } = await db
    .prepare('SELECT * FROM schedules WHERE active = 1 ORDER BY next_fire')
    .all<Schedule>();
  return results;
}

/** Get schedules that are due (next_fire <= now) */
export async function getDueSchedules(db: D1Database, now: string): Promise<Schedule[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM schedules
       WHERE active = 1 AND next_fire <= ?
       ORDER BY next_fire`
    )
    .bind(now)
    .all<Schedule>();
  return results;
}

/** Get a schedule by ID */
export async function getSchedule(db: D1Database, id: string): Promise<Schedule | null> {
  return db.prepare('SELECT * FROM schedules WHERE id = ?').bind(id).first<Schedule>();
}

/** Update schedule after it fires: bump fire_count, compute next_fire, deactivate if done */
export async function markScheduleFired(db: D1Database, schedule: Schedule): Promise<void> {
  const newFireCount = schedule.fire_count + 1;
  const now = new Date().toISOString();

  // Check if schedule should be deactivated
  const maxReached = schedule.max_fires !== null && newFireCount >= schedule.max_fires;
  const expired = schedule.expires_at !== null && now >= schedule.expires_at;
  const shouldDeactivate = maxReached || expired;

  if (shouldDeactivate) {
    await db
      .prepare(
        `UPDATE schedules
         SET active = 0, fire_count = ?, last_fired = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .bind(newFireCount, now, schedule.id)
      .run();
  } else {
    // Compute next fire time
    const nextFire = getNextFireISO(schedule.cron_expr, new Date());

    await db
      .prepare(
        `UPDATE schedules
         SET fire_count = ?, last_fired = ?, next_fire = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .bind(newFireCount, now, nextFire, schedule.id)
      .run();
  }
}

/** Pause a schedule */
export async function pauseSchedule(db: D1Database, id: string): Promise<Schedule | null> {
  return db
    .prepare(
      `UPDATE schedules
       SET active = 0, updated_at = datetime('now')
       WHERE id = ?
       RETURNING *`
    )
    .bind(id)
    .first<Schedule>();
}

/** Resume a paused schedule and recompute next_fire */
export async function resumeSchedule(db: D1Database, id: string): Promise<Schedule | null> {
  const schedule = await getSchedule(db, id);
  if (!schedule) return null;

  const nextFire = getNextFireISO(schedule.cron_expr, new Date());

  return db
    .prepare(
      `UPDATE schedules
       SET active = 1, next_fire = ?, updated_at = datetime('now')
       WHERE id = ?
       RETURNING *`
    )
    .bind(nextFire, id)
    .first<Schedule>();
}

/** Update a schedule's cron expression and recompute next_fire */
export async function updateScheduleCron(
  db: D1Database,
  id: string,
  cronExpr: string,
  humanRule: string
): Promise<Schedule | null> {
  if (!isValidCron(cronExpr)) {
    throw new Error(`Invalid cron expression: ${cronExpr}`);
  }

  const nextFire = getNextFireISO(cronExpr, new Date());

  return db
    .prepare(
      `UPDATE schedules
       SET cron_expr = ?, human_rule = ?, next_fire = ?, updated_at = datetime('now')
       WHERE id = ?
       RETURNING *`
    )
    .bind(cronExpr, humanRule, nextFire, id)
    .first<Schedule>();
}

/** Delete a schedule */
export async function deleteSchedule(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM schedules WHERE id = ?').bind(id).run();
}

/** Format schedules for display */
export function formatScheduleList(schedules: Schedule[]): string {
  if (schedules.length === 0) {
    return "You don't have any active recurring tasks.";
  }

  const lines = schedules.map((s) => {
    const status = s.active ? '' : ' (paused)';
    const nextDate = s.next_fire.split('T')[0];
    return `▸ ${s.title}${status}\n  ${s.human_rule} · next: ${nextDate}`;
  });

  return `You have ${schedules.length} active schedule${schedules.length > 1 ? 's' : ''}:\n\n${lines.join('\n\n')}`;
}
