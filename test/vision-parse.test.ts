// Tests for vision pipeline response parsing
// Validates that Llama 4 Scout responses get correctly parsed into tasks

import { describe, it, expect } from 'vitest';
import type { TriagedTask } from '../src/types';

// Replicate parsing logic from pipeline/vision.ts for isolated testing

function validatePriority(p: unknown): TriagedTask['priority'] {
  const valid = ['critical', 'high', 'medium', 'low', 'someday'] as const;
  if (typeof p === 'string' && valid.includes(p as (typeof valid)[number])) {
    return p as TriagedTask['priority'];
  }
  return 'medium';
}

interface VisionResult {
  tasks: TriagedTask[];
  imageDescription: string;
  response: string;
}

function parseVisionResponse(raw: string): VisionResult {
  try {
    let jsonStr = raw.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch?.[1]) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr) as {
      tasks?: TriagedTask[];
      image_description?: string;
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

    const imageDescription = parsed.image_description ?? '';
    let response = parsed.response ?? '';
    if (!response.includes('▦')) {
      response = `[▦ From image] ${response}`;
    }

    return { tasks, imageDescription, response };
  } catch {
    return {
      tasks: [],
      imageDescription: '',
      response: "[▦ From image] I looked at the image but couldn't parse any tasks from it.",
    };
  }
}

describe('Vision Response Parsing', () => {
  it('parses valid JSON with tasks from a screenshot', () => {
    const raw = JSON.stringify({
      tasks: [
        { title: 'Reply to John about meeting', priority: 'high', category: 'work' },
        { title: 'Book flight for March 5', priority: 'medium', category: 'travel' },
      ],
      image_description: 'Screenshot of an email inbox with 2 action items',
      response: '[▦ From image] Found 2 tasks from your screenshot:\n\n● Reply to John about meeting\n◐ Book flight for March 5',
    });

    const result = parseVisionResponse(raw);
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0]!.title).toBe('Reply to John about meeting');
    expect(result.tasks[0]!.priority).toBe('high');
    expect(result.tasks[1]!.title).toBe('Book flight for March 5');
    expect(result.imageDescription).toBe('Screenshot of an email inbox with 2 action items');
    expect(result.response).toContain('▦');
  });

  it('handles response without [▦] tag', () => {
    const raw = JSON.stringify({
      tasks: [{ title: 'Test task', priority: 'low' }],
      image_description: 'A whiteboard',
      response: 'Found a task from the whiteboard.',
    });

    const result = parseVisionResponse(raw);
    expect(result.response).toContain('[▦ From image]');
    expect(result.response).toContain('Found a task from the whiteboard.');
  });

  it('handles markdown-fenced JSON', () => {
    const raw = '```json\n{"tasks": [{"title": "OCR task", "priority": "medium"}], "image_description": "handwritten notes", "response": "[▦ From image] Got it."}\n```';
    const result = parseVisionResponse(raw);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]!.title).toBe('OCR task');
  });

  it('falls back gracefully on invalid JSON', () => {
    const result = parseVisionResponse('The image shows a sunset over the ocean.');
    expect(result.tasks).toHaveLength(0);
    expect(result.response).toContain('▦');
    expect(result.response).toContain("couldn't parse");
  });

  it('handles empty tasks array (no actionable items)', () => {
    const raw = JSON.stringify({
      tasks: [],
      image_description: 'A landscape photo',
      response: "[▦ From image] Nice photo! I don't see any tasks in this.",
    });

    const result = parseVisionResponse(raw);
    expect(result.tasks).toHaveLength(0);
    expect(result.imageDescription).toBe('A landscape photo');
  });

  it('truncates excessively long fields', () => {
    const raw = JSON.stringify({
      tasks: [{
        title: 'A'.repeat(500),
        description: 'B'.repeat(2000),
        priority: 'high',
        ai_notes: 'C'.repeat(1000),
      }],
      response: '[▦ From image] Done.',
    });

    const result = parseVisionResponse(raw);
    expect(result.tasks[0]!.title.length).toBeLessThanOrEqual(200);
    expect(result.tasks[0]!.description!.length).toBeLessThanOrEqual(1000);
    expect(result.tasks[0]!.ai_notes!.length).toBeLessThanOrEqual(500);
  });

  it('validates priority values from vision model', () => {
    const raw = JSON.stringify({
      tasks: [{ title: 'Task with bad priority', priority: 'URGENT' }],
      response: '[▦ From image] Done.',
    });

    const result = parseVisionResponse(raw);
    expect(result.tasks[0]!.priority).toBe('medium'); // falls back to medium
  });
});

describe('arrayBufferToBase64 equivalent', () => {
  it('converts simple data correctly', () => {
    // Test the concept: Uint8Array → binary string → btoa
    const data = new TextEncoder().encode('Hello');
    const buffer = data.buffer;
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    const base64 = btoa(binary);
    expect(base64).toBe('SGVsbG8=');
  });
});
