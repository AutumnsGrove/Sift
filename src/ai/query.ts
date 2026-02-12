// Sift — Natural Language to SQL Query Engine
// Converts conversational questions into D1 queries

import type { Env, ConversationMessage, Task } from '../types';
import { queryTasksRaw } from '../db/tasks';

const QUERY_SYSTEM_PROMPT = `You are Sift, a personal task triage assistant. The user is asking about their tasks stored in a D1 (SQLite) database.

Your job: Generate a SQL SELECT query to answer their question, then format the results conversationally.

Database schema:
- tasks table: id, title, description, status, priority, category, due_date, tags, source_type, raw_input, ai_notes, created_at, updated_at, completed_at
- status values: 'backlog', 'todo', 'in_progress', 'review', 'done', 'archived'
- priority values: 'critical', 'high', 'medium', 'low', 'someday'
- due_date is ISO 8601 (YYYY-MM-DD) or NULL

Rules:
- Only generate SELECT statements. Never INSERT, UPDATE, DELETE, DROP, etc.
- Use parameterized patterns but return the final SQL with values inline (D1 doesn't support params in raw queries via AI)
- Always LIMIT results to 25 max
- For "today" use date('now'), for relative dates use date('now', '+N days') etc.
- When asking about "my tasks" or "my plate" or "what's up", show active tasks (not done/archived)

Respond with valid JSON only. No markdown, no code fences.

Response format:
{
  "sql": "SELECT ... FROM tasks WHERE ... ORDER BY ... LIMIT ...",
  "response_template": "A template for the response. Use {results} as a placeholder where the formatted task list will go."
}`;

/** Convert a natural language query to SQL and execute it */
export async function queryTasks(
  env: Env,
  question: string,
  conversationHistory: ConversationMessage[]
): Promise<{ tasks: Task[]; response: string }> {
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: QUERY_SYSTEM_PROMPT },
  ];

  for (const msg of conversationHistory.slice(-10)) {
    messages.push({ role: msg.role, content: msg.content });
  }

  messages.push({ role: 'user', content: question });

  const aiResponse = await env.AI.run(
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    {
      messages,
      max_tokens: 1024,
      temperature: 0.2,
    }
  );

  const responseText = typeof aiResponse === 'string'
    ? aiResponse
    : 'response' in aiResponse
      ? (aiResponse.response ?? '')
      : '';

  const parsed = parseQueryResponse(responseText);

  // Validate and execute the query
  const tasks = await executeQuery(env.DB, parsed.sql);

  // Format the response
  const response = formatQueryResults(tasks, parsed.responseTemplate, question);

  return { tasks, response };
}

interface ParsedQuery {
  sql: string;
  responseTemplate: string;
}

function parseQueryResponse(raw: string): ParsedQuery {
  try {
    let jsonStr = raw.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch?.[1]) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr) as {
      sql?: string;
      response_template?: string;
    };

    return {
      sql: parsed.sql ?? "SELECT * FROM tasks WHERE status NOT IN ('done', 'archived') ORDER BY priority LIMIT 25",
      responseTemplate: parsed.response_template ?? 'Here are your tasks:\n\n{results}',
    };
  } catch {
    // Fallback: show active tasks
    return {
      sql: "SELECT * FROM tasks WHERE status NOT IN ('done', 'archived') ORDER BY priority LIMIT 25",
      responseTemplate: 'Here are your active tasks:\n\n{results}',
    };
  }
}

async function executeQuery(db: D1Database, sql: string): Promise<Task[]> {
  try {
    return await queryTasksRaw(db, sql);
  } catch (err) {
    console.error('Query execution failed:', err);
    // Fallback to a safe query
    return queryTasksRaw(
      db,
      "SELECT * FROM tasks WHERE status NOT IN ('done', 'archived') ORDER BY created_at DESC LIMIT 10"
    );
  }
}

const prioritySymbol: Record<string, string> = {
  critical: '●',
  high: '●',
  medium: '◐',
  low: '○',
  someday: '○',
};

function formatQueryResults(
  tasks: Task[],
  template: string,
  _question: string
): string {
  if (tasks.length === 0) {
    return "No tasks found matching that. Your board might be empty, or everything matching is already done.";
  }

  const lines = tasks.map((t) => {
    const symbol = prioritySymbol[t.priority] ?? '◐';
    const due = t.due_date ? ` · due ${t.due_date}` : '';
    const cat = t.category ? ` · ${t.category}` : '';
    const status = t.status !== 'backlog' ? ` [${t.status}]` : '';
    return `${symbol} ${t.title}${due}${cat}${status}`;
  });

  const results = lines.join('\n');
  return template.replace('{results}', results);
}
