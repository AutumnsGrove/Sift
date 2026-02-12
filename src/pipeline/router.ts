// Sift — Input Pipeline Router
// Classifies input type and intent, routes to appropriate handler

import type { Env, TelegramMessage } from '../types';
import { getConversation, addMessage } from '../db/conversations';
import { classifyIntent } from '../ai/classify';
import { handleTextMessage } from './text';
import { handlePhotoMessage } from './vision';
import { handleLinkMessage } from './links';

/** URL pattern: matches messages that are just a URL */
const URL_ONLY_PATTERN = /^https?:\/\/\S+$/;

/** Route an incoming Telegram message to the appropriate handler */
export async function routeMessage(env: Env, message: TelegramMessage): Promise<string> {
  // Determine input type
  if (message.voice) {
    // Phase 3: voice pipeline (still pending)
    return 'Voice notes are coming soon. For now, send me text and I\'ll sort it out.';
  }

  if (message.photo && message.photo.length > 0) {
    return handlePhotoMessage(env, message);
  }

  const text = message.text ?? message.caption;
  if (!text) {
    return "I didn't catch that. Send me text, and I'll help you sort it out.";
  }

  // Check for URL-only messages → link pipeline
  if (URL_ONLY_PATTERN.test(text.trim())) {
    return handleLinkMessage(env, text.trim(), message.message_id);
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
