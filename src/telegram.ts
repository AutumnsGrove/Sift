// Sift — Telegram Bot API Helpers

import type { Env, TelegramUpdate } from './types';

const TELEGRAM_API = 'https://api.telegram.org/bot';

/** Send a text message to the configured chat with automatic retry on rate limits */
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

  return sendWithRetry(url, body);
}

/** Send a request to Telegram API with exponential backoff on rate limits */
async function sendWithRetry(
  url: string,
  body: Record<string, unknown>,
  attempt = 0
): Promise<Response> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  // Rate limited - retry with exponential backoff
  if (response.status === 429 && attempt < 3) {
    const retryAfter = parseInt(response.headers.get('Retry-After') ?? '1', 10);
    const delay = Math.max(retryAfter * 1000, 1000 * Math.pow(2, attempt));

    console.warn(`Rate limited by Telegram. Retrying after ${delay}ms (attempt ${attempt + 1}/3)`);
    await sleep(delay);
    return sendWithRetry(url, body, attempt + 1);
  }

  if (!response.ok) {
    const error = await response.text();
    console.error(`Telegram API failed: ${response.status} ${error}`);
  }

  return response;
}

/** Sleep for a given number of milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/** Get a file download URL from Telegram */
export async function getFileUrl(env: Env, fileId: string): Promise<string | null> {
  const url = `${TELEGRAM_API}${env.TELEGRAM_BOT_TOKEN}/getFile`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId }),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    ok: boolean;
    result?: { file_path?: string };
  };
  if (!data.ok || !data.result?.file_path) return null;

  return `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;
}

/** Download a file from Telegram as an ArrayBuffer */
export async function downloadFile(env: Env, fileId: string): Promise<ArrayBuffer | null> {
  const url = await getFileUrl(env, fileId);
  if (!url) return null;

  const response = await fetch(url);
  if (!response.ok) return null;

  return response.arrayBuffer();
}

/** Check if a chat ID matches the authorized user */
export function isAuthorizedChat(chatId: number, env: Env): boolean {
  return String(chatId) === env.TELEGRAM_CHAT_ID;
}
