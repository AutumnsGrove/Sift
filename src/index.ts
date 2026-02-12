// Sift — Cloudflare Worker Entry Point
// Telegram webhook handler + scheduled handler

import type { Env } from './types';
import { verifyWebhook, parseUpdate, sendMessage, registerWebhook, isAuthorizedChat } from './telegram';
import { routeMessage } from './pipeline/router';

export default {
  /** Handle incoming HTTP requests (Telegram webhooks + registration) */
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Webhook registration endpoint
    if (url.pathname === '/register') {
      return handleRegister(request, env);
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response('ok', { status: 200 });
    }

    // All other paths: Telegram webhook
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Reject oversized payloads (Telegram messages are small; 1MB is generous)
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 1_048_576) {
      return new Response('Payload too large', { status: 413 });
    }

    // Verify webhook authenticity
    if (!verifyWebhook(request, env)) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Parse the update
    const update = await parseUpdate(request);
    if (!update?.message) {
      return new Response('ok', { status: 200 });
    }

    const message = update.message;

    // Only respond to the authorized chat
    if (!isAuthorizedChat(message.chat.id, env)) {
      return new Response('ok', { status: 200 });
    }

    // Truncate excessively long text input (10K chars is far beyond normal)
    if (message.text && message.text.length > 10_000) {
      message.text = message.text.slice(0, 10_000);
    }

    // Process the message
    try {
      const response = await routeMessage(env, message);
      await sendMessage(env, response);
    } catch (err) {
      console.error('Error processing message:', err);
      await sendMessage(env, "Something went wrong on my end. Try again in a moment.");
    }

    return new Response('ok', { status: 200 });
  },

  /** Handle scheduled events (recurring tasks, daily digest) */
  async scheduled(
    _event: ScheduledEvent,
    _env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    // Phase 4: Schedule runner + daily digest
    // For now, this is a no-op placeholder
    console.log('Scheduled handler fired');
  },
};

/** Register the webhook URL with Telegram (requires webhook secret as query param) */
async function handleRegister(request: Request, env: Env): Promise<Response> {
  // Require the webhook secret as a query parameter to prevent unauthorized registration
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');
  if (!secret || secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const webhookUrl = `${url.origin}/webhook`;

  try {
    const result = await registerWebhook(env, webhookUrl);
    const body = await result.json();
    return new Response(JSON.stringify(body, null, 2), {
      status: result.ok ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: 'Failed to register webhook' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
