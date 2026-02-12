// Tests for triage response parsing
// Validates that AI responses get correctly parsed into structured tasks

import { describe, it, expect } from 'vitest';
import type { TriagedTask, TriageResult } from '../src/types';

// Replicate parseTriage logic for testing (private function)
function validatePriority(p: unknown): TriagedTask['priority'] {
  const valid = ['critical', 'high', 'medium', 'low', 'someday'] as const;
  if (typeof p === 'string' && valid.includes(p as (typeof valid)[number])) {
    return p as TriagedTask['priority'];
  }
  return 'medium';
}

function parseTriage(raw: string, originalText: string): TriageResult {
  try {
    let jsonStr = raw.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch?.[1]) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr) as {
      tasks?: TriagedTask[];
      response?: string;
    };

    const tasks: TriagedTask[] = (parsed.tasks ?? []).map((t) => ({
      title: String(t.title ?? '').slice(0, 200),
      description: t.description ? String(t.description).slice(0, 1000) : undefined,
      priority: validatePriority(t.priority),
      category: t.category ? String(t.category).slice(0, 50) : undefined,
      due_date: t.due_date ? String(t.due_date) : undefined,
      tags: Array.isArray(t.tags) ? t.tags.map(String).slice(0, 10) : undefined,
      ai_notes: t.ai_notes ? String(t.ai_notes).slice(0, 500) : undefined,
    }));

    return {
      tasks,
      response: parsed.response ?? `Captured ${tasks.length} task(s).`,
    };
  } catch {
    return {
      tasks: [
        {
          title: originalText.slice(0, 100),
          priority: 'medium',
        },
      ],
      response: 'Got it — saved that as a task.',
    };
  }
}

describe('Triage Response Parsing', () => {
  it('parses valid JSON response', () => {
    const raw = JSON.stringify({
      tasks: [
        { title: 'Fix auth bug', priority: 'high', category: 'dev' },
        { title: 'Call dentist', priority: 'medium', category: 'health' },
      ],
      response: 'Got it, 2 tasks captured.',
    });

    const result = parseTriage(raw, 'fix auth bug and call dentist');
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0]!.title).toBe('Fix auth bug');
    expect(result.tasks[0]!.priority).toBe('high');
    expect(result.tasks[1]!.title).toBe('Call dentist');
    expect(result.response).toBe('Got it, 2 tasks captured.');
  });

  it('handles markdown-fenced JSON', () => {
    const raw = '```json\n{"tasks": [{"title": "Test", "priority": "low"}], "response": "Done."}\n```';
    const result = parseTriage(raw, 'test');
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]!.title).toBe('Test');
    expect(result.tasks[0]!.priority).toBe('low');
  });

  it('falls back to raw capture on invalid JSON', () => {
    const raw = 'This is not JSON at all';
    const result = parseTriage(raw, 'some task text');
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]!.title).toBe('some task text');
    expect(result.tasks[0]!.priority).toBe('medium');
  });

  it('validates priority values', () => {
    expect(validatePriority('critical')).toBe('critical');
    expect(validatePriority('high')).toBe('high');
    expect(validatePriority('medium')).toBe('medium');
    expect(validatePriority('low')).toBe('low');
    expect(validatePriority('someday')).toBe('someday');
    expect(validatePriority('invalid')).toBe('medium');
    expect(validatePriority(null)).toBe('medium');
    expect(validatePriority(42)).toBe('medium');
  });

  it('truncates excessively long fields', () => {
    const longTitle = 'A'.repeat(500);
    const raw = JSON.stringify({
      tasks: [{ title: longTitle, priority: 'medium' }],
      response: 'Captured.',
    });

    const result = parseTriage(raw, 'test');
    expect(result.tasks[0]!.title.length).toBeLessThanOrEqual(200);
  });

  it('limits tags array to 10', () => {
    const tags = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    const raw = JSON.stringify({
      tasks: [{ title: 'Tagged task', priority: 'low', tags }],
      response: 'Done.',
    });

    const result = parseTriage(raw, 'test');
    expect(result.tasks[0]!.tags!.length).toBeLessThanOrEqual(10);
  });

  it('handles empty tasks array', () => {
    const raw = JSON.stringify({ tasks: [], response: 'No tasks found.' });
    const result = parseTriage(raw, 'test');
    expect(result.tasks).toHaveLength(0);
    expect(result.response).toBe('No tasks found.');
  });
});
