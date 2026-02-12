// Sift — Schedule Runner
// Checks for due schedules and fires them (creates tasks + sends notifications)

import type { Env, Schedule } from '../types';
import { getDueSchedules, markScheduleFired } from '../db/schedules';
import { createTask } from '../db/tasks';
import { sendMessage } from '../telegram';
import { runDigest } from './digest';

/** Run all due schedules and the daily digest */
export async function runScheduler(env: Env): Promise<void> {
  const now = new Date().toISOString();

  const dueSchedules = await getDueSchedules(env.DB, now);

  for (const schedule of dueSchedules) {
    try {
      // Handle digest separately
      if (schedule.id === '_digest') {
        await runDigest(env);
        await markScheduleFired(env.DB, schedule);
        continue;
      }

      await fireSchedule(env, schedule);
      await markScheduleFired(env.DB, schedule);
    } catch (err) {
      console.error(`Failed to fire schedule "${schedule.title}" (${schedule.id}):`, err);
    }
  }
}

/** Fire a single schedule: create task and/or send notification */
async function fireSchedule(env: Env, schedule: Schedule): Promise<void> {
  let taskTitle = schedule.title;

  // Apply template if present, replacing {date} placeholder
  if (schedule.template) {
    const today = new Date().toISOString().split('T')[0]!;
    taskTitle = schedule.template.replace('{date}', today);
  }

  // Create a task if auto_create is enabled
  if (schedule.auto_create) {
    await createTask(env.DB, {
      title: taskTitle,
      description: schedule.description ?? undefined,
      priority: schedule.priority,
      category: schedule.category ?? undefined,
      tags: schedule.tags ? JSON.parse(schedule.tags) : undefined,
      source_type: 'text',
      status: 'todo',
      ai_notes: `Auto-created from recurring schedule: ${schedule.human_rule}`,
    });
  }

  // Send notification if enabled
  if (schedule.notify) {
    const fireCount = schedule.fire_count + 1;
    const maxInfo = schedule.max_fires
      ? ` (${fireCount}/${schedule.max_fires})`
      : '';

    const message = [
      `⏰ ${taskTitle}`,
      `▸ ${schedule.human_rule}${maxInfo}`,
      schedule.auto_create ? '▸ Task created in your todo list' : '',
    ]
      .filter(Boolean)
      .join('\n');

    await sendMessage(env, message);
  }
}
