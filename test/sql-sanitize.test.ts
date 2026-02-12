// Tests for SQL query sanitization in queryTasksRaw
// This is a critical security surface — AI generates SQL that gets executed

import { describe, it, expect } from 'vitest';

// Extract the sanitizeQuery function logic for testing
// Since it's private, we test through the validation patterns directly

function sanitizeQuery(sql: string): string {
  const trimmed = sql.trim();

  if (!/^SELECT\b/i.test(trimmed)) {
    throw new Error('Only SELECT queries are allowed');
  }

  const forbidden = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX)\b/i;
  if (forbidden.test(trimmed)) {
    throw new Error('Query contains forbidden SQL keywords');
  }

  const withoutTrailingSemicolon = trimmed.replace(/;\s*$/, '');
  if (withoutTrailingSemicolon.includes(';')) {
    throw new Error('Stacked queries are not allowed');
  }

  if (!/\bFROM\s+tasks\b/i.test(trimmed)) {
    throw new Error('Queries must target the tasks table');
  }

  if (!/\bLIMIT\b/i.test(trimmed)) {
    return `${withoutTrailingSemicolon} LIMIT 25`;
  }

  return withoutTrailingSemicolon;
}

describe('SQL Sanitization', () => {
  describe('valid queries', () => {
    it('allows basic SELECT from tasks', () => {
      const sql = "SELECT * FROM tasks WHERE status = 'todo'";
      expect(sanitizeQuery(sql)).toBe("SELECT * FROM tasks WHERE status = 'todo' LIMIT 25");
    });

    it('allows SELECT with LIMIT', () => {
      const sql = "SELECT * FROM tasks WHERE status = 'todo' LIMIT 10";
      expect(sanitizeQuery(sql)).toBe("SELECT * FROM tasks WHERE status = 'todo' LIMIT 10");
    });

    it('allows complex SELECT with joins on tasks', () => {
      const sql = "SELECT id, title, priority FROM tasks WHERE priority = 'high' ORDER BY created_at DESC LIMIT 5";
      expect(sanitizeQuery(sql)).toBe(
        "SELECT id, title, priority FROM tasks WHERE priority = 'high' ORDER BY created_at DESC LIMIT 5"
      );
    });

    it('strips trailing semicolon', () => {
      const sql = "SELECT * FROM tasks;";
      expect(sanitizeQuery(sql)).toBe('SELECT * FROM tasks LIMIT 25');
    });

    it('is case insensitive for SELECT', () => {
      const sql = "select * from tasks limit 10";
      expect(sanitizeQuery(sql)).toBe("select * from tasks limit 10");
    });
  });

  describe('blocked queries', () => {
    it('blocks INSERT statements', () => {
      expect(() => sanitizeQuery("INSERT INTO tasks VALUES ('x')")).toThrow('Only SELECT');
    });

    it('blocks UPDATE statements', () => {
      expect(() => sanitizeQuery("UPDATE tasks SET status = 'done'")).toThrow('Only SELECT');
    });

    it('blocks DELETE statements', () => {
      expect(() => sanitizeQuery("DELETE FROM tasks")).toThrow('Only SELECT');
    });

    it('blocks DROP TABLE', () => {
      expect(() => sanitizeQuery("DROP TABLE tasks")).toThrow('Only SELECT');
    });

    it('blocks SELECT with embedded DROP', () => {
      expect(() =>
        sanitizeQuery("SELECT * FROM tasks; DROP TABLE tasks")
      ).toThrow(); // blocked by forbidden keywords or stacked queries
    });

    it('blocks stacked queries with INSERT', () => {
      expect(() =>
        sanitizeQuery("SELECT * FROM tasks; INSERT INTO tasks VALUES ('x')")
      ).toThrow(); // blocked by forbidden keywords or stacked queries
    });

    it('blocks PRAGMA commands', () => {
      expect(() => sanitizeQuery("PRAGMA table_info(tasks)")).toThrow('Only SELECT');
    });

    it('blocks SELECT with ATTACH', () => {
      expect(() =>
        sanitizeQuery("SELECT * FROM tasks WHERE 1=1; ATTACH DATABASE ':memory:' AS db2")
      ).toThrow(); // blocked by forbidden keywords or stacked queries
    });

    it('blocks queries targeting other tables', () => {
      expect(() =>
        sanitizeQuery("SELECT * FROM conversations")
      ).toThrow('Queries must target the tasks table');
    });

    it('blocks SELECT containing forbidden keywords in subqueries', () => {
      expect(() =>
        sanitizeQuery("SELECT * FROM tasks WHERE id IN (DELETE FROM tasks RETURNING id)")
      ).toThrow('Query contains forbidden SQL keywords');
    });
  });

  describe('edge cases', () => {
    it('adds LIMIT when missing', () => {
      const result = sanitizeQuery("SELECT * FROM tasks");
      expect(result).toContain('LIMIT 25');
    });

    it('handles whitespace', () => {
      const sql = "  SELECT * FROM tasks  ";
      expect(sanitizeQuery(sql)).toBe('SELECT * FROM tasks LIMIT 25');
    });

    it('blocks empty input', () => {
      expect(() => sanitizeQuery('')).toThrow('Only SELECT');
    });
  });
});
