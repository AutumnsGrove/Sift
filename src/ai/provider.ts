// Sift — AI Provider Abstraction
// Supports Cloudflare AI and OpenRouter with model switching

import type { Env } from '../types';

export type AIProvider = 'cloudflare' | 'openrouter';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface AIResponse {
  text: string;
  toolCalls?: AIToolCall[];
}

export interface AIRequestOptions {
  messages: AIMessage[];
  temperature?: number;
  max_tokens?: number;
  tools?: AITool[];
}

export interface AITool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Get current AI provider from config */
export async function getAIProvider(db: D1Database): Promise<AIProvider> {
  const result = await db
    .prepare('SELECT value FROM config WHERE key = ?')
    .bind('ai_provider')
    .first<{ value: string }>();

  return (result?.value as AIProvider) ?? 'cloudflare';
}

/** Get current AI model from config */
export async function getAIModel(db: D1Database): Promise<string> {
  const result = await db
    .prepare('SELECT value FROM config WHERE key = ?')
    .bind('ai_model')
    .first<{ value: string }>();

  return result?.value ?? 'llama-3.3-70b';
}

/** Get current vision model from config */
export async function getVisionModel(db: D1Database): Promise<string> {
  const result = await db
    .prepare('SELECT value FROM config WHERE key = ?')
    .bind('ai_vision_model')
    .first<{ value: string }>();

  return result?.value ?? 'llama-4-scout';
}

/** Set AI provider and model */
export async function setAIConfig(
  db: D1Database,
  provider: AIProvider,
  model: string,
  visionModel?: string
): Promise<void> {
  const stmt1 = db.prepare('INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime("now"))');

  await db.batch([
    stmt1.bind('ai_provider', provider),
    stmt1.bind('ai_model', model),
    ...(visionModel ? [stmt1.bind('ai_vision_model', visionModel)] : []),
  ]);
}

/** Call AI with the configured provider */
export async function callAI(
  env: Env,
  options: AIRequestOptions
): Promise<AIResponse> {
  const provider = await getAIProvider(env.DB);
  const model = await getAIModel(env.DB);

  if (provider === 'openrouter') {
    return callOpenRouter(env, model, options);
  } else {
    return callCloudflareAI(env, model, options);
  }
}

/** Call AI for vision tasks */
export async function callVisionAI(
  env: Env,
  prompt: string,
  imageBase64: string
): Promise<string> {
  const provider = await getAIProvider(env.DB);

  if (provider === 'openrouter') {
    // OpenRouter with Claude supports vision natively
    const model = await getAIModel(env.DB);
    const response = await callOpenRouterVision(env, model, prompt, imageBase64);
    return response.text;
  } else {
    // Cloudflare AI uses dedicated vision model
    const visionModel = await getVisionModel(env.DB);
    return callCloudflareVision(env, visionModel, prompt, imageBase64);
  }
}

/** Call Cloudflare AI */
async function callCloudflareAI(
  env: Env,
  model: string,
  options: AIRequestOptions
): Promise<AIResponse> {
  const cfModel = model.startsWith('@cf/') ? model : `@cf/meta/${model}-instruct-fp8-fast`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiResponse = await (env.AI as any).run(cfModel, {
    messages: options.messages,
    max_tokens: options.max_tokens ?? 1024,
    temperature: options.temperature ?? 0.7,
  });

  const text = typeof aiResponse === 'string'
    ? aiResponse
    : aiResponse?.response && typeof aiResponse.response === 'string'
      ? aiResponse.response
      : '';

  return { text };
}

/** Call Cloudflare AI for vision */
async function callCloudflareVision(
  env: Env,
  model: string,
  prompt: string,
  imageBase64: string
): Promise<string> {
  const cfModel = model.startsWith('@cf/') ? model : `@cf/meta/${model}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (env.AI as any).run(cfModel, {
    prompt,
    image: imageBase64.split(',')[1] ?? imageBase64, // Remove data URL prefix if present
    max_tokens: 1024,
  });

  if (typeof response === 'string') return response;
  if (typeof response === 'object' && response !== null) {
    if ('response' in response && typeof response.response === 'string') {
      return response.response;
    }
    if ('description' in response && typeof response.description === 'string') {
      return response.description;
    }
  }

  return String(response);
}

/** Call OpenRouter */
async function callOpenRouter(
  env: Env,
  model: string,
  options: AIRequestOptions
): Promise<AIResponse> {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/AutumnsGrove/Sift',
      'X-Title': 'Sift Task Bot',
    },
    body: JSON.stringify({
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 1024,
      tools: options.tools,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API failed: ${response.status} ${error}`);
  }

  const data = await response.json() as {
    choices: Array<{
      message: {
        content?: string;
        tool_calls?: Array<{
          function: {
            name: string;
            arguments: string;
          };
        }>;
      };
    }>;
  };

  const message = data.choices[0]?.message;
  const text = message?.content ?? '';

  const toolCalls = message?.tool_calls?.map((tc) => ({
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments),
  }));

  return { text, toolCalls };
}

/** Call OpenRouter with vision support */
async function callOpenRouterVision(
  env: Env,
  model: string,
  prompt: string,
  imageBase64: string
): Promise<AIResponse> {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  // Ensure imageBase64 has proper data URL format
  const imageUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/AutumnsGrove/Sift',
      'X-Title': 'Sift Task Bot',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API failed: ${response.status} ${error}`);
  }

  const data = await response.json() as {
    choices: Array<{
      message: {
        content?: string;
      };
    }>;
  };

  return { text: data.choices[0]?.message?.content ?? '' };
}

/** List available models for a provider */
export function listAvailableModels(provider: AIProvider): Record<string, string> {
  if (provider === 'openrouter') {
    return {
      'anthropic/claude-3.5-haiku': 'Claude 3.5 Haiku (fast, multimodal)',
      'anthropic/claude-3.5-sonnet': 'Claude 3.5 Sonnet (balanced, multimodal)',
      'anthropic/claude-3-opus': 'Claude 3 Opus (powerful, multimodal)',
      'openai/gpt-4o': 'GPT-4o (multimodal)',
      'openai/gpt-4o-mini': 'GPT-4o Mini (fast, multimodal)',
      'google/gemini-2.0-flash-exp': 'Gemini 2.0 Flash (multimodal)',
    };
  } else {
    return {
      'llama-3.3-70b': 'Llama 3.3 70B (text)',
      'llama-4-scout': 'Llama 4 Scout (vision)',
      'llama-3.2-11b-vision': 'Llama 3.2 11B (vision)',
    };
  }
}
