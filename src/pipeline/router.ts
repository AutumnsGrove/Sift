// Sift — Input Pipeline Router
// Classifies input type and intent, routes to appropriate handler

import type { Env, TelegramMessage } from '../types';
import { getConversation, addMessage } from '../db/conversations';
import { classifyIntent } from '../ai/classify';
import { handleTextMessage } from './text';

/** Route an incoming Telegram message to the appropriate handler */
export async function routeMessage(env: Env, message: TelegramMessage): Promise<string> {
  // Determine input type
  if (message.voice) {
    // Phase 3: voice pipeline
    return 'Voice notes are coming soon. For now, send me text and I\'ll sort it out.';
  }

  if (message.photo && message.photo.length > 0) {
    // Phase 3: vision pipeline
    return 'Photo processing is coming soon. You can describe what\'s in the image and I\'ll capture it.';
  }

  const text = message.text ?? message.caption;
  if (!text) {
    return "I didn't catch that. Send me text, and I'll help you sort it out.";
  }

  // Check for URL-only messages (Phase 3: link pipeline)
  const urlPattern = /^https?:\/\/\S+$/;
  if (urlPattern.test(text.trim())) {
    return 'Link processing is coming soon. Tell me what to do with this link and I\'ll capture it as a task.';
  }

  // Get conversation context
  const history = await getConversation(env.DB);

  // Classify intent
  const intent = await classifyIntent(env, text, history);

  // Route to handler
  const response = await handleTextMessage(env, text, intent, history);

  // Save conversation context
  await addMessage(env.DB, 'user', text);
  await addMessage(env.DB, 'assistant', response);

  return response;
}
