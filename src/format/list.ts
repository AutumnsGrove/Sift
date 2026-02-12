// Sift — List Formatting
// Formats tasks as priority or date-sorted lists

import type { Task } from '../types';

const PRIORITY_SYMBOL: Record<string, string> = {
  critical: '●',
  high: '●',
  medium: '◐',
  low: '○',
  someday: '○',
};

/** Format tasks as a priority-sorted list */
export function formatPriorityList(tasks: Task[]): string {
  if (tasks.length === 0) {
    return 'No tasks to show.';
  }

  const lines = tasks.map((t) => {
    const symbol = PRIORITY_SYMBOL[t.priority] ?? '◐';
    const due = t.due_date ? ` · due ${t.due_date}` : '';
    const cat = t.category ? ` · ${t.category}` : '';
    const status = t.status !== 'backlog' ? ` [${t.status}]` : '';
    return `${symbol} ${t.title}${due}${cat}${status}`;
  });

  return lines.join('\n');
}

/** Format tasks grouped by due date */
export function formatByDueDate(tasks: Task[]): string {
  const withDue = tasks.filter((t) => t.due_date);
  const noDue = tasks.filter((t) => !t.due_date);

  if (withDue.length === 0 && noDue.length === 0) {
    return 'No tasks to show.';
  }

  // Sort by due date
  withDue.sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));

  const sections: string[] = [];

  // Group by date
  const grouped = new Map<string, Task[]>();
  for (const task of withDue) {
    const date = task.due_date!;
    const existing = grouped.get(date) ?? [];
    existing.push(task);
    grouped.set(date, existing);
  }

  for (const [date, dateTasks] of grouped) {
    const lines = dateTasks.map((t) => {
      const symbol = PRIORITY_SYMBOL[t.priority] ?? '◐';
      return `  ${symbol} ${t.title}`;
    });
    sections.push(`▸ ${date}\n${lines.join('\n')}`);
  }

  if (noDue.length > 0) {
    const lines = noDue.map((t) => {
      const symbol = PRIORITY_SYMBOL[t.priority] ?? '◐';
      return `  ${symbol} ${t.title}`;
    });
    sections.push(`▸ No due date\n${lines.join('\n')}`);
  }

  return sections.join('\n\n');
}
