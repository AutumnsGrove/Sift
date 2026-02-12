// Sift — Task Update Handler
// Processes natural language task updates with fuzzy matching

import type { Env, ConversationMessage, Task, UpdateTaskInput } from '../types';
import { updateTask, getActiveTasks } from '../db/tasks';
import { callAI } from './provider';

const UPDATE_SYSTEM_PROMPT = `You are Sift, a personal task triage assistant. The user wants to update an existing task.

You will be given:
1. The user's message describing what to change
2. A list of their current tasks to match against

Your job:
1. Identify which task they're referring to (fuzzy match by title/description)
2. Determine what change to make (status, priority, due date, etc.)
3. Return a structured update

Status transitions: backlog → todo → in_progress → review → done → archived
Priority levels: critical, high, medium, low, someday

Common patterns:
- "the X thing is done" → status: "done"
- "bump X to high" → priority: "high"
- "move X to in progress" → status: "in_progress"
- "X is due friday" → due_date: "YYYY-MM-DD"
- "archive the Y task" → status: "archived"

Respond with valid JSON only. No markdown, no code fences.

Response format:
{
  "task_id": "the ID of the matched task",
  "task_title": "the title of the matched task",
  "changes": {
    "status": "...",
    "priority": "...",
    "due_date": "..."
  },
  "response": "Conversational confirmation using ✓ symbol. Mention what changed and suggest next steps."
}

If you can't identify the task, respond:
{
  "task_id": null,
  "task_title": null,
  "changes": {},
  "response": "I'm not sure which task you mean. Could you be more specific?"
}`;

/** Process a task update request */
export async function processUpdate(
  env: Env,
  text: string,
  conversationHistory: ConversationMessage[]
): Promise<{ task: Task | null; response: string }> {
  // Get active tasks for fuzzy matching
  const tasks = await getActiveTasks(env.DB);

  const taskListForAi = tasks
    .map((t) => `- [${t.id}] ${t.title} (${t.status}, ${t.priority}${t.due_date ? `, due ${t.due_date}` : ''})`)
    .join('\n');

  const messages: { role: string; content: string }[] = [
    { role: 'system', content: UPDATE_SYSTEM_PROMPT },
    {
      role: 'system',
      content: `Current tasks:\n${taskListForAi || '(no active tasks)'}`,
    },
  ];

  for (const msg of conversationHistory.slice(-10)) {
    messages.push({ role: msg.role, content: msg.content });
  }

  messages.push({ role: 'user', content: text });

  const aiResponse = await callAI(env, {
    messages: messages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    max_tokens: 512,
    temperature: 0.2,
  });

  return parseAndApplyUpdate(env.DB, aiResponse.text, tasks);
}

async function parseAndApplyUpdate(
  db: D1Database,
  raw: string,
  availableTasks: Task[]
): Promise<{ task: Task | null; response: string }> {
  try {
    let jsonStr = raw.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch?.[1]) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr) as {
      task_id?: string | null;
      task_title?: string | null;
      changes?: Record<string, unknown>;
      response?: string;
    };

    if (!parsed.task_id || !parsed.changes || Object.keys(parsed.changes).length === 0) {
      return {
        task: null,
        response: parsed.response ?? "I'm not sure which task you mean. Could you be more specific?",
      };
    }

    // Verify the task exists
    const targetTask = availableTasks.find((t) => t.id === parsed.task_id);
    if (!targetTask) {
      return {
        task: null,
        response: "I couldn't find that task. It may have been archived or completed already.",
      };
    }

    // Build safe update input
    const changes: UpdateTaskInput = {};
    const c = parsed.changes;

    if (typeof c.status === 'string') {
      const validStatuses = ['backlog', 'todo', 'in_progress', 'review', 'done', 'archived'];
      if (validStatuses.includes(c.status)) {
        changes.status = c.status as UpdateTaskInput['status'];
      }
    }
    if (typeof c.priority === 'string') {
      const validPriorities = ['critical', 'high', 'medium', 'low', 'someday'];
      if (validPriorities.includes(c.priority)) {
        changes.priority = c.priority as UpdateTaskInput['priority'];
      }
    }
    if (typeof c.due_date === 'string' || c.due_date === null) {
      changes.due_date = c.due_date as string | null;
    }
    if (typeof c.title === 'string') {
      changes.title = c.title;
    }
    if (typeof c.description === 'string') {
      changes.description = c.description;
    }

    const updated = await updateTask(db, parsed.task_id, changes);

    return {
      task: updated,
      response: parsed.response ?? `✓ Updated "${targetTask.title}"`,
    };
  } catch {
    return {
      task: null,
      response: "Something went wrong processing that update. Could you try rephrasing?",
    };
  }
}
