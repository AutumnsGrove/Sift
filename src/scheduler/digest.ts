// Sift — Daily Digest Scheduler
// Queries task board state and triggers digest generation + delivery

import type { Env } from '../types';
import { sendMessage } from '../telegram';
import { generateDigest } from '../ai/digest';
import type { DigestData } from '../ai/digest';
import { getActiveTasks, getTasksByStatus, getTasksDueBefore } from '../db/tasks';
import { getActiveSchedules } from '../db/schedules';

/** Run the daily digest: query board state, generate digest, send it */
export async function runDigest(env: Env): Promise<void> {
  const data = await gatherDigestData(env);
  const message = await generateDigest(env, data);
  await sendMessage(env, message);
}

/** Gather all the data needed for the digest */
async function gatherDigestData(env: Env): Promise<DigestData> {
  const today = new Date().toISOString().split('T')[0]!;
  const endOfDay = `${today}T23:59:59`;

  // Run queries in parallel
  const [activeTasks, inProgressTasks, overdueTasks, schedules] = await Promise.all([
    getActiveTasks(env.DB),
    getTasksByStatus(env.DB, 'in_progress'),
    getTasksDueBefore(env.DB, today),
    getActiveSchedules(env.DB),
  ]);

  // Separate due today from overdue
  const dueToday = overdueTasks.filter(
    (t) => t.due_date === today && t.status !== 'done' && t.status !== 'archived'
  );
  const overdue = overdueTasks.filter(
    (t) => t.due_date !== null && t.due_date < today && t.status !== 'done' && t.status !== 'archived'
  );

  // Top 5 todo items by priority
  const topTodo = activeTasks
    .filter((t) => t.status === 'todo')
    .slice(0, 5);

  // Schedules firing today
  const schedulesToday = schedules.filter((s) => {
    return s.active && s.next_fire <= endOfDay && s.id !== '_digest';
  });

  return {
    dueToday,
    overdue,
    inProgress: inProgressTasks,
    topTodo,
    schedulesToday,
    totalActive: activeTasks.length,
  };
}
