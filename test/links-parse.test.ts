// Tests for link pipeline response parsing and HTML stripping
// Validates URL processing, content extraction, and task parsing

import { describe, it, expect } from 'vitest';
import type { TriagedTask } from '../src/types';

// Replicate stripHtml from pipeline/links.ts for testing
function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Replicate parseLinkResponse from pipeline/links.ts
function validatePriority(p: unknown): TriagedTask['priority'] {
  const valid = ['critical', 'high', 'medium', 'low', 'someday'] as const;
  if (typeof p === 'string' && valid.includes(p as (typeof valid)[number])) {
    return p as TriagedTask['priority'];
  }
  return 'medium';
}

interface LinkResult {
  tasks: TriagedTask[];
  summary: string;
  response: string;
}

function parseLinkResponse(raw: string, url: string): LinkResult {
  try {
    let jsonStr = raw.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch?.[1]) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr) as {
      summary?: string;
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

    const summary = parsed.summary ?? '';
    let response = parsed.response ?? `[⇗ From link] ${url}`;
    if (!response.includes('⇗')) {
      response = `[⇗ From link] ${response}`;
    }

    return { tasks, summary, response };
  } catch {
    return {
      tasks: [],
      summary: '',
      response: `[⇗ From link] I fetched the page but had trouble extracting details.\n\n${url}`,
    };
  }
}

describe('HTML Stripping', () => {
  it('strips basic HTML tags', () => {
    expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
  });

  it('removes script blocks entirely', () => {
    const html = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
    const result = stripHtml(html);
    expect(result).not.toContain('alert');
    expect(result).not.toContain('script');
    expect(result).toContain('Hello');
    expect(result).toContain('World');
  });

  it('removes style blocks entirely', () => {
    const html = '<p>Hello</p><style>.red { color: red; }</style><p>World</p>';
    const result = stripHtml(html);
    expect(result).not.toContain('color');
    expect(result).not.toContain('style');
  });

  it('decodes HTML entities', () => {
    expect(stripHtml('a &amp; b &lt; c &gt; d &quot;e&quot; f&#39;g')).toBe(
      'a & b < c > d "e" f\'g'
    );
  });

  it('collapses whitespace', () => {
    expect(stripHtml('  hello    world   ')).toBe('hello world');
  });

  it('handles nested tags', () => {
    expect(stripHtml('<div><ul><li>Item 1</li><li>Item 2</li></ul></div>')).toBe(
      'Item 1 Item 2'
    );
  });

  it('handles empty input', () => {
    expect(stripHtml('')).toBe('');
  });

  it('handles complex real-world HTML', () => {
    const html = `
      <html><head><title>Test Page</title></head>
      <body>
        <nav>Menu</nav>
        <main>
          <h1>Article Title</h1>
          <p>This is the main content &amp; it has <a href="#">links</a>.</p>
        </main>
        <script>var x = 1;</script>
      </body></html>
    `;
    const result = stripHtml(html);
    expect(result).toContain('Article Title');
    expect(result).toContain('This is the main content & it has links');
    expect(result).not.toContain('var x');
  });
});

describe('Link Response Parsing', () => {
  it('parses valid JSON with article summary and tasks', () => {
    const raw = JSON.stringify({
      summary: 'Article about Cloudflare D1 database triggers and their limitations.',
      tasks: [
        {
          title: 'Research D1 trigger support',
          priority: 'low',
          category: 'dev',
          tags: ['cloudflare', 'd1'],
        },
      ],
      response: '[⇗ From link] Article about D1 triggers.\n\n○ Research D1 trigger support',
    });

    const result = parseLinkResponse(raw, 'https://example.com/d1-triggers');
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]!.title).toBe('Research D1 trigger support');
    expect(result.summary).toBe('Article about Cloudflare D1 database triggers and their limitations.');
    expect(result.response).toContain('⇗');
  });

  it('adds [⇗ From link] tag if missing', () => {
    const raw = JSON.stringify({
      summary: 'A blog post.',
      tasks: [],
      response: 'Interesting article about testing.',
    });

    const result = parseLinkResponse(raw, 'https://example.com');
    expect(result.response).toContain('[⇗ From link]');
  });

  it('falls back gracefully on invalid JSON', () => {
    const result = parseLinkResponse('Not JSON at all', 'https://example.com/page');
    expect(result.tasks).toHaveLength(0);
    expect(result.response).toContain('⇗');
    expect(result.response).toContain('example.com/page');
  });

  it('handles markdown-fenced JSON', () => {
    const raw = '```json\n{"summary": "Test", "tasks": [{"title": "Check this", "priority": "medium"}], "response": "[⇗ From link] Done."}\n```';
    const result = parseLinkResponse(raw, 'https://test.com');
    expect(result.tasks).toHaveLength(1);
    expect(result.summary).toBe('Test');
  });

  it('handles GitHub-style content extraction', () => {
    const raw = JSON.stringify({
      summary: 'GitHub issue #42: Fix memory leak in worker pool',
      tasks: [
        {
          title: 'Fix memory leak in worker pool',
          priority: 'high',
          category: 'dev',
          description: 'Workers are accumulating memory over time. Need to investigate the pool cleanup.',
          tags: ['bug', 'performance'],
          ai_notes: 'This is a GitHub issue, likely time-sensitive.',
        },
      ],
      response: '[⇗ From link] GitHub issue about a memory leak.\n\n● Fix memory leak in worker pool\n\nSaved.',
    });

    const result = parseLinkResponse(raw, 'https://github.com/org/repo/issues/42');
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]!.priority).toBe('high');
    expect(result.tasks[0]!.tags).toContain('bug');
  });

  it('truncates long fields', () => {
    const raw = JSON.stringify({
      summary: 'X'.repeat(200),
      tasks: [{ title: 'T'.repeat(500), priority: 'high' }],
      response: '[⇗ From link] Done.',
    });

    const result = parseLinkResponse(raw, 'https://example.com');
    expect(result.tasks[0]!.title.length).toBeLessThanOrEqual(200);
  });
});

describe('URL Validation', () => {
  it('accepts valid http URLs', () => {
    expect(() => new URL('https://example.com')).not.toThrow();
    expect(() => new URL('http://example.com/path?q=1')).not.toThrow();
  });

  it('rejects invalid URLs', () => {
    expect(() => new URL('not-a-url')).toThrow();
    expect(() => new URL('')).toThrow();
  });

  it('identifies non-http protocols', () => {
    const url = new URL('ftp://files.example.com/file.txt');
    expect(url.protocol).toBe('ftp:');
    expect(url.protocol !== 'http:' && url.protocol !== 'https:').toBe(true);
  });
});
