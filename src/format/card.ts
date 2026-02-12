// Sift — Single Task Card Formatting
// Detailed view of a single task

import type { Task } from '../types';

const PRIORITY_SYMBOL: Record<string, string> = {
  critical: '●',
  high: '●',
  medium: '◐',
  low: '○',
  someday: '○',
};

const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
  archived: 'Archived',
};

/** Format a single task as a detailed card */
export function formatTaskCard(task: Task): string {
  const symbol = PRIORITY_SYMBOL[task.priority] ?? '◐';
  const status = STATUS_LABELS[task.status] ?? task.status;

  const lines: string[] = [
    `${symbol} ${task.title}`,
    `   Status: ${status} · Priority: ${task.priority}`,
  ];

  if (task.category) {
    lines.push(`   Category: ${task.category}`);
  }
  if (task.due_date) {
    lines.push(`   Due: ${task.due_date}`);
  }
  if (task.description) {
    lines.push(`   ${task.description}`);
  }
  if (task.tags) {
    try {
      const tags = JSON.parse(task.tags) as string[];
      if (tags.length > 0) {
        lines.push(`   Tags: ${tags.join(', ')}`);
      }
    } catch {
      // Ignore malformed tags
    }
  }
  if (task.ai_notes) {
    lines.push(`   → ${task.ai_notes}`);
  }

  lines.push(`   Created: ${task.created_at}`);
  if (task.completed_at) {
    lines.push(`   Completed: ${task.completed_at}`);
  }

  return lines.join('\n');
}

/** Format multiple tasks as a brief summary */
export function formatTaskSummary(tasks: Task[]): string {
  const total = tasks.length;
  const byStatus = new Map<string, number>();
  const byPriority = new Map<string, number>();

  for (const task of tasks) {
    byStatus.set(task.status, (byStatus.get(task.status) ?? 0) + 1);
    byPriority.set(task.priority, (byPriority.get(task.priority) ?? 0) + 1);
  }

  const lines: string[] = [`${total} task${total !== 1 ? 's' : ''} total`];

  const statusLine = Array.from(byStatus.entries())
    .map(([s, c]) => `${c} ${STATUS_LABELS[s] ?? s}`)
    .join(', ');
  if (statusLine) lines.push(`By status: ${statusLine}`);

  const highPriority = (byPriority.get('critical') ?? 0) + (byPriority.get('high') ?? 0);
  if (highPriority > 0) {
    lines.push(`${highPriority} high-priority item${highPriority !== 1 ? 's' : ''} need attention`);
  }

  return lines.join('\n');
}
