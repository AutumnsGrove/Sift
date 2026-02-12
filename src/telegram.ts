// Sift — Telegram Bot API Helpers

import type { Env, TelegramUpdate } from './types';

const TELEGRAM_API = 'https://api.telegram.org/bot';

/** Send a text message to the configured chat */
export async function sendMessage(
  env: Env,
  text: string,
  options?: {
    parse_mode?: 'HTML' | 'MarkdownV2';
    reply_to_message_id?: number;
    reply_markup?: unknown;
  }
): Promise<Response> {
  const url = `${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: env.TELEGRAM_CHAT_ID,
    text,
    parse_mode: options?.parse_mode,
    reply_to_message_id: options?.reply_to_message_id,
    reply_markup: options?.reply_markup,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Telegram sendMessage failed: ${response.status} ${error}`);
  }

  return response;
}

/** Verify the incoming webhook request is from Telegram (timing-safe) */
export function verifyWebhook(request: Request, env: Env): boolean {
  const token = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!token || !env.TELEGRAM_WEBHOOK_SECRET) {
    return false;
  }
  // Timing-safe comparison to prevent timing attacks
  if (token.length !== env.TELEGRAM_WEBHOOK_SECRET.length) {
    return false;
  }
  const encoder = new TextEncoder();
  const a = encoder.encode(token);
  const b = encoder.encode(env.TELEGRAM_WEBHOOK_SECRET);
  return crypto.subtle.timingSafeEqual(a, b);
}

/** Parse a Telegram update from the request body */
export async function parseUpdate(request: Request): Promise<TelegramUpdate | null> {
  try {
    const body = await request.json();
    return body as TelegramUpdate;
  } catch {
    console.error('Failed to parse Telegram update');
    return null;
  }
}

/** Register the webhook URL with Telegram */
export async function registerWebhook(env: Env, webhookUrl: string): Promise<Response> {
  const url = `${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/setWebhook`;
  const body = {
    url: webhookUrl,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message'],
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return response;
}

/** Check if a chat ID matches the authorized user */
export function isAuthorizedChat(chatId: number, env: Env): boolean {
  return String(chatId) === env.TELEGRAM_CHAT_ID;
}
