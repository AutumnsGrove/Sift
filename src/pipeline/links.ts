// Sift — Link Processing Pipeline
// Fetches URL content, summarizes it, and extracts actionable tasks

import type { Env, ConversationMessage, TriagedTask } from '../types';
import { createTask } from '../db/tasks';
import { createDump, markDumpProcessed } from '../db/dumps';
import { getConversation, addMessage } from '../db/conversations';

const MAX_CONTENT_LENGTH = 15_000; // chars to feed to LLM
const FETCH_TIMEOUT_MS = 10_000;

const LINK_SYSTEM_PROMPT = `You are Sift, a personal task triage assistant. The user shared a URL. You've been given the page content (possibly truncated).

Your job:
1. Summarize what the page is about (2-3 sentences max)
2. Extract any actionable tasks the user might want to do based on this content
3. If it's an article/blog: the task might be "Read: [title]" or "Review: [topic]"
4. If it's a tool/product: the task might be "Try out [tool]" or "Evaluate [product]"
5. If it's a GitHub issue/PR: extract the action items
6. If it's a doc/reference: task might be "Study: [topic]" or just save as reference

For each task found, determine:
- title: concise, action-oriented (3-8 words)
- description: brief context from the page content
- priority: critical | high | medium | low | someday
- category: infer from content
- due_date: null unless there's a clear deadline mentioned
- tags: relevant keywords
- ai_notes: why this seems worth tracking

Respond with valid JSON only. No markdown, no code fences.

Response format:
{
  "summary": "Brief summary of the page content",
  "tasks": [
    {
      "title": "...",
      "description": "...",
      "priority": "...",
      "category": "...",
      "due_date": null,
      "tags": ["..."],
      "ai_notes": "..."
    }
  ],
  "response": "Conversational response with [⇗ From link] tag. Include the summary and extracted tasks. Use ● (critical/high) ◐ (medium) ○ (low/someday) symbols."
}`;

/** Process a URL message through the link pipeline */
export async function handleLinkMessage(
  env: Env,
  url: string,
  messageId: number
): Promise<string> {
  // Validate the URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url.trim());
  } catch {
    return "That doesn't look like a valid URL. Send me a link and I'll process it.";
  }

  // Only allow http/https
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return "I can only process HTTP/HTTPS links.";
  }

  // Get conversation context
  const history = await getConversation(env.DB);

  // Log the raw dump
  const dump = await createDump(env.DB, {
    telegram_message_id: String(messageId),
    input_type: 'link',
    raw_content: url,
  });

  // Fetch the page content
  const pageContent = await fetchPageContent(parsedUrl.href);

  if (!pageContent) {
    // Even if we can't fetch, create a task to review the link
    const task = await createTask(env.DB, {
      title: `Review: ${parsedUrl.hostname}${parsedUrl.pathname.slice(0, 50)}`,
      description: `Link: ${url}`,
      priority: 'low',
      source_type: 'link',
      raw_input: url,
      ai_notes: "Couldn't fetch the page content, saved the link for later.",
    });

    await markDumpProcessed(env.DB, dump.id, [task.id]);
    await addMessage(env.DB, 'user', `[shared a link] ${url}`);

    const response = `[⇗ From link] I couldn't fetch the content at that URL, but I saved it as a task to review later.\n\n○ Review: ${parsedUrl.hostname}`;
    await addMessage(env.DB, 'assistant', response);
    return response;
  }

  // Summarize and extract tasks via LLM
  const result = await processLinkWithAi(env, url, pageContent, history);

  // Create tasks
  const taskIds: string[] = [];
  for (const triaged of result.tasks) {
    const task = await createTask(env.DB, {
      title: triaged.title,
      description: triaged.description,
      priority: triaged.priority,
      category: triaged.category,
      due_date: triaged.due_date,
      tags: triaged.tags,
      source_type: 'link',
      raw_input: url,
      ai_notes: triaged.ai_notes,
    });
    taskIds.push(task.id);
  }

  // If no tasks were extracted, create a reference task
  if (taskIds.length === 0) {
    const task = await createTask(env.DB, {
      title: `Review: ${result.summary.slice(0, 80) || parsedUrl.hostname}`,
      description: `Link: ${url}\n\n${result.summary}`,
      priority: 'someday',
      source_type: 'link',
      raw_input: url,
    });
    taskIds.push(task.id);
  }

  await markDumpProcessed(env.DB, dump.id, taskIds);

  // Save conversation context
  await addMessage(env.DB, 'user', `[shared a link] ${url}`);
  await addMessage(env.DB, 'assistant', result.response);

  return result.response;
}

