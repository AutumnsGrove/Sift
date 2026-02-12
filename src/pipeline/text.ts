// Sift — Text Message Processing Pipeline
// Handles classified text messages by routing to AI engines

import type { Env, InputIntent, ConversationMessage } from '../types';
import { triageBrainDump } from '../ai/triage';
import { queryTasks } from '../ai/query';
import { processUpdate } from '../ai/update';
import { processScheduleCreation } from '../ai/schedule';
import { generateSuggestion } from '../ai/suggest';
import { createTask, getActiveTasks } from '../db/tasks';
import { createDump, markDumpProcessed } from '../db/dumps';
import { getActiveSchedules, formatScheduleList } from '../db/schedules';

/** Handle a text message based on its classified intent */
export async function handleTextMessage(
  env: Env,
  text: string,
  intent: InputIntent,
  conversationHistory: ConversationMessage[]
): Promise<string> {
  switch (intent) {
    case 'brain_dump':
      return handleBrainDump(env, text, conversationHistory);

    case 'query':
      return handleQuery(env, text, conversationHistory);

    case 'update':
      return handleUpdate(env, text, conversationHistory);

    case 'schedule':
      return handleSchedule(env, text, conversationHistory);

    case 'chat':
      return handleChat(text);
  }
}

/** Process a brain dump: extract tasks, store dump and tasks */
async function handleBrainDump(
  env: Env,
  text: string,
  conversationHistory: ConversationMessage[]
): Promise<string> {
  // Log the raw dump
  const dump = await createDump(env.DB, {
    input_type: 'text',
    raw_content: text,
  });

  // Run AI triage
  const triage = await triageBrainDump(env, text, conversationHistory);

  // Create tasks from triage results
  const taskIds: string[] = [];
  for (const triaged of triage.tasks) {
    const task = await createTask(env.DB, {
      title: triaged.title,
      description: triaged.description,
      priority: triaged.priority,
      category: triaged.category,
      due_date: triaged.due_date,
      tags: triaged.tags,
      source_type: 'text',
      raw_input: text,
      ai_notes: triaged.ai_notes,
    });
    taskIds.push(task.id);
  }

  // Mark dump as processed
  await markDumpProcessed(env.DB, dump.id, taskIds);

  // Append proactive suggestion
  let response = triage.response;
  const suggestion = await getSuggestion(env, { type: 'create', taskCount: triage.tasks.length });
  if (suggestion) {
    response += `\n\n→ ${suggestion}`;
  }

  return response;
}

/** Process a query: generate SQL, execute, format results */
async function handleQuery(
  env: Env,
  text: string,
  conversationHistory: ConversationMessage[]
): Promise<string> {
  // Check for schedule-related queries
  const lower = text.toLowerCase();
  if (/\b(recurring|schedule|repeat|reminder)\b/.test(lower)) {
    const schedules = await getActiveSchedules(env.DB);
    return formatScheduleList(schedules);
  }

  const result = await queryTasks(env, text, conversationHistory);

  // Append proactive suggestion
  let response = result.response;
  const suggestion = await getSuggestion(env, { type: 'query' });
  if (suggestion) {
    response += `\n\n→ ${suggestion}`;
  }

  return response;
}

/** Process a task update: fuzzy match + apply changes */
async function handleUpdate(
  env: Env,
  text: string,
  conversationHistory: ConversationMessage[]
): Promise<string> {
  const result = await processUpdate(env, text, conversationHistory);

  // Append proactive suggestion
  let response = result.response;
  const suggestion = await getSuggestion(env, { type: 'update' });
  if (suggestion) {
    response += `\n\n→ ${suggestion}`;
  }

  return response;
}

/** Process schedule creation request */
async function handleSchedule(
  env: Env,
  text: string,
  conversationHistory: ConversationMessage[]
): Promise<string> {
  // Check for schedule management queries
  const lower = text.toLowerCase();

  if (/\b(show|list|what).*(recurring|schedule|reminder)\b/.test(lower)) {
    const schedules = await getActiveSchedules(env.DB);
    return formatScheduleList(schedules);
  }

  return processScheduleCreation(env, text, conversationHistory);
}

/** Handle casual chat */
function handleChat(text: string): string {
  const lower = text.toLowerCase().trim();

  if (/^(hey|hi|hello|yo)\b/.test(lower)) {
    return "Hey. What's on your mind? Dump it here and I'll sort it out.";
  }

  if (/\b(thanks|thank you|thx)\b/.test(lower)) {
    return "Anytime. What's next?";
  }

  if (/\b(help|what can you do|how do you work)\b/.test(lower)) {
    return [
      "I'm Sift. Pour your thoughts out and I'll organize them.",
      '',
      'You can:',
      '▸ Dump tasks — "I need to fix the auth bug and call the dentist"',
      '▸ Check your board — "what\'s on my plate today"',
      '▸ Update tasks — "the stripe thing is done"',
      '▸ Send photos — screenshots, whiteboards, receipts',
      '▸ Share links — I\'ll summarize and extract tasks',
      '▸ Set recurring — "every Monday, review the board"',
      '▸ Search — "what was that thing about the API"',
      '',
      'No commands needed. Just talk to me.',
    ].join('\n');
  }

  return "Not sure what to do with that. If it's a task, just dump it and I'll capture it. If you're asking about your board, try \"what's on my plate?\"";
}

/** Get a proactive suggestion (only fires when relevant) */
async function getSuggestion(
  env: Env,
  recentAction: { type: 'create' | 'update' | 'query'; taskCount?: number }
): Promise<string | null> {
  try {
    const activeTasks = await getActiveTasks(env.DB);
    return generateSuggestion(activeTasks, recentAction);
  } catch {
    return null;
  }
}
