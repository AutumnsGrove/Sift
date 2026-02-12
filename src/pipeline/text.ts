// Sift — Text Message Processing Pipeline
// Handles classified text messages by routing to AI engines

import type { Env, InputIntent, ConversationMessage } from '../types';
import { triageBrainDump } from '../ai/triage';
import { queryTasks } from '../ai/query';
import { processUpdate } from '../ai/update';
import { createTask } from '../db/tasks';
import { createDump, markDumpProcessed } from '../db/dumps';

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
      // Phase 4: schedule creation
      return 'Recurring tasks are coming soon. For now, I can capture this as a one-time task if you\'d like.';

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

  return triage.response;
}

/** Process a query: generate SQL, execute, format results */
async function handleQuery(
  env: Env,
  text: string,
  conversationHistory: ConversationMessage[]
): Promise<string> {
  const result = await queryTasks(env, text, conversationHistory);
  return result.response;
}

/** Process a task update: fuzzy match + apply changes */
async function handleUpdate(
  env: Env,
  text: string,
  conversationHistory: ConversationMessage[]
): Promise<string> {
  const result = await processUpdate(env, text, conversationHistory);
  return result.response;
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
      '▸ Search — "what was that thing about the API"',
      '',
      'No commands needed. Just talk to me.',
    ].join('\n');
  }

  return "Not sure what to do with that. If it's a task, just dump it and I'll capture it. If you're asking about your board, try \"what's on my plate?\"";
}
