// Tests for the proactive suggestion engine

import { describe, it, expect } from 'vitest';
import { generateSuggestion } from '../src/ai/suggest';
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
    ...overrides,
  };
}

function pastDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0]!;
}

describe('Proactive Suggestion Engine', () => {
  it('flags overdue items (single)', () => {
    const tasks = [
      makeTask({ title: 'Overdue thing', due_date: pastDate(3), status: 'todo' }),
    ];
    const suggestion = generateSuggestion(tasks);
    expect(suggestion).toContain('Overdue thing');
    expect(suggestion).toContain('overdue');
  });

  it('flags multiple overdue items', () => {
    const tasks = [
      makeTask({ title: 'Thing 1', due_date: pastDate(1), status: 'todo' }),
      makeTask({ title: 'Thing 2', due_date: pastDate(2), status: 'todo' }),
    ];
    const suggestion = generateSuggestion(tasks);
    expect(suggestion).toContain('2 overdue');
  });

  it('warns about too much WIP', () => {
    const tasks = [
      makeTask({ status: 'in_progress', title: 'WIP 1' }),
      makeTask({ status: 'in_progress', title: 'WIP 2' }),
      makeTask({ status: 'in_progress', title: 'WIP 3' }),
      makeTask({ status: 'in_progress', title: 'WIP 4' }),
    ];
    const suggestion = generateSuggestion(tasks);
    expect(suggestion).toContain('4 items in progress');
    expect(suggestion).toContain('WIP');
  });

  it('suggests next task after clearing in-progress', () => {
    const tasks = [
      makeTask({ status: 'todo', priority: 'high', title: 'Important next' }),
      makeTask({ status: 'todo', priority: 'low', title: 'Not important' }),
    ];
    const suggestion = generateSuggestion(tasks, { type: 'update' });
    expect(suggestion).toContain('Important next');
    expect(suggestion).toContain('high-priority');
  });

  it('suggests cleanup for stale backlog', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 30);
    const tasks = Array.from({ length: 12 }, (_, i) =>
      makeTask({
        status: 'backlog',
        title: `Backlog ${i}`,
        created_at: oldDate.toISOString(),
      })
    );
    const suggestion = generateSuggestion(tasks);
    expect(suggestion).toContain('backlog');
    expect(suggestion).toContain('cleanup');
  });

  it('flags big brain dumps', () => {
    const tasks = [
      makeTask({ status: 'todo' }),
      makeTask({ status: 'todo' }),
    ];
    const suggestion = generateSuggestion(tasks, { type: 'create', taskCount: 5 });
    expect(suggestion).toContain('5 tasks');
    expect(suggestion).toContain('prioritize');
  });

  it('returns null when nothing notable', () => {
    const tasks = [
      makeTask({ status: 'todo', priority: 'medium' }),
      makeTask({ status: 'in_progress', priority: 'medium' }),
    ];
    const suggestion = generateSuggestion(tasks, { type: 'query' });
    expect(suggestion).toBeNull();
  });

  it('returns null for empty board', () => {
    const suggestion = generateSuggestion([]);
    expect(suggestion).toBeNull();
  });
});
