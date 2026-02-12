// Sift — Proactive Suggestion Engine
// Generates one contextual suggestion to append to task responses

import type { Task } from '../types';

/** Generate a proactive suggestion based on the current board state */
export function generateSuggestion(
  activeTasks: Task[],
  recentAction?: { type: 'create' | 'update' | 'query'; taskCount?: number }
): string | null {
  const overdue = activeTasks.filter(
    (t) => t.due_date && t.due_date < todayISO() && t.status !== 'done' && t.status !== 'archived'
  );
  const inProgress = activeTasks.filter((t) => t.status === 'in_progress');
  const backlog = activeTasks.filter((t) => t.status === 'backlog');
  const highPriority = activeTasks.filter(
    (t) => (t.priority === 'critical' || t.priority === 'high') && t.status !== 'done'
  );

  // Priority 1: Flag overdue items
  if (overdue.length > 0) {
    if (overdue.length === 1) {
      const task = overdue[0]!;
      const days = getDaysOverdue(task.due_date!);
      return `"${task.title}" is ${days} day${days > 1 ? 's' : ''} overdue. Want to deal with it or reschedule?`;
    }
    return `You have ${overdue.length} overdue items. Want me to show them so you can triage?`;
  }

  // Priority 2: Too much WIP
  if (inProgress.length > 3) {
    return `You have ${inProgress.length} items in progress — that's a lot of WIP. Consider finishing a couple before starting more.`;
  }

  // Priority 3: After completing a task, suggest what's next
  if (recentAction?.type === 'update' && inProgress.length === 0 && highPriority.length > 0) {
    return `Your in-progress queue is empty. "${highPriority[0]!.title}" is your next high-priority item — want to pull it in?`;
  }

  // Priority 4: Stale backlog
  if (backlog.length > 10) {
    const oldest = backlog[backlog.length - 1];
    if (oldest) {
      const days = getDaysOld(oldest.created_at);
      if (days > 14) {
        return `You have ${backlog.length} items in backlog. Some are ${days}+ days old — worth a quick cleanup?`;
      }
    }
  }

  // Priority 5: After a big brain dump
  if (recentAction?.type === 'create' && recentAction.taskCount && recentAction.taskCount >= 4) {
    return `That was a big dump — ${recentAction.taskCount} tasks. Want me to help prioritize them?`;
  }

  // No suggestion needed
  return null;
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]!;
}

function getDaysOverdue(dueDateStr: string): number {
  const due = new Date(dueDateStr + 'T00:00:00');
  const now = new Date();
  return Math.max(1, Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
}

function getDaysOld(createdAt: string): number {
  const created = new Date(createdAt);
  const now = new Date();
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}
