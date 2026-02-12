// Sift — Conversation Context Management

import type { Conversation, ConversationMessage } from '../types';

const MAX_MESSAGES = 20;
const CONVERSATION_ID = '_main'; // Single-user bot, one conversation

/** Get the current conversation context */
export async function getConversation(db: D1Database): Promise<ConversationMessage[]> {
  const row = await db
    .prepare('SELECT * FROM conversations WHERE id = ?')
    .bind(CONVERSATION_ID)
    .first<Conversation>();

  if (!row) {
    return [];
  }

  try {
    return JSON.parse(row.messages) as ConversationMessage[];
  } catch {
    return [];
  }
}

/** Add a message to the conversation and prune to MAX_MESSAGES */
export async function addMessage(
  db: D1Database,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  const messages = await getConversation(db);
  const newMessage: ConversationMessage = {
    role,
    content,
    timestamp: new Date().toISOString(),
  };

  messages.push(newMessage);

  // Keep only the most recent messages
  const pruned = messages.slice(-MAX_MESSAGES);
  const json = JSON.stringify(pruned);

  await db
    .prepare(
      `INSERT INTO conversations (id, messages, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         messages = excluded.messages,
         updated_at = excluded.updated_at`
    )
    .bind(CONVERSATION_ID, json)
    .run();
}

/** Clear the conversation context */
export async function clearConversation(db: D1Database): Promise<void> {
  await db
    .prepare(
      `UPDATE conversations
       SET messages = '[]', updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(CONVERSATION_ID)
    .run();
}

/** Format conversation for inclusion in LLM context */
export function formatConversationForAi(
  messages: ConversationMessage[]
): { role: string; content: string }[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}
