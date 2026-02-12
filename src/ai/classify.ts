// Sift — Input Intent Classification
// Determines what the user wants: brain dump, query, update, or chat

import type { Env, InputIntent, ConversationMessage } from '../types';
import { callAI } from './provider';

const CLASSIFY_SYSTEM_PROMPT = `You are classifying the intent of a Telegram message sent to a task management bot.

Classify into exactly one of these categories:
- brain_dump: The user is dumping tasks, to-dos, things to remember, or actionable items
- query: The user is asking about their existing tasks, board state, or what's on their plate
- update: The user is updating a task status (marking done, changing priority, etc.)
- chat: The user is chatting, asking about the bot, or saying something non-task-related
- schedule: The user wants to set up a recurring task or reminder

Respond with a single JSON object. No markdown, no code fences.

Examples:
- "I need to fix the auth bug and also call the dentist" → {"intent": "brain_dump"}
- "what's on my plate today" → {"intent": "query"}
- "the stripe thing is done" → {"intent": "update"}
- "hey, how are you" → {"intent": "chat"}
- "remind me every Monday to review the board" → {"intent": "schedule"}
- "show me everything due this week" → {"intent": "query"}
- "bump the auth thing to critical" → {"intent": "update"}
- "ok so here's what I'm thinking for the launch..." → {"intent": "brain_dump"}

Response format: {"intent": "brain_dump" | "query" | "update" | "chat" | "schedule"}`;

/** Classify the intent of a user message */
export async function classifyIntent(
  env: Env,
  text: string,
  conversationHistory: ConversationMessage[]
): Promise<InputIntent> {
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
  ];

  // Include recent conversation for context (helps with "that one" / "it" references)
  for (const msg of conversationHistory.slice(-6)) {
    messages.push({ role: msg.role, content: msg.content });
  }

  messages.push({ role: 'user', content: text });

  const response = await callAI(env, {
    messages: messages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    max_tokens: 64,
    temperature: 0.1,
  });

  return parseIntent(response.text);
}

function parseIntent(raw: string): InputIntent {
  try {
    let jsonStr = raw.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch?.[1]) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr) as { intent?: string };
    const valid: InputIntent[] = ['brain_dump', 'query', 'update', 'chat', 'schedule'];
    if (parsed.intent && valid.includes(parsed.intent as InputIntent)) {
      return parsed.intent as InputIntent;
    }
  } catch {
    // Fall through to heuristic
  }

  return heuristicClassify(raw);
}

/** Fallback heuristic classification when AI parsing fails */
function heuristicClassify(text: string): InputIntent {
  const lower = text.toLowerCase();

  // Query patterns
  if (/\b(what|show|list|how many|which|where|when)\b.*\b(tasks?|todos?|board|plate|due|overdue|progress)\b/.test(lower)) {
    return 'query';
  }

  // Update patterns
  if (/\b(done|finished|completed|moved?|bump|change|archive|cancel)\b/.test(lower)) {
    return 'update';
  }

  // Schedule patterns
  if (/\b(every|remind|recurring|repeat|schedule|daily|weekly|monthly)\b/.test(lower)) {
    return 'schedule';
  }

  // Chat patterns
  if (/^(hey|hi|hello|thanks|thank you|how are you|what are you)\b/.test(lower)) {
    return 'chat';
  }

  // Default: treat as brain dump (safest — captures tasks)
  return 'brain_dump';
}
