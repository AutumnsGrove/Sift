// Tests for response formatting (kanban, list, card)

import { describe, it, expect } from 'vitest';
import { formatKanban } from '../src/format/kanban';
import { formatPriorityList, formatByDueDate } from '../src/format/list';
import { formatTaskCard, formatTaskSummary } from '../src/format/card';
import type { Task } from '../src/types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'abc123',
    title: 'Test task',
    description: null,
    status: 'todo',
    priority: 'medium',
    category: null,
    due_date: null,
    tags: null,
    source_type: 'text',
    raw_input: null,
    ai_notes: null,
    created_at: '2026-02-12T00:00:00Z',
    updated_at: '2026-02-12T00:00:00Z',
    completed_at: null,
    ...overrides,
  };
}

describe('Kanban Formatting', () => {
  it('shows empty message when no active tasks', () => {
    const result = formatKanban([]);
    expect(result).toContain('empty');
  });

  it('groups tasks by status', () => {
    const tasks = [
      makeTask({ status: 'in_progress', title: 'Auth migration' }),
      makeTask({ status: 'todo', title: 'Call dentist' }),
      makeTask({ status: 'todo', title: 'Write newsletter' }),
    ];
    const result = formatKanban(tasks);
    expect(result).toContain('In Progress (1)');
    expect(result).toContain('Todo (2)');
    expect(result).toContain('Auth migration');
    expect(result).toContain('Call dentist');
    expect(result).toContain('Write newsletter');
  });

  it('excludes done and archived tasks', () => {
    const tasks = [
      makeTask({ status: 'done', title: 'Already done' }),
      makeTask({ status: 'archived', title: 'Archived' }),
      makeTask({ status: 'todo', title: 'Still active' }),
    ];
    const result = formatKanban(tasks);
    expect(result).not.toContain('Already done');
    expect(result).not.toContain('Archived');
    expect(result).toContain('Still active');
  });

  it('shows priority symbols', () => {
    const tasks = [
      makeTask({ status: 'todo', priority: 'high', title: 'Important thing' }),
      makeTask({ status: 'todo', priority: 'low', title: 'Nice to have' }),
    ];
    const result = formatKanban(tasks);
    expect(result).toContain('● Important thing');
    expect(result).toContain('○ Nice to have');
  });

  it('shows due dates', () => {
    const tasks = [
      makeTask({ status: 'todo', title: 'Due task', due_date: '2026-02-14' }),
    ];
    const result = formatKanban(tasks);
    expect(result).toContain('(due 2026-02-14)');
  });
});

describe('Priority List Formatting', () => {
  it('returns empty message for no tasks', () => {
    expect(formatPriorityList([])).toContain('No tasks');
  });

  it('formats tasks with symbols and metadata', () => {
    const tasks = [
      makeTask({ title: 'Critical bug', priority: 'critical', category: 'dev' }),
      makeTask({ title: 'Maybe later', priority: 'someday' }),
    ];
    const result = formatPriorityList(tasks);
    expect(result).toContain('● Critical bug');
    expect(result).toContain('· dev');
    expect(result).toContain('○ Maybe later');
  });
});

describe('Due Date Formatting', () => {
  it('groups by due date', () => {
    const tasks = [
      makeTask({ title: 'Task A', due_date: '2026-02-12' }),
      makeTask({ title: 'Task B', due_date: '2026-02-12' }),
      makeTask({ title: 'Task C', due_date: '2026-02-14' }),
    ];
    const result = formatByDueDate(tasks);
    expect(result).toContain('2026-02-12');
    expect(result).toContain('2026-02-14');
    expect(result).toContain('Task A');
    expect(result).toContain('Task C');
  });

  it('shows tasks without due date separately', () => {
    const tasks = [
      makeTask({ title: 'Has date', due_date: '2026-02-12' }),
      makeTask({ title: 'No date', due_date: null }),
    ];
    const result = formatByDueDate(tasks);
    expect(result).toContain('No due date');
    expect(result).toContain('No date');
  });
});

describe('Task Card Formatting', () => {
  it('shows full task details', () => {
    const task = makeTask({
      title: 'Auth migration',
      priority: 'high',
      status: 'in_progress',
      category: 'dev',
      due_date: '2026-02-14',
      description: 'Migrate from old auth to Heartwood',
      tags: '["grove", "auth"]',
      ai_notes: 'This is launch-critical',
    });
    const result = formatTaskCard(task);
    expect(result).toContain('● Auth migration');
    expect(result).toContain('In Progress');
    expect(result).toContain('high');
    expect(result).toContain('dev');
    expect(result).toContain('2026-02-14');
    expect(result).toContain('Migrate from old auth');
    expect(result).toContain('grove, auth');
    expect(result).toContain('launch-critical');
  });
});

describe('Task Summary Formatting', () => {
  it('shows count and breakdown', () => {
    const tasks = [
      makeTask({ status: 'todo', priority: 'high' }),
      makeTask({ status: 'todo', priority: 'medium' }),
      makeTask({ status: 'in_progress', priority: 'critical' }),
    ];
    const result = formatTaskSummary(tasks);
    expect(result).toContain('3 tasks total');
    expect(result).toContain('high-priority');
  });
});