/** Fetch and extract text content from a URL */
async function fetchPageContent(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Sift/1.0 (Task Triage Bot)',
        'Accept': 'text/html,text/plain,application/json',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') ?? '';

    // Only process text-based content
    if (!contentType.includes('text/') && !contentType.includes('application/json')) {
      return null;
    }

    const text = await response.text();

    // Strip HTML tags for a rough text extraction
    const cleaned = stripHtml(text);

    // Truncate to fit in LLM context
    return cleaned.slice(0, MAX_CONTENT_LENGTH);
  } catch {
    return null;
  }
}

/** Strip HTML tags and collapse whitespace */
function stripHtml(html: string): string {
  return html
    // Remove script and style blocks entirely
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Remove HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

interface LinkResult {
  tasks: TriagedTask[];
  summary: string;
  response: string;
}

/** Process link content through the LLM */
async function processLinkWithAi(
  env: Env,
  url: string,
  content: string,
  conversationHistory: ConversationMessage[]
): Promise<LinkResult> {
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: LINK_SYSTEM_PROMPT },
  ];

  for (const msg of conversationHistory.slice(-6)) {
    messages.push({ role: msg.role, content: msg.content });
  }

  messages.push({
    role: 'user',
    content: `URL: ${url}\n\nPage content:\n${content}`,
  });

  const response = await env.AI.run(
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    {
      messages,
      max_tokens: 2048,
      temperature: 0.3,
    }
  );

  const responseText = typeof response === 'string'
    ? response
    : 'response' in response
      ? (response.response ?? '')
      : '';

  return parseLinkResponse(responseText, url);
}

/** Parse the LLM response for link processing */
function parseLinkResponse(raw: string, url: string): LinkResult {
  try {
    let jsonStr = raw.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch?.[1]) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr) as {
      summary?: string;
      tasks?: TriagedTask[];
      response?: string;
    };

    const tasks: TriagedTask[] = (parsed.tasks ?? []).map((t) => ({
      title: String(t.title ?? '').slice(0, 200),
      description: t.description ? String(t.description).slice(0, 1000) : undefined,
      priority: validatePriority(t.priority),
      category: t.category ? String(t.category).slice(0, 50) : undefined,
      due_date: t.due_date ? String(t.due_date) : undefined,
      tags: Array.isArray(t.tags) ? t.tags.map(String).slice(0, 10) : undefined,
      ai_notes: t.ai_notes ? String(t.ai_notes).slice(0, 500) : undefined,
    }));

    const summary = parsed.summary ?? '';

    // Ensure [⇗ From link] tag is in the response
    let response = parsed.response ?? formatDefaultLinkResponse(tasks, summary, url);
    if (!response.includes('⇗')) {
      response = `[⇗ From link] ${response}`;
    }

    return { tasks, summary, response };
  } catch {
    return {
      tasks: [],
      summary: '',
      response: `[⇗ From link] I fetched the page but had trouble extracting details. Saved the link for later.\n\n${url}`,
    };
  }
}

function validatePriority(p: unknown): TriagedTask['priority'] {
  const valid = ['critical', 'high', 'medium', 'low', 'someday'] as const;
  if (typeof p === 'string' && valid.includes(p as (typeof valid)[number])) {
    return p as TriagedTask['priority'];
  }
  return 'medium';
}

function formatDefaultLinkResponse(tasks: TriagedTask[], summary: string, url: string): string {
  const parts: string[] = [`[⇗ From link] ${url}`];

  if (summary) {
    parts.push(`\n${summary}`);
  }

  if (tasks.length > 0) {
    const prioritySymbol = (p: string) => {
      switch (p) {
        case 'critical':
        case 'high':
          return '●';
        case 'medium':
          return '◐';
        default:
          return '○';
      }
    };

    const lines = tasks.map(
      (t) => `${prioritySymbol(t.priority)} ${t.title}`
    );
    parts.push(`\n${lines.join('\n')}`);
    parts.push('\nSaved. Anything to adjust?');
  }

  return parts.join('');
}
