// Sift — Digest Message Formatting
// Formatting utilities for the daily digest

import type { Task, Schedule } from '../types';

const PRIORITY_SYMBOL: Record<string, string> = {
  critical: '●',
  high: '●',
  medium: '◐',
  low: '○',
  someday: '○',
};

/** Format a section of the digest with tree connectors */
export function formatDigestSection(
  header: string,
  tasks: Task[],
  options?: { showDue?: boolean }
): string {
  if (tasks.length === 0) return '';

  const lines: string[] = [`▸ ${header} (${tasks.length})`];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]!;
    const symbol = PRIORITY_SYMBOL[task.priority] ?? '◐';
    const due = options?.showDue && task.due_date ? ` (due ${task.due_date})` : '';
    const connector = i === tasks.length - 1 ? '└─' : '├─';
    lines.push(`${connector} ${symbol} ${task.title}${due}`);
  }

  return lines.join('\n');
}

/** Format the overdue section with warning symbol */
export function formatOverdueSection(tasks: Task[]): string {
  if (tasks.length === 0) return '';

  const lines: string[] = [`⚠ Overdue (${tasks.length})`];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]!;
    const daysOverdue = task.due_date ? getDaysOverdue(task.due_date) : 0;
    const dueInfo = daysOverdue > 0 ? ` — ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue` : '';
    const connector = i === tasks.length - 1 ? '└─' : '├─';
    lines.push(`${connector} ● ${task.title}${dueInfo}`);
  }

  return lines.join('\n');
}

/** Format scheduled items for the digest */
export function formatDigestSchedules(schedules: Schedule[]): string {
  if (schedules.length === 0) return '';

  const lines: string[] = [`▸ Coming Up`];

  for (let i = 0; i < schedules.length; i++) {
    const s = schedules[i]!;
    const connector = i === schedules.length - 1 ? '└─' : '├─';
    lines.push(`${connector} ○ ${s.title} (${s.human_rule})`);
  }

  return lines.join('\n');
}

function getDaysOverdue(dueDateStr: string): number {
  const due = new Date(dueDateStr + 'T00:00:00');
  const now = new Date();
  const diffMs = now.getTime() - due.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}
