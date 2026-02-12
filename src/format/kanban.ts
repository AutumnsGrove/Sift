// Sift — Kanban-Style Formatting
// Formats tasks grouped by status columns

import type { Task } from '../types';

const STATUS_ORDER = ['in_progress', 'todo', 'review', 'backlog'] as const;
const STATUS_LABELS: Record<string, string> = {
  in_progress: 'In Progress',
  todo: 'Todo',
  review: 'Review',
  backlog: 'Backlog',
};

const PRIORITY_SYMBOL: Record<string, string> = {
  critical: '●',
  high: '●',
  medium: '◐',
  low: '○',
  someday: '○',
};

/** Format tasks as a kanban board view */
export function formatKanban(tasks: Task[]): string {
  // Filter out done/archived
  const active = tasks.filter((t) => t.status !== 'done' && t.status !== 'archived');

  if (active.length === 0) {
    return 'Your board is empty. Nothing in progress, nothing in the queue. Enjoy the calm.';
  }

  // Group by status
  const grouped = new Map<string, Task[]>();
  for (const task of active) {
    const existing = grouped.get(task.status) ?? [];
    existing.push(task);
    grouped.set(task.status, existing);
  }

  const sections: string[] = [];

  for (const status of STATUS_ORDER) {
    const column = grouped.get(status);
    if (!column || column.length === 0) continue;

    const label = STATUS_LABELS[status] ?? status;
    const lines: string[] = [`▸ ${label} (${column.length})`];

    for (let i = 0; i < column.length; i++) {
      const task = column[i]!;
      const symbol = PRIORITY_SYMBOL[task.priority] ?? '◐';
      const due = task.due_date ? ` (due ${task.due_date})` : '';
      const cat = task.category ? ` · ${task.category}` : '';
      const connector = i === column.length - 1 ? '└─' : '├─';
      lines.push(`${connector} ${symbol} ${task.title}${due}${cat}`);
    }

    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n');
}
