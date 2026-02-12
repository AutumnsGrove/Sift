// Sift — Task CRUD Operations

import type { Task, CreateTaskInput, UpdateTaskInput, TaskStatus } from '../types';

/** Create a new task */
export async function createTask(db: D1Database, input: CreateTaskInput): Promise<Task> {
  const tags = input.tags ? JSON.stringify(input.tags) : null;
  const result = await db
    .prepare(
      `INSERT INTO tasks (title, description, status, priority, category, due_date, tags, source_type, raw_input, ai_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`
    )
    .bind(
      input.title,
      input.description ?? null,
      input.status ?? 'backlog',
      input.priority ?? 'medium',
      input.category ?? null,
      input.due_date ?? null,
      tags,
      input.source_type,
      input.raw_input ?? null,
      input.ai_notes ?? null
    )
    .first<Task>();

  if (!result) {
    throw new Error('Failed to create task');
  }
  return result;
}

/** Get a task by ID */
export async function getTask(db: D1Database, id: string): Promise<Task | null> {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<Task>();
}

/** Update a task by ID */
export async function updateTask(
  db: D1Database,
  id: string,
  changes: UpdateTaskInput
): Promise<Task | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];

  if (changes.title !== undefined) {
    setClauses.push('title = ?');
    values.push(changes.title);
  }
  if (changes.description !== undefined) {
    setClauses.push('description = ?');
    values.push(changes.description);
  }
  if (changes.status !== undefined) {
    setClauses.push('status = ?');
    values.push(changes.status);
    if (changes.status === 'done') {
      setClauses.push("completed_at = datetime('now')");
    }
  }
  if (changes.priority !== undefined) {
    setClauses.push('priority = ?');
    values.push(changes.priority);
  }
  if (changes.category !== undefined) {
    setClauses.push('category = ?');
    values.push(changes.category);
  }
  if (changes.due_date !== undefined) {
    setClauses.push('due_date = ?');
    values.push(changes.due_date);
  }
  if (changes.tags !== undefined) {
    setClauses.push('tags = ?');
    values.push(JSON.stringify(changes.tags));
  }
  if (changes.ai_notes !== undefined) {
    setClauses.push('ai_notes = ?');
    values.push(changes.ai_notes);
  }

  if (setClauses.length === 0) return getTask(db, id);

  setClauses.push("updated_at = datetime('now')");
  values.push(id);

  const sql = `UPDATE tasks SET ${setClauses.join(', ')} WHERE id = ? RETURNING *`;
  return db.prepare(sql).bind(...values).first<Task>();
}

/** Query tasks by status */
export async function getTasksByStatus(
  db: D1Database,
  status: TaskStatus
): Promise<Task[]> {
  const { results } = await db
    .prepare('SELECT * FROM tasks WHERE status = ? ORDER BY priority, created_at')
    .bind(status)
    .all<Task>();
  return results;
}

/** Get active tasks (not done/archived) ordered by priority */
export async function getActiveTasks(db: D1Database): Promise<Task[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM tasks
       WHERE status NOT IN ('done', 'archived')
       ORDER BY
         CASE priority
           WHEN 'critical' THEN 0
           WHEN 'high' THEN 1
           WHEN 'medium' THEN 2
           WHEN 'low' THEN 3
           WHEN 'someday' THEN 4
         END,
         created_at`
    )
    .all<Task>();
  return results;
}

/** Get tasks due on or before a given date */
export async function getTasksDueBefore(
  db: D1Database,
  date: string
): Promise<Task[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM tasks
       WHERE due_date IS NOT NULL
         AND due_date <= ?
         AND status NOT IN ('done', 'archived')
       ORDER BY due_date, priority`
    )
    .bind(date)
    .all<Task>();
  return results;
}

/** Search tasks by title/description text */
export async function searchTasks(
  db: D1Database,
  query: string
): Promise<Task[]> {
  const pattern = `%${query}%`;
  const { results } = await db
    .prepare(
      `SELECT * FROM tasks
       WHERE (title LIKE ? OR description LIKE ?)
         AND status NOT IN ('archived')
       ORDER BY updated_at DESC
       LIMIT 20`
    )
    .bind(pattern, pattern)
    .all<Task>();
  return results;
}

/** Execute a raw read-only SQL query against the tasks table */
export async function queryTasksRaw(
  db: D1Database,
  sql: string
): Promise<Task[]> {
  const sanitized = sanitizeQuery(sql);
  const { results } = await db.prepare(sanitized).all<Task>();
  return results;
}

/** Sanitize an AI-generated SQL query to prevent injection */
function sanitizeQuery(sql: string): string {
  const trimmed = sql.trim();

  // Must start with SELECT
  if (!/^SELECT\b/i.test(trimmed)) {
    throw new Error('Only SELECT queries are allowed');
  }

  // Block dangerous keywords that shouldn't appear in a read query
  const forbidden = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX)\b/i;
  if (forbidden.test(trimmed)) {
    throw new Error('Query contains forbidden SQL keywords');
  }

  // Block stacked queries (semicolons followed by more SQL)
  // Allow semicolon only at the very end
  const withoutTrailingSemicolon = trimmed.replace(/;\s*$/, '');
  if (withoutTrailingSemicolon.includes(';')) {
    throw new Error('Stacked queries are not allowed');
  }

  // Only allow querying the tasks table
  if (!/\bFROM\s+tasks\b/i.test(trimmed)) {
    throw new Error('Queries must target the tasks table');
  }

  // Enforce a LIMIT to prevent unbounded queries
  if (!/\bLIMIT\b/i.test(trimmed)) {
    return `${withoutTrailingSemicolon} LIMIT 25`;
  }

  return withoutTrailingSemicolon;
}
